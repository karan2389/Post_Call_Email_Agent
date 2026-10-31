# Data Model

Status: **Proposed schema.** Source sheet columns must be confirmed against the real sheet (OD-01). Whether the logs live in the same spreadsheet as the source is OD-18.

All timestamps: ISO 8601 with offset, Asia/Kolkata, e.g. `2026-10-31T14:05:00+05:30`. All dates (`call_date`, `target_date`): `YYYY-MM-DD` in Asia/Kolkata.

## 1. Source worksheet (read; one column written)

Owned by the support team / upstream process. The agent reads it and writes only `call_id`.

| Column | Required | Written by | Notes |
|---|---|---|---|
| `call_id` | — | **Agent** (or upstream, OD-02) | Immutable. See `call-id-strategy.md`. Should be a protected range. |
| `fathom_recording_id` | Optional | Upstream | Only used if verified (OD-03) |
| `fathom_url` | Yes | Upstream | Must be a valid HTTPS Fathom URL |
| `recording_shareable` | Optional | Upstream | `TRUE`/`FALSE` — whether the customer can open the recording (OD-04) |
| `customer_name` | Yes | Upstream | Used for greeting (first name derived) |
| `customer_email` | Yes | Upstream | Single valid address |
| `call_datetime` | Yes | Upstream | Date cell (read as serial number) or ISO text. Interpreted in Asia/Kolkata. Its date part decides previous-day selection (`pipeline.md` §1). A separate date column can be mapped instead (OD-28). |
| `call_status` | Recommended | Upstream | e.g. `completed`, `cancelled`, `no_show` — drives `CALL_CANCELLED` / `CUSTOMER_NO_SHOW` (OD-26) |
| `support_agent_name` | Recommended | Upstream | For signature / context (OD-06) |
| `transcript` | Yes (may arrive late) | Upstream | Plain text with speaker labels. Empty → record waits as `PENDING` (`MISSING_TRANSCRIPT`). Cell limit 50,000 characters → see `TRANSCRIPT_POSSIBLY_TRUNCATED`. |
| `call_type` | Optional | Upstream | e.g. support / onboarding / sales (OD-10) |
| `email_opt_out` | Optional | Upstream | `TRUE` → skip with `CUSTOMER_OPTED_OUT` |

Column names are mapped through `config/` (sheet schema mapping), so renaming a column in the sheet needs only a config change.

## 2. `POST_CALL_EMAIL_LOGS` worksheet (agent-owned, one row per Call ID)

The current state and final record of each call: customer information, status, reasons, timestamps and the final email body. Primary key: `call_id`. The dashboard reads this.

### Identity and customer
| Column | Type | Description |
|---|---|---|
| `call_id` | string | Primary key |
| `call_id_source` | enum | `fathom` \| `generated` |
| `fathom_recording_id` | string | If known (reference only) |
| `source_fingerprint` | string | sha256 hex; empty if email or URL missing |
| `customer_name` | string | Refreshed from source on each recheck until claimed |
| `customer_email` | string | Refreshed from source on each recheck until claimed |
| `support_agent_name` | string | |
| `call_datetime` | timestamp | |
| `call_date` | date | Date part in Asia/Kolkata |
| `target_date` | date | The run's target date when the record was first discovered |
| `call_status` | string | Copied from source, if provided |
| `fathom_url` | string | |

### State
| Column | Type | Description |
|---|---|---|
| `status` | enum | `PENDING` `PROCESSING` `VALIDATING` `SENDING` `SENT` `FAILED` `SKIPPED` |
| `pending_reason` | enum | Set while `PENDING` and waiting for data (e.g. `MISSING_TRANSCRIPT`); empty otherwise |
| `pending_until` | timestamp | End of the wait window (`call_date + transcript_wait_days`, 23:59:59 IST) |
| `recheck_count` | int | Number of runs that rechecked a waiting record |
| `last_checked_at` | timestamp | Last eligibility check |
| `reason_code` | enum | Final reason for `SKIPPED` / `FAILED`, from `skip-reasons.md` |
| `reason_detail` | string | Short, sanitised; lists all failed eligibility checks; no transcript text |
| `attempt_count` | int | Incremented on each claim |
| `run_id` | string | Run currently or last holding the row |
| `lease_expires_at` | timestamp | |

