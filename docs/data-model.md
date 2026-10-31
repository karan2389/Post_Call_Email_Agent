# Data Model

Status: Source mapping **verified against the real sheet on 2026-10-31** (see `source-sheet-profile.md`). Log/event schemas are proposed. Whether the logs live in the same spreadsheet as the source is OD-18.

All timestamps: ISO 8601 with offset, Asia/Kolkata, e.g. `2026-10-31T14:05:00+05:30`. All dates (`call_date`, `target_date`): `YYYY-MM-DD` in Asia/Kolkata.

## 1. Source worksheet

- Spreadsheet ID `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, worksheet `Calls DONE` (GID `1314582701`). It is the CSC team's shared workbook and is owned by the team.
- The agent reads it. Writing anything to it (e.g. a Call ID column) is **not approved** (OD-02).
- Headers in row 1. Columns are mapped by **exact header text** through `config/` (never by letter), so a moved column needs no code change. Letters below are as of inspection.

### 1.1 Verified fields

| Logical field | Header (exact) | Col | Format / handling |
|---|---|---|---|
| `call_date` | `Date` | A | Date serial (format `mmmm d, yyyy`) → date in Asia/Kolkata. Decides previous-day selection. |
| `call_time` | `Time of the call` | B | Time serial (format `h:mm am/pm`). `call_datetime = call_date + call_time`. May be empty → `call_datetime` = date only. |
| `customer_name` | `Customer Name` | C | Free text; normalise casing for the greeting (OD-32) |
| `customer_email` | `Email` | D | Trim whitespace; must be one valid address |
| `support_agent_name` | `Call lead by(who took the call)` | F | Agent first name; empty until the agent fills the row |
| `fathom_url` | `Recording URL` | M | Trim; must be `https://fathom.video/share/<token>`; whitespace-only = empty; two URLs in one cell → OD-31 |
| `meeting_notes` | `Meeting Notes` | Q | Free text. Used for the call-outcome check (cancelled / no-show, OD-26). Use as extra LLM context is OD-30. |
| `transcript` | `Transcript` | AB | Direct text, lines `[HH:MM:SS] Speaker: text`. Empty → `PENDING` (`MISSING_TRANSCRIPT`). 50,000-character cell limit → `TRANSCRIPT_POSSIBLY_TRUNCATED`. |

Optional context (verified, not required): `Answer in Booking Form` (J), `Customer Type` (O), `In which Industry he/ She working` (P), `Meeting Duration` (K).

### 1.2 Verified columns the agent must never read into prompts or logs

`Mistakes that you made & what steps you will take to improve those mistakes.` (R), `Bugs your getting in CSC` (Z), `Suggetions your getting in CSC` (AA), `Phone` (E). Also not used: `AI Summary` (AC, written by an existing automation) and `Recording Sent` (N) — see OD-29.

### 1.3 Missing fields (do not exist in the sheet)

| Logical field | Status | Current handling |
|---|---|---|
| `call_id` | **Missing** | OD-02 (no write access agreed yet) |
| `fathom_recording_id` | **Missing** | Only share tokens are available; a share token is not a recording ID (OD-03) |
| `call_status` | **Missing as structured data** | `Customer Not Came` (W) and `Cancel` (X) headers exist but are empty in all recent rows. Outcome derived from `Meeting Notes` text (OD-26) |
| `recording_shareable` | **Missing** | All recent URLs are `/share/` links; public visibility unconfirmed (OD-04) |
| `email_opt_out` | **Missing** | Check E3 is inactive until a column exists |
| `call_type` | **Missing** | Closest is `Customer Type` (O); check E4 inactive (OD-10) |

### 1.4 Assumptions (not verified)

- Rows are not moved from `Calls DONE` to `Old Calls DONE` / `Calls Backup` within the processing window. If they are, `SOURCE_ROW_MISSING` applies.
- The existing automation that fills `Transcript` keeps doing so for new calls, and its timing is roughly "after the call, within a day".
- The spreadsheet timezone (`Asia/Calcutta`) stays unchanged.

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
| `call_status` | string | Derived outcome: `completed` \| `cancelled` \| `no_show` \| `unknown` (from `Meeting Notes`, OD-26) |
| `fathom_url` | string | |

### State
| Column | Type | Description |
|---|---|---|
| `status` | enum | `PENDING` `PROCESSING` `VALIDATING` `SENDING` `SENT` `FAILED` `SKIPPED` |
| `pending_reason` | enum | Set while `PENDING` and waiting for data (e.g. `MISSING_TRANSCRIPT`); empty otherwise |
| `pending_until` | timestamp | End of the wait window: run date of first deferral + `transcript_wait_days` (1), 23:59:59 IST |
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
