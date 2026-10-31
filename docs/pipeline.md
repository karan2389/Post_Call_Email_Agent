# Pipeline: Previous-Day Call Processing

Status: **Proposed design — awaiting approval.** This document is the canonical description of what one scheduled run does. Items marked *OD-xx* depend on `open-decisions.md`.

```
FETCH RECORDS → FILTER PREVIOUS-DAY CALLS → CHECK ELIGIBILITY → CHECK DUPLICATES
   → ANALYSE TRANSCRIPT → GENERATE EMAIL → VALIDATE → SEND → UPDATE TRACKING
```

Two supporting steps wrap this sequence: **RECOVER** (reconcile uncertain sends and expired leases, right after fetch) and **RUN SUMMARY** (at the end).

## 1. Dates and timezone

- All date logic uses `zoneinfo.ZoneInfo("Asia/Kolkata")`. The server/container timezone is **never** used (no naive `datetime.now()`, no `date.today()`).
- `run_date` = today's date in Asia/Kolkata at run start. `target_date = run_date − 1 day`.
  - Example: run at 31 Oct 2026 09:00 IST → `target_date = 2026-10-30`.
  - Example: run at 31 Oct 2026 00:30 IST (= 30 Oct 19:00 UTC) → `target_date = 2026-10-30` (a UTC-based calculation would wrongly give 29 Oct).
- `target_date` is computed **once** at run start and used for the whole run, even if the run crosses midnight.
- Manual override: `TARGET_DATE=YYYY-MM-DD` (environment/CLI) for reruns and backfills. It must be earlier than `run_date`; today or future dates are rejected (`CONFIG_ERROR`).
- **Call date** = the date part of the record's call datetime, interpreted in Asia/Kolkata:
  - Read Sheets values with `valueRenderOption=UNFORMATTED_VALUE` and `dateTimeRenderOption=SERIAL_NUMBER`, so real date cells arrive as serial numbers (no dd/mm vs mm/dd ambiguity). Serial numbers are interpreted in the spreadsheet's timezone, which must be set to Asia/Kolkata (OD-28).
  - Text dates are accepted only in ISO format (`YYYY-MM-DD`, optionally with time and offset) or one explicitly configured format. Anything ambiguous or unparseable → `MISSING_CALL_DATETIME`.
  - A value with an explicit offset is converted to Asia/Kolkata before taking the date.
- Calls dated `run_date` (today) or in the future are **ignored** in this run; they become targets tomorrow.

## 2. Stage by stage

### Stage 1 — FETCH RECORDS
- Read the full source worksheet and the full `POST_CALL_EMAIL_LOGS` worksheet once (snapshot), plus run configuration and skills.
- Build in-memory indexes of the logs by `call_id`, `source_fingerprint` and `fathom_recording_id`.
- Failure to read either sheet → run aborts before touching any record (`SHEETS_API_ERROR`, event `RUN_ABORTED`). Nothing is lost: the next run starts again.

### Stage 1b — RECOVER
Before any new work (details in `delivery-state-machine.md` §5):
- `SENDING` rows → reconcile with Gmail (uncertain-send handling).
- `PROCESSING` / `VALIDATING` rows with expired leases → back to `PENDING`.
- `FAILED` rows with a retryable reason → back to `PENDING` if attempts and age allow.

### Stage 2 — FILTER PREVIOUS-DAY CALLS
Builds the run's **work queue** from three sources:

| Source | Selection |
|---|---|
| **A. New target-date calls** | Source rows whose call date = `target_date` (or within the lookback range, D-018) and whose Call ID is not yet in the logs |
| **B. Waiting records** | All log rows in `PENDING` with a `pending_reason` (e.g. transcript not yet available) — including those whose `pending_until` has passed, so they are rechecked one last time and then closed |
| **C. Retry records** | Log rows returned to `PENDING` by Stage 1b |

Rules:
- Every selected source row gets a stable Call ID now if it lacks one (`call-id-strategy.md`); a `PENDING` log row is created for each new Call ID with `call_date`, `target_date` and customer details.
- Source rows with a missing or unparseable call date cannot be matched to a date. They are assigned a Call ID and logged once as `SKIPPED` `MISSING_CALL_DATETIME`, so they are visible rather than silently dropped. (Only rows added since go-live are considered — historical rows are not back-filled.)
- **Terminal guard:** a Call ID whose log status is `SENT` or `SKIPPED` is never added to the queue. `SENT` rows are never re-read for processing.
- Queue order: oldest call date first, then call time. A per-run cap (`max_records_per_run`) protects the job timeout; records beyond the cap stay `PENDING` for the next run.
- Discovery lookback (D-018, default 2 days): with `discovery_lookback_days = N`, source A also includes call dates from `target_date − N` to `target_date`. This self-heals a missed or failed daily run. With `N = 0` the behaviour is strictly previous-day, and a missed day needs a manual `TARGET_DATE` rerun.

