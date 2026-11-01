# Pipeline: Previous-Day Call Processing

Status: **Approved business rules; execution proposed (D-026).** This document holds the canonical **rules** for one daily run. They do not depend on the runtime. The step-by-step procedure the Claude Code scheduled task follows is `workflows/daily-post-call-run.md`, and it adds a PREFLIGHT step (connectors, settings, run lock, header guard). Items marked *OD-xx* depend on `open-decisions.md`; *R-xx* are validation risks in `scheduled-execution.md`.

Setting names written in capitals here (`DELIVERY_MODE`, `GO_LIVE_DATE`, `RECIPIENT_ALLOWLIST`, `TARGET_DATE`) are the keys `delivery_mode`, `go_live_date`, `recipient_allowlist`, `target_date_override` in `config/run-settings.yaml`.

```
FETCH RECORDS → FILTER PREVIOUS-DAY CALLS → CHECK ELIGIBILITY → CHECK DUPLICATES
   → ANALYSE TRANSCRIPT → GENERATE EMAIL → VALIDATE → SEND → UPDATE TRACKING
```

Two supporting steps wrap this sequence: **RECOVER** (reconcile uncertain sends and expired leases, right after fetch) and **RUN SUMMARY** (at the end).

## 1. Dates and timezone

- All date logic uses Asia/Kolkata. The timezone of the machine or environment running the scheduled task is **never** used. If a helper runs the calculation (OD-38), it must use `ZoneInfo("Asia/Kolkata")` explicitly; if the model calculates it, the run records both `run_date` and `target_date` in `RUN_STARTED` for audit (R-11).
- `run_date` = today's date in Asia/Kolkata at run start. `target_date = run_date − 1 day`.
  - Example: run at 31 Oct 2026 09:00 IST → `target_date = 2026-10-30`.
  - Example: run at 31 Oct 2026 00:30 IST (= 30 Oct 19:00 UTC) → `target_date = 2026-10-30` (a UTC-based calculation would wrongly give 29 Oct).
- `target_date` is computed **once** at run start and used for the whole run, even if the run crosses midnight.
- Manual override: `target_date_override: YYYY-MM-DD` in `config/run-settings.yaml` for reruns and backfills. It must be earlier than `run_date`; today or future dates are rejected (`CONFIG_ERROR`).
- **Call date** = the value of the `Date` column (A), interpreted in Asia/Kolkata. The time comes from the separate `Time of the call` column (B) and does not affect selection (verified, `source-sheet-profile.md`):
  - Verified: `Date` and `Time of the call` are real date/time cells, and the spreadsheet timezone is `Asia/Calcutta` (= Asia/Kolkata). The connector's `get_values` (observed) returns **formatted** values: `October 30, 2026` and `7:00 PM`. These are unambiguous because the month is spelled out. Underlying serial numbers are available through `get_spreadsheet` with grid data (observed) if ever needed. **Phase 1 correction:** the parser must first **trim and collapse whitespace, including a stray space before the comma** (10 historical cells look like `"October 14 , 2022 "`), then parse `MMMM d, yyyy` (month name spelled out). Anything still unparseable → `MISSING_CALL_DATETIME`. Empty date cells exist inside the data (rows 5230 and 6773); they are not call records.
  - Text dates are accepted only in ISO format (`YYYY-MM-DD`, optionally with time and offset) or one explicitly configured format. Anything ambiguous or unparseable → `MISSING_CALL_DATETIME`.
  - A value with an explicit offset is converted to Asia/Kolkata before taking the date.
- Calls dated `run_date` (today) or in the future are **ignored** in this run; they become targets tomorrow.

## 2. Stage by stage

