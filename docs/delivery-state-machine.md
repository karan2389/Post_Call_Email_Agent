# Delivery State Machine, Idempotency and Recovery

Status: **Approved design**, including the `SENDING` state (D-017).

## 1. States

| State | Meaning | Terminal? |
|---|---|---|
| `PENDING` | Call discovered, Call ID assigned, waiting to be processed. If `pending_reason` is set, the record is **waiting for data** (e.g. transcript not yet available) and is rechecked each run until `pending_until` | No |
| `PROCESSING` | Claimed by a run: eligibility, analysis, summary, generation | No |
| `VALIDATING` | Draft exists; deterministic and semantic validation running | No |
| `SENDING` | Validation passed; `send_attempt_id` recorded; Gmail send in progress (or result unknown) | No |
| `SENT` | Gmail accepted the message; Gmail message ID recorded | **Yes** |
| `SKIPPED` | Not sent for a data, policy or content reason | **Yes** (manual reprocess only, OD-20) |
| `FAILED` | Technical failure; may be retried | No, until retry limit |

**Why `SENDING` is proposed.** Without it, a crash between Gmail accepting the email and the tracking sheet recording `SENT` leaves the row in `VALIDATING`, which looks identical to "validation never finished — safe to redo". That is exactly the duplicate-send case. `SENDING` marks "an email may have left" so recovery knows it must reconcile with Gmail before doing anything else. If the user prefers six states, the same information can be carried by `VALIDATING` + a non-empty `send_started_at`, but an explicit state is clearer for operators and the dashboard.

## 2. Transitions

```
            (discovered)
                 │
                 ▼            ┌─ DEFER: data missing, recheck next run (pending_reason)
             PENDING ◄────────┘◄────── lease expired in PROCESSING / VALIDATING
                 │  └──► SKIPPED       FAILED (retryable, attempts < max, call not too old)
                 │      (eligibility/duplicate skip, or wait window expired)
          claim  │
                 ▼
           PROCESSING ──► SKIPPED   (eligibility / analysis skip)
                 │   └──► FAILED    (LLM error, invalid output, config)
                 ▼
           VALIDATING ──► SKIPPED   (VALIDATION_FAILED)
                 │   └──► FAILED    (validator technical error)
                 ▼
             SENDING ──► FAILED     (Gmail definitively rejected; or SEND_UNCONFIRMED)
                 │
                 ▼
               SENT
```

| From | To | Trigger | Required writes |
|---|---|---|---|
| — | `PENDING` | New Call ID seen for the target date | identity and customer columns, `call_date`, `target_date`, `first_seen_at` |
| `PENDING` | `PENDING` | Eligibility returns `DEFER` (data not yet available) | `pending_reason`, `pending_until` (first time), `recheck_count += 1`, `last_checked_at`, `reason_detail`; event `DEFERRED` |
| `PENDING` | `SKIPPED` | Eligibility/duplicate `SKIP`, or the run starts after `pending_until` and the recheck still finds data missing (event `WAIT_EXPIRED`) | `reason_code`, `reason_detail`; pending fields kept for audit |
| `PENDING` | `PROCESSING` | Eligible, not duplicate; run claims row | clear `pending_reason`; `run_id`, `lease_expires_at`, `processing_started_at`, `attempt_count += 1` |
| `FAILED` | `PENDING` | Retryable reason and `attempt_count < max_attempts` and backoff elapsed and call within `max_followup_age_days` | clear `run_id`, lease |
| `FAILED` | `SKIPPED` | Retryable, but call older than `max_followup_age_days` | `CALL_TOO_OLD` |
| `PROCESSING` | `SKIPPED` | Eligibility/analysis skip | `reason_code`, `reason_detail` |
| `PROCESSING` | `FAILED` | Technical error | `reason_code`, sanitised `reason_detail` |
| `PROCESSING` | `VALIDATING` | Draft generated | `email_subject`, lease renewed |
| `VALIDATING` | `SKIPPED` | Blocking validation issue | `VALIDATION_FAILED`, `validation_issue_codes` |
| `VALIDATING` | `SKIPPED` | Validation passed in `shadow` or `dry_run` mode (no customer send, D-022) | `DRAFT_ONLY_MODE`, `email_subject`, `email_body`, `validated_at` |
| `VALIDATING` | `SKIPPED` | Pre-send source re-read: `Recording Sent` now `yes`/unrecognised, Call ID duplicated, or source row missing | `RECORDING_ALREADY_SENT` / `RECORDING_SENT_STATUS_UNCLEAR` / `DUPLICATE_CALL_ID_IN_SOURCE` / `SOURCE_ROW_MISSING` |
| `VALIDATING` | `PENDING` | Pre-send source re-read: recording URLs, transcript or email changed since generation | event `SOURCE_CHANGED`; regenerated on a later run |
| `VALIDATING` | `SENDING` | Validation passed | `validated_at`, `send_attempt_id`, `email_subject`, `email_body`, `send_started_at` — **must succeed before Gmail is called** |
| `SENDING` | `SENT` | Gmail returned message ID | `gmail_message_id`, `gmail_thread_id`, `sent_at` |
| `SENDING` | `FAILED` | Gmail returned a definite error (4xx other than auth/quota), or reconciliation inconclusive | `GMAIL_SEND_ERROR` / `SEND_UNCONFIRMED` |
| `PROCESSING`/`VALIDATING` | `PENDING` | Lease expired (run crashed) | event `LEASE_EXPIRED` |

