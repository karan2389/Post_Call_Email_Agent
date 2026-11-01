# Data Model

Status: Source mapping **verified against the real sheet on 2026-10-31** (see `source-sheet-profile.md`). Log/event schemas are proposed; the worksheets are **not created** (creation needs approval, Phase 3). Whether the logs live in the same spreadsheet as the source is OD-18.

All timestamps: ISO 8601 with offset, Asia/Kolkata, e.g. `2026-10-31T14:05:00+05:30`. All dates (`call_date`, `target_date`): `YYYY-MM-DD` in Asia/Kolkata.

## 1. Source worksheet

- **Agent input (D-029):** spreadsheet `CSC  Booking - All Agents`, ID `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, worksheet `Calls DONE` (GID `1314582701`). It is the CSC team's shared workbook, owned by the team, and the only operational source. The mapping below was verified on it. A separate backup (`CSC Booking - Backup`) is a recovery copy only and is not read by the agent (`backup-recovery.md`).
- The agent reads it. Source writes are **disabled** until the gate in `call-id-strategy.md` §0 is met; the proposed **only** write is then the Call ID in column AD `POST_CALL_CALL_ID`, one empty cell at a time (D-024). No other source column is ever written — `Transcript`, `AI Summary` and `Recording Sent` included.
- Headers in row 1. Read columns are mapped by **exact header text** through `config/` (never by letter). The write column is fixed to AD with header `POST_CALL_CALL_ID` and checked on every run. Letters below are as of inspection.

### 1.1 Verified fields

| Logical field | Header (exact) | Col | Format / handling |
|---|---|---|---|
| `call_date` | `Date` | A | Date serial (format `mmmm d, yyyy`) → date in Asia/Kolkata. Decides previous-day selection. |
| `call_time` | `Time of the call` | B | Time serial (format `h:mm am/pm`). `call_datetime = call_date + call_time`. May be empty → `call_datetime` = date only. |
| `customer_name` | `Customer Name` | C | Free text; normalise casing for the greeting (OD-32) |
| `customer_email` | `Email` | D | Trim whitespace; must be one valid address |
| `support_agent_name` | `Call lead by(who took the call)` | F | Agent first name; empty until the agent fills the row |
| `fathom_urls` | `Recording URL` | M | **Ordered list** of one or more recording segments of the same call (D-025). Parsing rules in §1.5. Whitespace-only = empty |
| `recording_sent` | `Recording Sent` | N | Normalised: `yes` / `no` / `empty` / `unrecognised` (D-022). Read-only |
| `meeting_url` | `Meeting URL` | L | Zoom link; used only in the row signature for safe Call ID writes. Never sent to the LLM or in the email |
| `meeting_notes` | `Meeting Notes` | Q | Free text. Used for the call-outcome check (cancelled / no-show, OD-26). Use as extra LLM context is OD-30. |
| `transcript` | `Transcript` | AB | Direct text, lines `[HH:MM:SS] Speaker: text`. Written by the independent transcript automation (D-023). Empty → `PENDING` (`MISSING_TRANSCRIPT`). 50,000-character cell limit → `TRANSCRIPT_POSSIBLY_TRUNCATED`. |
| `call_id` | `POST_CALL_CALL_ID` | AD | **Agent-written** `gen:{uuid4}`. Empty until assigned; never overwritten once valid (D-024) |

Optional context (verified, not required): `Answer in Booking Form` (J), `Customer Type` (O), `In which Industry he/ She working` (P), `Meeting Duration` (K).

### 1.2 Verified columns the agent must never read into prompts or logs

`Mistakes that you made & what steps you will take to improve those mistakes.` (R), `Bugs your getting in CSC` (Z), `Suggetions your getting in CSC` (AA), `Phone` (E). Also not used: `AI Summary` (AC, written by the existing automation and never written by the agent).

### 1.3 Missing fields (do not exist in the sheet)

| Logical field | Status | Current handling |
|---|---|---|
| `fathom_recording_id` | **Missing** | Only share tokens are available; a share token is not a recording ID (OD-03) |
| `call_status` | **Missing as structured data** | `Customer Not Came` (W) and `Cancel` (X) headers exist but are empty in all recent rows. Outcome derived from `Meeting Notes` text (OD-26) |
| `recording_shareable` | **Missing** | All recent URLs are `/share/` links; public visibility unconfirmed (OD-04) |
| `email_opt_out` | **Missing** | Check E3 is inactive until a column exists |
| `call_type` | **Missing** | Closest is `Customer Type` (O); check E4 inactive (OD-10) |

### 1.4 Assumptions (not verified)

- Rows are not moved from `Calls DONE` to `Old Calls DONE` / `Calls Backup` within the processing window. If they are, `SOURCE_ROW_MISSING` applies.
- The existing automation that fills `Transcript` keeps doing so for new calls, and its timing is roughly "after the call, within a day" (name and schedule: OD-33).
- For multi-segment calls, `Transcript` covers all segments (unconfirmed, OD-33 / conflict C3 in `source-sheet-profile.md`).
- The spreadsheet timezone (`Asia/Calcutta`) stays unchanged.

### 1.5 Recording URL parsing (D-025)

1. Trim the cell. Empty or whitespace-only → no recordings (`MISSING_FATHOM_URL`, deferrable).
2. Split into tokens on whitespace, newlines, commas, semicolons and `|`.
3. Each token must match `^https://fathom\.video/share/[A-Za-z0-9_-]+$` after removing one trailing `/`. Host matching is case-insensitive; the token part is kept exactly.
4. **Any** token that does not match (a malformed URL, a non-Fathom link, or stray text) → the whole row is flagged `INVALID_FATHOM_URL` (deferrable, so an executive can fix it). The token's position is recorded in `reason_detail`. A partial set of recordings is **never** emailed.
5. Remove exact duplicates within the cell, keeping the **first** occurrence. Event detail notes how many duplicates were removed.
6. Keep the original order. Segment *n* = the *n*-th unique URL.
7. Result: `fathom_urls = [url_1, …, url_n]`, `n ≥ 1`. No upper limit. `recording_count = n` changes the email wording, never the number of emails.