### Stage 1 — FETCH RECORDS
- **Do not read the whole source worksheet.** A full read of even column A alone is ~307,000 characters (Phase 1, F2). Read a **bounded window** of the last `fetch_window_rows` rows (default 300; about 30 days at roughly 10 rows per day), dates first (column A only). **Coverage check:** the earliest parseable date in the window must be older than `target_date − discovery_lookback_days − 1 day`; otherwise extend the window upward and re-check. Dates are mostly ascending but **not strictly** (7 decreases in 15,454 rows), so never assume the sort order; only the coverage check protects against missing rows.
- Then read the other columns only for rows in the work queue, and transcripts **one record at a time**, only for records that passed the earlier eligibility checks (reading a transcript pulls customer content into the session, Phase 1 F3, R-12).
- Read the `POST_CALL_EMAIL_LOGS` worksheet (it is small and agent-owned), plus run configuration and skills.
- **Header guard:** row 1 must still have the verified headers A–AC and `POST_CALL_CALL_ID` in AD; otherwise `CONFIG_ERROR` (`call-id-strategy.md` §3).
- Build in-memory indexes: logs by `call_id` and `source_fingerprint`; source rows by `POST_CALL_CALL_ID`, `row_signature`, and each parsed Fathom URL (for the cross-row URL check).
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
- Every selected **call record** (date plus name or email) with an empty `POST_CALL_CALL_ID` gets a Call ID now through the write-safe procedure in `call-id-strategy.md` §6. This is the only write to the source sheet. A `PENDING` log row is created for each new Call ID with `call_date`, `target_date` and customer details. Existing valid IDs are never rewritten; duplicated or invalid IDs are handled per `call-id-strategy.md` §7.
- Placeholder rows (date only) are not call records: no Call ID, no log row, counted in the run summary.
- Source rows with an unparseable call date but a name or email are assigned a Call ID and logged once as `SKIPPED` `MISSING_CALL_DATETIME`, so they are visible rather than silently dropped. Historical rows outside the window are never back-filled or touched.
- **Terminal guard:** a Call ID whose log status is `SENT` or `SKIPPED` is never added to the queue. `SENT` rows are never re-read for processing.
- Queue order: oldest call date first, then call time. A per-run cap (`max_records_per_run`) bounds session length and Claude plan usage (R-09); records beyond the cap stay `PENDING` for the next run.
- Discovery lookback (D-018, default 2 days): with `discovery_lookback_days = N`, source A also includes call dates from `target_date − N` to `target_date`. This self-heals a missed or failed daily run. With `N = 0` the behaviour is strictly previous-day, and a missed day needs a manual `TARGET_DATE` rerun.

### Stage 3 — CHECK ELIGIBILITY
A dedicated, deterministic component (no LLM). Each record is checked **independently**, and returns exactly one result:

- `ELIGIBLE` — continue.
- `DEFER(reason)` — data may still arrive; stay `PENDING` with `pending_reason`, recheck next run.
- `SKIP(reason)` — terminal; `SKIPPED` with `reason_code`.

Checks (all evaluated; every failure is listed in `reason_detail`; a terminal failure always beats a deferrable one):

| # | Check | Fails as | Type |
|---|---|---|---|
| E1 | `Meeting Notes` matches a cancelled pattern (e.g. "call cancel") | `CALL_CANCELLED` | Terminal |
| E2 | `Meeting Notes` matches a no-show pattern (e.g. "customer not came") | `CUSTOMER_NO_SHOW` | Terminal |
| E3 | Customer opted out — *inactive: no opt-out column exists* | `CUSTOMER_OPTED_OUT` | Terminal |
| E4 | Call type is eligible — *inactive: no call-type column exists* (OD-10) | `CALL_TYPE_EXCLUDED` | Terminal |
| E5 | Customer name present | `MISSING_CUSTOMER_NAME` | Deferrable |
| E6 | Customer email present | `MISSING_CUSTOMER_EMAIL` | Deferrable |
| E7 | Customer email valid (single address, valid syntax) | `INVALID_CUSTOMER_EMAIL` | Deferrable |
| E8 | At least one Fathom URL present | `MISSING_FATHOM_URL` | Deferrable |
| E9 | **Every** token in `Recording URL` is a valid `https://fathom.video/share/<token>` (parsing in `data-model.md` §1.5). Several URLs are allowed (segments of one call, D-025). Any malformed token flags the row; valid ones are not emailed on their own | `INVALID_FATHOM_URL` | Deferrable |
| E10 | Every recording segment is shareable with the customer — verified links are `/share/` links; public visibility unconfirmed (OD-04) | `FATHOM_NOT_SHAREABLE` | Deferrable |
| E11 | Transcript present | `MISSING_TRANSCRIPT` | Deferrable |
| E12 | Transcript not truncated (near the 50,000-character cell limit or ends mid-word at the limit) | `TRANSCRIPT_POSSIBLY_TRUNCATED` | Terminal |
| E13 | Transcript meets minimum length (OD-10) | `TRANSCRIPT_TOO_SHORT` | Terminal |
| E14 | Call not older than `max_followup_age_days` | `CALL_TOO_OLD` | Terminal |
| E15 | Recipient allowed (`test` delivery mode only) | `RECIPIENT_NOT_ALLOWLISTED` | Terminal |
| E16 | `Recording Sent` is `yes` (any case) → an executive already sent the recording | `RECORDING_ALREADY_SENT` | Terminal |
| E17 | `Recording Sent` holds an unrecognised value (not yes/no/empty) | `RECORDING_SENT_STATUS_UNCLEAR` | Terminal |
| E18 | In `live` mode, the call date is on or after `GO_LIVE_DATE`. Earlier calls belong to the manual process | `BEFORE_GO_LIVE` | Terminal |