Any transition not in this table is rejected by the state machine and logged as an error. `SENT` can never transition.

Every transition appends one row to `POST_CALL_EMAIL_EVENTS` (append-only audit trail) and updates the row in `POST_CALL_EMAIL_LOGS`.

## 3. Leases

- Claiming a row sets `run_id` and `lease_expires_at = now + lease_duration` (default proposal: 15 minutes, configurable).
- The lease is renewed at each stage boundary.
- A run only acts on rows it holds a valid lease for.
- Leases protect against crashed runs and accidental overlap; they do not replace the single-execution guarantee (Sheets is not transactional).

## 4. Idempotency rules

1. **Only `SENDING` may send.** No other step calls the Gmail send tool.
2. **Write-ahead.** Before sending, the log row must durably record `status=SENDING`, `send_attempt_id` (internal: `{call_id}#{attempt_count}`, **never placed in the email**), `email_subject`, `email_body`, `send_started_at`. If that write fails, do not send; the row stays in `VALIDATING` and the lease expires → reprocessed later.
3. **No technical markers in customer emails (OD-41).** The email carries no reference line, footer code or custom header for duplicate prevention. Duplicate-send protection rests on the write-ahead record, a single send attempt, and **human review whenever delivery cannot be confirmed** (below). Reading Sent mail is only a read-only *confirmation* aid, never a licence to resend.
4. **Pre-send duplicate check.** Immediately before sending, re-read the log row and confirm: status is `SENDING`, this run holds the lease, `gmail_message_id` is empty, and no other row with the same `source_fingerprint` is `SENT`. Re-read the source row (`pipeline.md` Stage 8).
5. **Post-send write with retry.** After the send returns, write `SENT` (with the message/thread IDs if the connector returns them, R-07) with a few retries. The run summary records `call_id` only (no content).
6. **One send attempt per run, and per human decision.** Never retry a send in the same run. An unclear result leaves `SENDING`. A new send for the same Call ID after an unclear result happens **only** after a human records `CONFIRMED_NOT_SENT` (§5).
7. **`SENT` is permanent.** A Call ID in `SENT` is never processed again, regardless of source sheet edits.

## 5. Recovery procedure (start of every run)

| Found | Action |
|---|---|
| `PROCESSING` / `VALIDATING` with expired lease | → `PENDING` (no email can have been sent — sends only happen in `SENDING`). Event `LEASE_EXPIRED`. |
| `SENDING` with expired lease and empty `gmail_message_id` | **Uncertain-send reconciliation** (below). |
| `SENDING` with `gmail_message_id` present | → `SENT` (the connector confirmed the send; only the status write failed). |
| `FAILED`, retryable, attempts < max, backoff elapsed, call within max age | → `PENDING`. |
| `FAILED`, retryable, call older than `max_followup_age_days` | → `SKIPPED` `CALL_TOO_OLD` (a follow-up that late is no longer useful). |
| `PENDING` with `pending_reason` | Not part of recovery; rechecked by eligibility in the normal pipeline (`pipeline.md` §2, Stage 3). |
| `FAILED` with `SEND_UNCONFIRMED` | **Blocked until a human decides** (§5, human review). Never auto-retried. Counted in every run summary as `send_review_pending`. |

