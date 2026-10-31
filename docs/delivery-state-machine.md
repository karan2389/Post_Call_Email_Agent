# Delivery State Machine, Idempotency and Recovery

Status: **Approved design**, including the `SENDING` state (D-017).

## 1. States

| State | Meaning | Terminal? |
|---|---|---|
| `PENDING` | Call discovered, Call ID assigned, waiting to be processed. If `pending_reason` is set, the record is **waiting for data** (e.g. transcript not yet available) and is rechecked each run until `pending_until` | No |
| `PROCESSING` | Claimed by a run: eligibility, analysis, summary, generation | No |
| `VALIDATING` | Draft exists; deterministic and semantic validation running | No |
| `SENDING` | Validation passed; planned Message-ID recorded; Gmail send in progress | No |
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
| `VALIDATING` | `SENDING` | Validation passed | `validated_at`, `rfc822_message_id`, `email_subject`, `email_body`, `send_started_at` — **must succeed before Gmail is called** |
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

1. **Only `SENDING` may call Gmail.** No other code path sends.
2. **Write-ahead.** Before calling Gmail, the tracking row must durably record `status=SENDING`, `rfc822_message_id`, `email_subject`, `email_body`, `send_started_at`. If that write fails, do not send; the row stays in `VALIDATING` and the lease expires → reprocessed later.
3. **Deterministic Message-ID.** `rfc822_message_id = <{call_id_safe}.{attempt_count}@{MESSAGE_ID_DOMAIN}>`, set as the email's `Message-ID` header. A custom header `X-FlexiFunnels-Call-ID: {call_id}` is also added. (Whether Gmail preserves a client-supplied Message-ID must be verified in Phase 4 — OD-16.)
4. **Pre-send duplicate check.** Immediately before sending, re-read the tracking row and confirm: status is `SENDING`, this run holds the lease, `gmail_message_id` is empty, and no other row with the same `source_fingerprint` is `SENT`.
5. **Post-send write with retry.** After Gmail returns, write `SENT` with exponential backoff (e.g. 5 attempts). The Gmail response is also written to the structured log as `call_id + gmail_message_id` (no content) so it can be recovered manually.
6. **`SENT` is permanent.** A Call ID in `SENT` is never processed again, regardless of source sheet edits.

## 5. Recovery procedure (start of every run)

| Found | Action |
|---|---|
| `PROCESSING` / `VALIDATING` with expired lease | → `PENDING` (no email can have been sent — sends only happen in `SENDING`). Event `LEASE_EXPIRED`. |
| `SENDING` with expired lease and empty `gmail_message_id` | **Reconcile with Gmail** (below). |
| `SENDING` with `gmail_message_id` present | → `SENT` (the send succeeded; only the status write failed). |
| `FAILED`, retryable, attempts < max, backoff elapsed, call within max age | → `PENDING`. |
| `FAILED`, retryable, call older than `max_followup_age_days` | → `SKIPPED` `CALL_TOO_OLD` (a follow-up that late is no longer useful). |
| `PENDING` with `pending_reason` | Not part of recovery; rechecked by eligibility in the normal pipeline (`pipeline.md` §2, Stage 3). |
| `FAILED` with `SEND_UNCONFIRMED` | Leave as is; requires manual review (OD-14). |

### Gmail reconciliation

1. Search the sender mailbox: `rfc822msgid:{rfc822_message_id}`.
2. If found → `SENT`, record Gmail IDs, event `RECONCILED_SENT`.
3. If not found, secondary search: `in:sent to:{customer_email} after:{send_started_at date}`; inspect candidates for the `X-FlexiFunnels-Call-ID` header.
4. Found → `SENT` (`RECONCILED_SENT`).
5. Not found → `FAILED` with `SEND_UNCONFIRMED`. **Not retried automatically** in the MVP. Rationale: a duplicate email is worse than a delayed one. Whether a verified absence may be auto-retried is OD-14.
6. If Gmail search itself errors → leave in `SENDING`, try again next run.

## 6. Scenario: Gmail succeeds but tracking update fails

1. Row is `SENDING` with `rfc822_message_id` recorded (write-ahead).
2. Gmail returns `id` and `threadId`.
3. Writing `SENT` fails 5 times (Sheets outage).
4. Run logs `call_id`, `gmail_message_id`, event `TRACKING_WRITE_ERROR`, and ends.
5. Next run: recovery finds `SENDING` with expired lease → Gmail search by `rfc822msgid` finds the message → `SENT`. No second email is sent.

## 7. Duplicate prevention summary

| Layer | Protects against |
|---|---|
| Immutable Call ID | Row reordering, inserts, deletes, sorting |
| One tracking row per Call ID | Reprocessing the same call |
| `source_fingerprint` check | The same call pasted twice with different Call IDs |
| Terminal `SENT` | Re-sending after source edits |
| Write-ahead `SENDING` + deterministic Message-ID | Crash between send and tracking update |
| Gmail reconciliation | Lost Gmail responses |
| Single execution + leases | Concurrent runs |
| No auto-resend on ambiguity | Everything else |

## 8. Retry policy (defaults pending OD-14)

| Reason | Retryable | Notes |
|---|---|---|
| `LLM_API_ERROR`, `LLM_RATE_LIMITED`, `LLM_TIMEOUT` | Yes | |
| `LLM_OUTPUT_INVALID` | Yes | after one in-run retry |
| `SHEETS_API_ERROR` | Yes | |
| `GMAIL_TRANSIENT_ERROR` | Yes | 5xx / quota; send was **not** accepted |
| `UNEXPECTED_ERROR` | Yes | Unhandled exception in one record; other records continue |
| `GMAIL_AUTH_ERROR`, `CONFIG_ERROR` | No | needs operator; whole run aborts |
| `GMAIL_SEND_ERROR` | No | definite rejection (e.g. invalid recipient) |
| `SEND_UNCONFIRMED` | No | manual review |

Proposed defaults: `max_attempts = 3`, backoff 1 run / 2 runs. After the limit → stays `FAILED` with `RETRY_LIMIT_EXCEEDED`.