### Timestamps
| Column | Description |
|---|---|
| `first_seen_at` | Discovery |
| `processing_started_at` | Latest claim |
| `validated_at` | Validation finished |
| `send_started_at` | Write-ahead marker |
| `sent_at` | Gmail accepted |
| `last_updated_at` | Any change |

### Email
| Column | Type | Description |
|---|---|---|
| `email_subject` | string | Subject sent (or draft subject if skipped at validation) |
| `email_body` | string | **Final email body as sent** (plain text). For `VALIDATION_FAILED` rows, the rejected draft (status shows it was not sent). Empty if no draft was produced. |
| `validation_outcome` | enum | `PASS` \| `FAIL` \| empty |
| `validation_issue_codes` | string | Comma-separated codes from `validation-rules.md` |
| `rfc822_message_id` | string | Planned Message-ID (write-ahead) |
| `gmail_message_id` | string | From Gmail response |
| `gmail_thread_id` | string | From Gmail response |

### Analysis metadata (for reporting)
| Column | Type | Description |
|---|---|---|
| `customer_sentiment` | enum | `positive` `neutral` `frustrated` `angry` `unclear` |
| `pending_support_actions_count` | int | Follow-up load reporting |
| `pending_customer_actions_count` | int | |
| `skill_versions` | string | e.g. `ta=1.1.0;cs=1.0.0;eg=1.0.0;ev=1.0.0` |
| `model_analysis` / `model_summary` / `model_generation` / `model_validation` | string | Model ID used per stage (from config) |

Email bodies are personal data. Access to this worksheet should be limited to the support team (OD-19). The email body is never written to ordinary logs.

## 3. `POST_CALL_EMAIL_EVENTS` worksheet (agent-owned, append-only)

One row per state transition or notable event. Never updated or deleted by the agent. Recommended rather than strictly required: it provides the audit trail, run history and recheck history for the dashboard.

| Column | Description |
|---|---|
| `event_id` | UUID |
| `event_at` | timestamp |
| `run_id` | |
| `target_date` | Run's target date |
| `call_id` | Empty for run-level events |
| `event_type` | See `skip-reasons.md` §8 |
| `from_status` | |
| `to_status` | |
| `reason_code` | |
| `detail` | Sanitised short text / counts (for `RUN_FINISHED`: JSON counts by status and reason) |

## 4. Dashboard readiness

The future dashboard needs only `POST_CALL_EMAIL_LOGS` and `POST_CALL_EMAIL_EVENTS`:

- Daily volume per call date: `call_date`, `status`.
- Skip/failure analysis: `reason_code`, `validation_issue_codes`.
- Waiting records and late transcripts: `pending_reason`, `recheck_count`, `pending_until`.
- Latency: `call_datetime` → `sent_at`.
- Follow-up load: `pending_support_actions_count`, `support_agent_name`.
- Sentiment trends: `customer_sentiment`.
- Run health: `RUN_FINISHED` / `RUN_ABORTED` / `PROCESSING_HALTED` events.

Schema rules for compatibility: columns are only **added** (never renamed or removed without a migration note in `decision-log.md`); enums only gain values.

## 5. In-memory models (Phase 1)

`RunContext` (run_id, run_date, target_date), `CallRecord`, `EligibilityResult` (ELIGIBLE / DEFER / SKIP + reasons), `AnalysisResult`, `AnalysisItem`, `CustomerSummary`, `EmailDraft`, `ValidationResult`, `ValidationIssue`, `TrackingRecord`, `Event`, `RunSummary`. Field definitions follow the JSON schemas in each SKILL.md and the tables above.
