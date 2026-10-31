# memory.md

Durable project knowledge only: architectural decisions, technical discoveries, milestones. Not a conversation log. Full rationale: `docs/decisions/decision-log.md`. Open items: `docs/open-decisions.md`. Unverified-behaviour register: `docs/scheduled-execution.md` §4 (R-01 … R-13).

## Milestones

- 2026-10-31 — Phase 0 documentation created and approved; commits `642f7ea`, `39b1fc2`. Repository moved to `C:\dev\post-call-email-agent` (`1f0dddb`). OneDrive copy kept as an obsolete backup.
- 2026-10-31 — Real source sheet inspected read-only (D-021) and documented (`6d9c76d`).
- 2026-10-31 — Business decisions D-022 … D-025 designed into the docs (**uncommitted**).
- 2026-10-31 — **Architecture pivot D-026:** Claude Code scheduled tasks + native Google connectors replace the Python / Anthropic API / Cloud Run design as the primary path. Documentation restructured (**uncommitted**). Status: **proposed** until Phase 1 validates it. No phase after Phase 0 has started.

- 2026-10-31 — **Phase 1 partly done (read-only), D-027.** Yesterday (2026-10-30 IST) = 9 records. Sheets connector verified locally and in one manual cloud run (reads). Instructions in cloud runs **blocked** (no remote repo). `Calls DONE` has no protected ranges. Details: `docs/phase1-results.md`.

## Phase 1 discoveries (verified 2026-10-31)

- Cloud routines run in an Anthropic sandbox (`/home/user`, empty unless a git source is configured); cron/`run_once_at` are **UTC**, minimum interval 1 h (09:00 IST = `30 3 * * *`). `Bash` is available there.
- An API-created routine attaches **all** account connectors by default; routine `permitted_tools` and `allowed_tools` were accepted but did **not** restrict what the session could use. They are not enforcement (OD-42, R-03).
- `Calls DONE` has no protected ranges; three other tabs do. Protection is inspectable through the connector (`sheets.protectedRanges`). The connector's Google account is not discoverable (R-13).
- Date cells: normalise whitespace (some read `"October 14 , 2022 "`); dates are not strictly ascending; a full column read overflows (~307k chars) → bounded window with a coverage check. About 10 call rows per day recently.
- Checking transcripts pulls content through the session; read one record at a time.
- Loading the scheduling skill auto-created an Anthropic cloud environment "Default" (`env_01Cs49hSdGFEfboTPFSfY4Ty`). One disabled routine exists: `trig_017psPj1c1uxCuPDXDw9rvXu` (deletable only at claude.ai/code/routines).

## Current architecture (D-026, proposed)

- **Execution:** a Claude Code scheduled task, daily 09:00 Asia/Kolkata, running `workflows/daily-post-call-run.md`, with the Claude model from the user's subscription. Plan usage is consumed and limited (R-09). Preferred approach (OD-37): test cloud scheduled execution first if available; desktop is the fallback; nothing assumed to work until verified. Cowork and local MCP servers are **not** assumed equivalent to, or reachable from, scheduled tasks.
- **Data access:** native Google Sheets and Gmail connectors (OAuth). They act as the authorising Google user, so **instructions and agent checks do not enforce the AD-only write rule or the email boundary**. Only verified Google Sheets protected ranges can enforce AD-only writes, and only against a non-owner connector account (R-03, OD-36). Until verified, nothing is written to the real source sheet.
- **State:** `POST_CALL_EMAIL_LOGS`, `POST_CALL_EMAIL_EVENTS` (not yet created) and source column AD `POST_CALL_CALL_ID` (not yet created). Nothing else survives between scheduled sessions (R-05).
- **Dropped from the primary path** (kept in `docs/future-alternatives.md`): Python runtime and `uv` (D-006, D-020), Anthropic API (D-007), Cloud Run / Cloud Scheduler / Secret Manager (D-008), service-account Google auth, deterministic `Message-ID` reconciliation, in-memory fakes.
- **Cost policy:** no separately billed API, no backend, no GCP for the initial workflow. Escalate to the alternatives if R-01, R-03, R-04, R-07, R-09, R-11 or R-08/R-10 fail validation.

## Accepted business rules (unchanged by D-026)