## 2. `POST_CALL_EMAIL_LOGS` worksheet (agent-owned, one row per Call ID)

The current state and final record of each call: customer information, status, reasons, timestamps and the final email body. Primary key: `call_id`. The dashboard reads this.

### Identity and customer
| Column | Type | Description |
|---|---|---|
| `call_id` | string | Primary key |
| `call_id_source` | enum | Always `generated` in the MVP (no Fathom recording IDs exist) |
| `source_signature` | string | Row signature at Call ID assignment (`call-id-strategy.md` §5); used only to restore a cleared ID |
| `source_row_hint` | int | Row number at last read — informational only, never identity |
| `source_fingerprint` | string | sha256 of email + date + time; detects the same booking entered twice; empty if email missing |
| `customer_name` | string | Refreshed from source on each recheck until claimed |
| `customer_email` | string | Refreshed from source on each recheck until claimed |
| `support_agent_name` | string | |
| `call_datetime` | timestamp | |
| `call_date` | date | Date part in Asia/Kolkata |
| `target_date` | date | The run's target date when the record was first discovered |
| `call_status` | string | Derived outcome: `completed` \| `cancelled` \| `no_show` \| `unknown` (from `Meeting Notes`, OD-26) |
| `fathom_urls` | string | The ordered recording URLs used, newline-separated (D-025) |
| `recording_count` | int | Number of unique recording segments |
| `recording_sent_value` | enum | `yes` / `no` / `empty` / `unrecognised` as last read from the source |
| `transcript_hash` | string | sha256 of the transcript used for generation; compared before sending (conflict C4) |
| `delivery_mode` | enum | `dry_run` / `test` / `shadow` / `live` — the mode of the run that last processed the record (D-022) |

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
| `email_body` | string | **Final email body as sent** (plain text). For `VALIDATION_FAILED` rows, the rejected draft; for `DRAFT_ONLY_MODE` rows (shadow mode), the draft that would have been sent. The status shows it was not sent. Empty if no draft was produced. |
| `validation_outcome` | enum | `PASS` \| `FAIL` \| empty |
| `validation_issue_codes` | string | Comma-separated codes from `validation-rules.md` |
| `send_attempt_id` | string | Internal write-ahead identifier `{call_id}#{attempt_count}`, recorded before sending. **Never included in the email** (OD-41) |
| `review_decision` | enum | Human decision after an unconfirmed send: `CONFIRMED_SENT` \| `CONFIRMED_NOT_SENT` \| empty. One of the only columns a human edits |
| `reviewed_by` | string | Person who made the decision |
| `reviewed_at` | timestamp | When the decision was recorded |
| `gmail_message_id` | string | From the Gmail connector's response or from reconciliation (availability R-07) |
| `gmail_thread_id` | string | From Gmail response |

### Analysis metadata (for reporting)
| Column | Type | Description |
|---|---|---|
| `customer_sentiment` | enum | `positive` `neutral` `frustrated` `angry` `unclear` |
| `pending_support_actions_count` | int | Follow-up load reporting |
| `pending_customer_actions_count` | int | |
| `skill_versions` | string | e.g. `ta=1.4.0;cs=1.3.0;eg=1.4.0;ev=1.4.0` |
| `model_used` | string | Claude model reported by the scheduled session, if available (single model for all stages) |
| `run_variant` | string | Scheduled-task variant that processed the record (OD-37), for audit |

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

## 5. Working records inside a scheduled run

There is no application data model in code (D-026). Within a run, the scheduled session keeps these records in its working notes. Their shapes follow the JSON schemas in each SKILL.md and the tables above:

`RunContext` (run_id, run_date, target_date, delivery_mode, go_live_date), `CallRecord` (with ordered `fathom_urls`), `EligibilityResult` (ELIGIBLE / DEFER / SKIP + reasons), `AnalysisResult`, `CustomerSummary`, `EmailDraft`, `ValidationResult`, `RunSummary`.

**Persistence:** nothing survives between scheduled sessions except what is written to `POST_CALL_EMAIL_LOGS`, `POST_CALL_EMAIL_EVENTS`, column AD and the sent mail itself (R-05). Every run must be able to resume from those alone.