### Uncertain-send reconciliation (proposed, OD-41; connector abilities validated in Phase 4, R-07)

Goal: never send twice, and never guess. Anything not positively confirmed goes to a human.

1. **Positive confirmation only.** The row becomes `SENT` automatically in exactly two cases: (a) the send call returned a message or thread ID; (b) a read-only look at the sender's Sent mail finds **exactly one** message to this customer's address, with this email's subject, created at or after `send_started_at`, and no other message to that address since. Record the IDs and event `RECONCILED_SENT` for case (b).
2. **Everything else stops.** If the look finds no message, more than one candidate, an address/subject that only partly matches, or errors, or the Gmail connector is unavailable: set `FAILED` `SEND_UNCONFIRMED`, event `SEND_REVIEW_REQUIRED`. **Nothing is sent, retried or re-drafted for this Call ID.** (A connector outage with no search possible leaves the row in `SENDING` until the next run, then does the same.)
3. **Human review.** A named person (OD-23) opens the sender mailbox, checks whether the customer received the email, and records in the log row: `review_decision` = `CONFIRMED_SENT` or `CONFIRMED_NOT_SENT`, plus `reviewed_by` and `reviewed_at`. These are the only log columns a human edits.
4. **After the decision (next run):** `CONFIRMED_SENT` → `SENT` (event `REVIEW_RESOLVED`). `CONFIRMED_NOT_SENT` → `PENDING`, the draft is regenerated and re-checked, `attempt_count` increments (still bounded by `max_attempts`), and it is sent at most once more. No decision → the row stays blocked and keeps appearing in run summaries.
5. **Sent-mail reading is read-only and minimal.** It uses the recipient, subject and time window only. It never copies message content into logs.

Open practical questions (R-07): whether `send_message` returns IDs; whether Sent mail can be searched by recipient + subject + time through the connector; how reliably. If search is unavailable, step 1(b) never applies and every unconfirmed send goes to human review, which is the safe default.

## 6. Scenario: Gmail succeeds but tracking update fails

1. Row is `SENDING` with `send_attempt_id` recorded (write-ahead).
2. The connector reports the send as successful (or the result is lost).
3. Writing `SENT` fails (Sheets connector error), or the session ends before the write.
4. Next run: RECOVER finds `SENDING` with an expired lease and applies the reconciliation above. Exactly one matching Sent message → `SENT`. Otherwise → `SEND_UNCONFIRMED` and **human review**. No second email is sent in either case.

## 7. Duplicate prevention summary

| Layer | Protects against |
|---|---|
| Immutable Call ID | Row reordering, inserts, deletes, sorting |
| One tracking row per Call ID | Reprocessing the same call |
| `source_fingerprint` check | The same call pasted twice with different Call IDs |
| Terminal `SENT` | Re-sending after source edits |
| Write-ahead `SENDING` + `send_attempt_id` | Crash or session end between send and tracking update |
| Positive confirmation only, else human review | Lost or unclear send results |
| Run lock + leases | Overlapping scheduled or manual runs (R-08) |
| No auto-resend on ambiguity; resend only after `CONFIRMED_NOT_SENT` | Everything else |

## 8. Retry policy (defaults pending OD-14)

| Reason | Retryable | Notes |
|---|---|---|
| `LLM_API_ERROR`, `LLM_RATE_LIMITED`, `LLM_TIMEOUT` | Yes | Model unavailable, usage limit reached or stage did not complete (names kept for schema stability) |
| `LLM_OUTPUT_INVALID` | Yes | after one in-run retry |
| `SHEETS_API_ERROR` | Yes | Sheets connector error |
| `GMAIL_TRANSIENT_ERROR` | Yes | Gmail connector error where the send was **not** accepted |
| `UNEXPECTED_ERROR` | Yes | Any other error in one record; other records continue |
| `GMAIL_AUTH_ERROR`, `CONFIG_ERROR`, `CONNECTOR_UNAVAILABLE` | No | Needs an operator; the whole run stops |
| `GMAIL_SEND_ERROR` | No | definite rejection (e.g. invalid recipient) |
| `SEND_UNCONFIRMED` | No | human review required; resend only after `CONFIRMED_NOT_SENT` |

Proposed defaults: `max_attempts = 3`, backoff 1 run / 2 runs. After the limit → stays `FAILED` with `RETRY_LIMIT_EXCEEDED`.