- Previous-day processing in Asia/Kolkata (D-013); `transcript_wait_days = 1`, `discovery_lookback_days = 2` (D-018, D-019); rule-based eligibility `ELIGIBLE`/`DEFER`/`SKIP` before analysis (D-015); per-record failure isolation (D-016).
- Seven states: `PENDING`, `PROCESSING`, `VALIDATING`, `SENDING`, `SENT`, `FAILED`, `SKIPPED` (D-017). A send happens only from `SENDING`, after a write-ahead; never auto-resend an uncertain send.
- **D-022 transition:** delivery modes `dry_run`/`test`/`shadow`/`live`; only `live` emails customers, for calls on/after `go_live_date`. `Recording Sent = yes` always blocks; an empty cell is not proof of "not sent"; the agent never writes `Recording Sent`. Rollback = `shadow`.
- **D-023:** transcript automation is independent; the agent reads `Transcript`, never writes it or `AI Summary`; late transcripts deferred; transcript hash re-checked pre-send; if it changes, the draft is invalidated and reprocessed.
- **D-024:** Call ID `gen:{uuid4}` in AD `POST_CALL_CALL_ID`, the only approved source write; single empty cell only; never overwrite a valid ID; ambiguous row match → write nothing; no backfill.
- **D-025:** several Fathom URLs in one cell = segments of one call; all valid links in order in **one** email; dedupe within the cell; any invalid URL flags the record (no partial email); same URL across rows → duplicate/privacy checks (`DUPLICATE_SOURCE_ROW` / `RECORDING_URL_CONFLICT`). `source_fingerprint` = email + date + time.
- Five outcome categories: `discussed`, `explained`, `completed`, `pending_customer_action`, `pending_support_action`. When unsure, choose the less complete one.
- Cancelled / no-show only on explicit `Meeting Notes` evidence (OD-26); ambiguous → review, not guessed.
- Internal columns (`Mistakes…`, `Bugs…`, `Suggetions…`, `Phone`) never reach analysis or logs. Hindi transcripts are supported (OD-08).
- Synthetic data only in the repository; logs/run summaries carry IDs and codes, never content. Dashboard is future and reads only the logs and events worksheets.

## Source sheet (verified 2026-10-31)

- Spreadsheet `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI` ("CSC  Booking - All Agents"), worksheet `Calls DONE` (GID 1314582701), timezone `Asia/Calcutta`. A shared CSC team workbook.
- Mapping: `Date` (A), `Time of the call` (B), `Customer Name` (C), `Email` (D), `Call lead by(who took the call)` (F), `Meeting URL` (L, row matching only), `Recording URL` (M, one or more Fathom `/share/` URLs), `Recording Sent` (N), `Meeting Notes` (Q), `Transcript` (AB, direct text `[HH:MM:SS] Speaker: text`), `AI Summary` (AC, never written), AD `POST_CALL_CALL_ID` (to be created).
- Missing: Fathom recording ID, structured call status (W/X unused), opt-out, call type.
- Transcripts can be empty the day after a call; some contain Hindi. Data issues: trailing spaces, whitespace-only URLs, two URLs in a cell, the same URL in two rows, inconsistent name casing, rows created before the call, date-only placeholder rows.
- The Sheets connector's `get_values` returns **formatted** values ("October 30, 2026", "7:00 PM"); serial numbers come from `get_spreadsheet` grid data. Large results can spill into local tool-result files holding real data: delete them.

## Technical discoveries

- Sheets cells hold at most 50,000 characters; long transcripts may be truncated (`TRANSCRIPT_POSSIBLY_TRUNCATED`).
- Observed connector tools (interactive session only): Sheets `get_spreadsheet`, `get_values`, `update_values`, `append_values`, `batch_clear_values`, `insert_dimension`, `update_spreadsheet`, `update_formulas`, `copy_sheet_to_another_spreadsheet`; Gmail `search_threads`, `get_thread`, `get_message`, `create_draft`, `send_message`, `reply`, label tools. Several are forbidden for this agent. Scheduled availability is unverified (R-01).
- Whether the Gmail connector can set headers, return message IDs, or send unattended is unverified (R-04, R-07). Uncertain sends: no footer/reference in customer emails; `SENT` only on positive confirmation, otherwise `SEND_UNCONFIRMED` → human review, no auto-resend (OD-41).
- A run between 00:00 and 05:30 IST has a different UTC date: never use the environment's clock for the target date.

## Environment

- Repository: `C:\dev\post-call-email-agent`, branch `main`, local only (remote hosting open, OD-21). Python is not installed and is not needed unless helpers (OD-38) are approved.
- A Google Sheets MCP connector and a Gmail connector are available in interactive Claude Code sessions. They are development tools here; scheduled-run access is what Phase 1 must validate.