**`Recording Sent` rule (D-022).** An empty cell does **not** prove that no email was sent. The agent may send only when **both** hold: (1) `Recording Sent` is not `yes` or unrecognised, **and** (2) the call date is on or after `GO_LIVE_DATE`, the date from which executives have stopped manual sending. Condition (2), not the empty cell, is what makes the agent the designated sender. The column is re-read right before sending (Stage 8).

**Deferral lifecycle (waiting for late transcripts or other data):**
- First deferral sets `pending_reason`, `pending_until = (run_date of first deferral + transcript_wait_days)` at 23:59:59 IST (D-019: `transcript_wait_days = 1`), and `recheck_count = 0`. Basing it on the first deferral rather than the call date gives calls found late (lookback) the same waiting time.
- Each later run re-reads the **current** source row and re-runs eligibility **first**; `recheck_count += 1`, `last_checked_at` updated.
- Data arrives → `ELIGIBLE` → processing continues in the same run (pending fields cleared). This applies even if `pending_until` has just passed: eligibility is always checked before expiry.
- Still missing and the run starts after `pending_until` → `SKIPPED` with the same code (e.g. `MISSING_TRANSCRIPT`), event `WAIT_EXPIRED`, `reason_detail` noting the wait window expired after N checks.
- Example (wait = 1 day): call on 30 Oct. The 31 Oct run defers it (`pending_until = 1 Nov 23:59:59`). The 1 Nov run rechecks it (and so would an optional 15:00 run). If the transcript lands any time before the 2 Nov run, that run sends the email; otherwise the 2 Nov run closes it as `SKIPPED` `MISSING_TRANSCRIPT`.
- Missing transcripts are therefore **recorded as pending, never silently discarded**, and a transcript that arrives later is processed in a later run.

**Cancelled calls and no-shows** are detected in two places:
1. Deterministically from the `Meeting Notes` text (E1, E2). The sheet has no structured status: `Customer Not Came` and `Cancel` columns exist but are unused. Patterns are listed in `source-sheet-profile.md` §6 and need confirmation (OD-26). Matching is case-insensitive on the trimmed text; anything not matching is `unknown` and proceeds.
2. By transcript analysis (Stage 5): a transcript showing the customer never joined → `CUSTOMER_NO_SHOW`; greetings only / wrong number → `INSUFFICIENT_CONTENT`.

A no-show with no transcript and no `call_status` waits for the deferral window and then ends `SKIPPED` `MISSING_TRANSCRIPT`. It never receives an email.