### Stage 3 — CHECK ELIGIBILITY
A dedicated, deterministic component (no LLM). Each record is checked **independently**, and returns exactly one result:

- `ELIGIBLE` — continue.
- `DEFER(reason)` — data may still arrive; stay `PENDING` with `pending_reason`, recheck next run.
- `SKIP(reason)` — terminal; `SKIPPED` with `reason_code`.

Checks (all evaluated; every failure is listed in `reason_detail`; a terminal failure always beats a deferrable one):

| # | Check | Fails as | Type |
|---|---|---|---|
| E1 | `call_status` is cancelled | `CALL_CANCELLED` | Terminal |
| E2 | `call_status` is no-show | `CUSTOMER_NO_SHOW` | Terminal |
| E3 | Customer opted out | `CUSTOMER_OPTED_OUT` | Terminal |
| E4 | Call type is eligible (OD-10) | `CALL_TYPE_EXCLUDED` | Terminal |
| E5 | Customer name present | `MISSING_CUSTOMER_NAME` | Deferrable |
| E6 | Customer email present | `MISSING_CUSTOMER_EMAIL` | Deferrable |
| E7 | Customer email valid (single address, valid syntax) | `INVALID_CUSTOMER_EMAIL` | Deferrable |
| E8 | Fathom URL present | `MISSING_FATHOM_URL` | Deferrable |
| E9 | Fathom URL valid (HTTPS, allowed Fathom host) | `INVALID_FATHOM_URL` | Deferrable |
| E10 | Fathom recording shareable with the customer (OD-04) | `FATHOM_NOT_SHAREABLE` | Deferrable |
| E11 | Transcript present | `MISSING_TRANSCRIPT` | Deferrable |
| E12 | Transcript not truncated (near the 50,000-character cell limit or ends mid-word at the limit) | `TRANSCRIPT_POSSIBLY_TRUNCATED` | Terminal |
| E13 | Transcript meets minimum length (OD-10) | `TRANSCRIPT_TOO_SHORT` | Terminal |
| E14 | Call not older than `max_followup_age_days` | `CALL_TOO_OLD` | Terminal |
| E15 | Recipient allowed (allowlist mode in test/pilot only) | `RECIPIENT_NOT_ALLOWLISTED` | Terminal |

**Deferral lifecycle (waiting for late transcripts or other data):**
- First deferral sets `pending_reason`, `pending_until = (run_date of first deferral + transcript_wait_days)` at 23:59:59 IST (D-019: `transcript_wait_days = 1`), and `recheck_count = 0`. Basing it on the first deferral rather than the call date gives calls found late (lookback) the same waiting time.
- Each later run re-reads the **current** source row and re-runs eligibility **first**; `recheck_count += 1`, `last_checked_at` updated.
- Data arrives → `ELIGIBLE` → processing continues in the same run (pending fields cleared). This applies even if `pending_until` has just passed: eligibility is always checked before expiry.
- Still missing and the run starts after `pending_until` → `SKIPPED` with the same code (e.g. `MISSING_TRANSCRIPT`), event `WAIT_EXPIRED`, `reason_detail` noting the wait window expired after N checks.
- Example (wait = 1 day): call on 30 Oct. The 31 Oct run defers it (`pending_until = 1 Nov 23:59:59`). The 1 Nov run rechecks it (and so would an optional 15:00 run). If the transcript lands any time before the 2 Nov run, that run sends the email; otherwise the 2 Nov run closes it as `SKIPPED` `MISSING_TRANSCRIPT`.
- Missing transcripts are therefore **recorded as pending, never silently discarded**, and a transcript that arrives later is processed in a later run.

**Cancelled calls and no-shows** are detected in two places:
1. Deterministically via the source `call_status` column (E1, E2), if the sheet provides it (OD-26).
2. By transcript analysis (Stage 5): a transcript showing the customer never joined → `CUSTOMER_NO_SHOW`; greetings only / wrong number → `INSUFFICIENT_CONTENT`.

A no-show with no transcript and no `call_status` waits for the deferral window and then ends `SKIPPED` `MISSING_TRANSCRIPT`. It never receives an email.

### Stage 4 — CHECK DUPLICATES
Runs after eligibility because the fingerprint needs a present, valid email and URL.
- Call ID already `SENT` in the logs → `SKIPPED` `DUPLICATE_ALREADY_SENT` (defensive; the terminal guard should already prevent this).
- Another Call ID with the same `source_fingerprint` or the same `fathom_recording_id` is `SENT`, `SENDING`, `VALIDATING` or `PROCESSING` → `SKIPPED` `DUPLICATE_SOURCE_ROW`.
- Passed → **claim**: `PENDING → PROCESSING` with lease, `attempt_count += 1`.

Stages 2–4 only *evaluate* against the snapshot. A record's log row is written only with the outcome (deferral update, skip, or claim). This keeps an early-stage outcome to one write, and no lease is needed until the claim.