### Stage 4 — CHECK DUPLICATES
Runs after eligibility because these checks need a valid email and a parsed URL list.
- Call ID already `SENT` in the logs → `SKIPPED` `DUPLICATE_ALREADY_SENT` (defensive; the terminal guard should already prevent this).
- The same Call ID appears in more than one source row → `SKIPPED` `DUPLICATE_CALL_ID_IN_SOURCE` (`call-id-strategy.md` §7).
- **Phase 3 (D-036, proposed):** no Call ID exists. Duplicate detection uses the record fingerprint (normalised Call Date + Call Time + Customer Email) against the draft spreadsheet and the snapshot. Same customer, same day, different times = separate calls (separate drafts and rows). Already-drafted fingerprint with the same recording URLs: no new row, no overwrite. Exact collision: flag for review (`FINGERPRINT_COLLISION`), no draft, nothing merged or discarded; this replaces the automatic `DUPLICATE_SOURCE_ROW` skip below while Phase 3 lasts. Details: `docs/phase3-draft-destination.md` section 6. (email + date + time) is `SENT`, `SENDING`, `VALIDATING` or `PROCESSING`, or is an earlier row in the same snapshot → `SKIPPED` `DUPLICATE_SOURCE_ROW`.
- **Duplicate entry:** another Call ID with the same `source_fingerprint` (email + date + time) is `SENT`, `SENDING`, `VALIDATING` or `PROCESSING`, or is an earlier row in the same snapshot → `SKIPPED` `DUPLICATE_SOURCE_ROW`.
- **Shared recording URL across rows:** a URL in this row's `fathom_urls` also appears in any other source row with a **different** fingerprint. The rows are **not** assumed to be the same call; each keeps its own Call ID. Because emailing another customer's recording would be a privacy breach, this row → `SKIPPED` `RECORDING_URL_CONFLICT`, with the other Call ID(s) in `reason_detail` for human review. The other row gets the same treatment when it is evaluated, unless it is already `SENT` (OD-31).
- Duplicate URLs **within one cell** are not a duplicate call; they were already deduplicated during parsing (D-025).
- Passed → **claim**: `PENDING → PROCESSING` with lease, `attempt_count += 1`.

Stages 2–4 only *evaluate* against the snapshot. A record's log row is written only with the outcome (deferral update, skip, or claim). This keeps an early-stage outcome to one write, and no lease is needed until the claim.

### Stage 5 — ANALYSE TRANSCRIPT
- `transcript-analysis` skill → `AnalysisResult`.
- `skip_recommendation.skip` → `SKIPPED` with its code (`TRANSCRIPT_INCOMPLETE`, `INSUFFICIENT_CONTENT`, `CUSTOMER_NO_SHOW`, `NOT_A_SUPPORT_CALL`, `MULTIPLE_CUSTOMERS_AMBIGUOUS`, `SENSITIVE_TOPIC_REQUIRES_HUMAN`, `ANALYSIS_LOW_CONFIDENCE`, `LANGUAGE_UNSUPPORTED`).

### Stage 6 — GENERATE EMAIL
- `customer-summary` skill → `CustomerSummary`, then `email-generation` skill → `EmailDraft`. The generator receives the ordered `fathom_urls`; one call always produces **one** email, whatever the number of segments (D-025).
- Store `transcript_hash` and `fathom_urls` in the log. `PROCESSING → VALIDATING`.

### Stage 7 — VALIDATE
- Deterministic checks, then the `email-validation` skill (`validation-rules.md`).
- Fail → `SKIPPED` `VALIDATION_FAILED`. The draft body is stored in the log (clearly not sent) for quality review.
- Pass in `shadow` mode → `SKIPPED` `DRAFT_ONLY_MODE`. The draft is stored in `email_body` (and optionally as a Gmail draft, OD-34). Nothing is sent to the customer. Pass in `dry_run` mode → same outcome without any Gmail call.

### Stage 8 — SEND (`test` and `live` modes only)
- **Pre-send re-read of the log row:** still ours, still no `gmail_message_id`, no duplicate `SENT`.
- **Pre-send re-read of the source row** (found by `POST_CALL_CALL_ID`):
  - `Recording Sent` is now `yes` or unrecognised → `SKIPPED` (`RECORDING_ALREADY_SENT` / `RECORDING_SENT_STATUS_UNCLEAR`).
  - The parsed `fathom_urls`, the transcript hash, or the email address differ from what was generated → back to `PENDING` (event `SOURCE_CHANGED`); regenerated on the next run.
  - The Call ID is no longer in exactly one row → `SKIPPED` (`DUPLICATE_CALL_ID_IN_SOURCE`) or `SOURCE_ROW_MISSING`.
- Write-ahead: `VALIDATING → SENDING` with `send_attempt_id`, `email_subject`, `email_body`, `send_started_at`. If this write fails, no send.
- Send via Gmail. In `test` mode only allowlisted internal recipients are possible (E15).

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
| `CONFIG_ERROR` (invalid run settings, missing skill file, bad `TARGET_DATE`, header guard failure) | Abort before processing |
| `CONNECTOR_UNAVAILABLE` (Sheets, or Gmail in `test`/`live`) | Abort before processing |
| Another run holds the run lock (R-08) | Abort before processing (`RUN_ABORTED`) |
| Source or log sheet unreadable at Stage 1 | Abort before processing |
| `GMAIL_AUTH_ERROR` | Current record `FAILED`; no further records are claimed (all sends would fail); unclaimed records stay `PENDING` |
| Circuit breaker: 3 consecutive connector or model failures | No further records are claimed; event `PROCESSING_HALTED`; unclaimed records stay `PENDING` |
| Session ends unexpectedly (timeout, usage limit) | Nothing more happens in this run; the next run's RECOVER restores states (R-06) |

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
| Gmail outcome unknown | `SENDING` + `send_attempt_id` → positive confirmation only (returned ID, or exactly one matching Sent message) → `SENT`; otherwise `FAILED` `SEND_UNCONFIRMED` and **human review** (OD-41). Never auto-resent; resent only after a human records `CONFIRMED_NOT_SENT` |

## 6. Configuration (`config/run-settings.yaml`)

| Setting | Proposed default | Decision |
|---|---|---|
| `timezone` | `Asia/Kolkata` | D-009 |
| `target_date_offset_days` | `1` (previous day) | D-013 |
| `discovery_lookback_days` | `2` | D-018 (0 would mean strictly previous day) |
| `transcript_wait_days` | `1` | D-019 |
| `max_followup_age_days` | `7` | OD-10 |
| `max_records_per_run` | `25` | R-09 |
| `delivery_mode` | `dry_run` | D-022 (`dry_run` / `test` / `shadow` / `live`) |
| `go_live_date` | unset (required in `live`) | D-022, date set at go-live (OD-34) |
| `recipient_allowlist` | empty | Required in `test` mode |
| `target_date_override` | unset | Manual override only |

## 7. Delivery modes and the manual-to-automated transition (D-022)

| Mode | Used in | Reads real sheet | Writes Call IDs (AD) | Gmail | Customer receives email |
|---|---|---|---|---|---|
| `dry_run` | Phase 1–3 | Read-only (Phase 1 validation; Phase 3 real `Calls DONE`) or synthetic fixtures (Phase 2) | None, except Phase 3 (approved): validated drafts and skip/failure records to the dedicated draft spreadsheet only (`phase3-draft-destination.md`, D-035) | None (Gmail disabled) | Never |
| `test` | Phase 4 | Test copy only | Test copy only | Drafts or sends to `RECIPIENT_ALLOWLIST` (internal) only | Never |
| `shadow` | Phase 5 | Yes | Yes (approved) | None (drafts stored in the logs; Gmail drafts optional, OD-34) | **Never.** The manual process continues unchanged |
| `live` | Phase 6 go-live onwards | Yes | Yes | Sends | Yes, for calls on/after `GO_LIVE_DATE` that pass every check |

Transition steps:

1. **Before go-live:** executives keep sending recordings manually and marking `Recording Sent`. The agent runs in `shadow` mode: real analysis, drafts in the log, no customer emails.
2. **Go-live decision:** the team agrees a `GO_LIVE_DATE` (a call date). From that call date on, executives stop manual sending.
3. **Cut-over:** `delivery_mode: live` and `go_live_date` set in `config/run-settings.yaml`. Calls dated before it are skipped as `BEFORE_GO_LIVE`, because they belong to the manual process.
4. **After go-live:** the agent is the designated sender. `Recording Sent = yes` is still honoured (an executive may still send by habit), and re-checked right before each send.
5. **Rollback:** setting `delivery_mode: shadow` stops customer sends from the next run; executives resume the manual process. (If a run is in progress, it finishes under the mode it read at PREFLIGHT.)

The agent never writes `Recording Sent`. Its sends are recorded in `POST_CALL_EMAIL_LOGS` only. Whether team reports that rely on `Recording Sent` need adjusting is OD-35.