### Stage 5 — ANALYSE TRANSCRIPT
- `transcript-analysis` skill → `AnalysisResult`.
- `skip_recommendation.skip` → `SKIPPED` with its code (`TRANSCRIPT_INCOMPLETE`, `INSUFFICIENT_CONTENT`, `CUSTOMER_NO_SHOW`, `NOT_A_SUPPORT_CALL`, `MULTIPLE_CUSTOMERS_AMBIGUOUS`, `SENSITIVE_TOPIC_REQUIRES_HUMAN`, `ANALYSIS_LOW_CONFIDENCE`, `LANGUAGE_UNSUPPORTED`).

### Stage 6 — GENERATE EMAIL
- `customer-summary` skill → `CustomerSummary`, then `email-generation` skill → `EmailDraft`.
- `PROCESSING → VALIDATING`.

### Stage 7 — VALIDATE
- Deterministic checks, then the `email-validation` skill (`validation-rules.md`).
- Fail → `SKIPPED` `VALIDATION_FAILED`. The draft body is stored in the log (clearly not sent) for quality review.

### Stage 8 — SEND
- Pre-send re-read of the log row (still ours, still no `gmail_message_id`, no duplicate `SENT`).
- Write-ahead: `VALIDATING → SENDING` with `rfc822_message_id`, `email_subject`, `email_body`, `send_started_at`. If this write fails, no send.
- Send via Gmail.

### Stage 9 — UPDATE TRACKING
- Success → `SENT` with `gmail_message_id`, `gmail_thread_id`, `sent_at`, final email body, customer information and all timestamps (retried with backoff).
- Definite rejection → `FAILED` `GMAIL_SEND_ERROR`; transient → `FAILED` `GMAIL_TRANSIENT_ERROR` (retryable).
- If the `SENT` write keeps failing, the row stays `SENDING` and the next run's RECOVER step reconciles it.

Tracking is written at **every** state change, not only here. Stage 9 is the final write that completes the record.

### Stage 10 — RUN SUMMARY
- `RUN_FINISHED` event with `run_id`, `target_date`, and counts: discovered, deferred, skipped by reason, failed by reason, sent, reconciled.
- Logs contain counts and IDs only.

## 3. Failure isolation

- Each record is processed inside its own error boundary. An exception for one record → that record becomes `FAILED` with a reason code; the run **continues with the next record**.
- Only these conditions stop the whole run:

| Condition | Effect |
|---|---|
| `CONFIG_ERROR` (missing model ID, skill file, bad `TARGET_DATE`) | Abort before processing |
| Source or log sheet unreadable at Stage 1 | Abort before processing |
| `GMAIL_AUTH_ERROR` | Current record `FAILED`; no further records are claimed (all sends would fail); unclaimed records stay `PENDING` |
| Circuit breaker: `llm_failure_threshold` consecutive LLM failures (proposal: 3) | No further records are claimed; event `PROCESSING_HALTED`; unclaimed records stay `PENDING` |

Unclaimed records are untouched, so stopping early never loses or corrupts work.

## 4. Running more than once

The job is safe to run any number of times for the same day, or concurrently by mistake:

| Situation | Result |
|---|---|
| Second run on the same day | Same `target_date`. Already-logged Call IDs are not re-created. `SENT`/`SKIPPED` untouched. `PENDING` records rechecked (late transcripts picked up). |
| Manual rerun with `TARGET_DATE` | Same rules; only unprocessed or waiting records act |
| Overlapping executions | Prevented by single-execution config; leases are the second line of defence |
| Run crashed mid-way | RECOVER on the next run restores consistent states; uncertain sends are reconciled, never blindly resent |

## 5. Uncertain sends and retries (summary)

| Problem | Mechanism |
|---|---|
| Transcript or data not yet available | Deferral: `PENDING` + `pending_reason`, rechecked each run until `pending_until` |
| LLM / Sheets / Gmail transient error | `FAILED` (retryable) → back to `PENDING` on a later run, up to `max_attempts`, and only while the call is within `max_followup_age_days` |
| Gmail outcome unknown | `SENDING` + deterministic Message-ID → Gmail reconciliation → `SENT` or `FAILED` `SEND_UNCONFIRMED` (never auto-resent) |

## 6. Configuration introduced by this design

| Setting | Proposed default | Decision |
|---|---|---|
| `timezone` | `Asia/Kolkata` | D-009 |
| `target_date_offset_days` | `1` (previous day) | D-013 |
| `discovery_lookback_days` | `2` | D-018 (0 would mean strictly previous day) |
| `transcript_wait_days` | `1` | D-019 |
| `max_followup_age_days` | `7` | OD-10 |
| `max_records_per_run` | `50` | Phase 1 |
| `llm_failure_threshold` | `3` | Phase 2 |
| `TARGET_DATE` | unset | Manual override only |
