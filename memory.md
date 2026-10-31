# memory.md

Durable project knowledge only: architectural decisions, technical discoveries, milestones. Not a conversation log. Full rationale lives in `docs/decisions/decision-log.md`; open items in `docs/open-decisions.md`.

## Milestones

- 2026-10-31 — Phase 0 initialisation complete: structure, Git, documentation, four SKILL.md specs.
- 2026-10-31 — Previous-day processing requirement designed (D-013 … D-016, `docs/pipeline.md`).
- 2026-10-31 — User approved the Phase 0 documentation and previous-day design; initial commit `642f7ea`. Then decided D-017 … D-020. Phase 1 not yet started (needs Python 3.12 + uv, go-ahead).
- 2026-10-31 — Repository moved (copied with full Git history, verified by `git fsck` and file hashes) to `C:\dev\post-call-email-agent`. The old OneDrive copy at `C:\Users\karan\OneDrive\Documents\POST-CALL-EMAIL-AGENT` is obsolete and kept as a backup.
- 2026-10-31 — Real source sheet inspected read-only (D-021, `docs/source-sheet-profile.md`).

## Accepted decisions (D-001 … D-016)

- Daily run: `target_date = today(Asia/Kolkata) − 1`, computed once per run; server timezone never used; `TARGET_DATE` manual override. Order: FETCH → (RECOVER) → FILTER PREVIOUS-DAY → ELIGIBILITY → DUPLICATES → ANALYSE → GENERATE → VALIDATE → SEND → UPDATE TRACKING.
- Eligibility is deterministic and pre-LLM: `ELIGIBLE` / `DEFER` / `SKIP`. Missing transcript, Fathom URL/shareability or customer details → `PENDING` + `pending_reason`, rechecked each run until `pending_until`, then `SKIPPED` with the same code. Cancelled, no-show, opted-out → terminal. Terminal beats deferrable.
- D-017 `SENDING` state adopted (seven states). D-018 lookback 2 days. D-019 wait window 1 day after first deferral (eligibility rechecked before expiry). D-020 Python 3.12 + `uv`, repo to move out of OneDrive.
- Tracking worksheet `POST_CALL_EMAIL_LOGS` holds the final email body, customer info, status and timestamps; `POST_CALL_EMAIL_EVENTS` is the append-only audit trail.
- Per-record error boundary; the run stops claiming only on config error, unreadable sheets, Gmail auth error or the LLM circuit breaker.

- Google Sheets is the only MVP source (customer info, transcript, Fathom URL). No Fathom API/MCP.
- Call ID: `fathom:{id}` if verified, else `gen:{uuid4}`; immutable; stored with the row. The real sheet has no recording IDs and no ID column, so storage is OD-02. Never row numbers. `source_fingerprint` (email + normalised URL) is a secondary duplicate guard.
- Five outcome categories: `discussed`, `explained`, `completed`, `pending_customer_action`, `pending_support_action`. When unsure, choose the less complete category.
- States: `PENDING`, `PROCESSING`, `VALIDATING`, `SENDING`, `SENT`, `FAILED`, `SKIPPED`. Gmail is called only from `SENDING` after a write-ahead of the planned `rfc822_message_id`. Ambiguous sends → `SEND_UNCONFIRMED`, never auto-resent.
- SKILL.md files are loaded explicitly by Python with a fixed section contract; versions recorded per email.
- Python 3.12, plain Python, official SDKs only. Anthropic API; model IDs from config only (unset until confirmed).
- Gmail / Sheets / Cloud Run / Cloud Scheduler. Timezone Asia/Kolkata, ISO 8601 `+05:30`.
- Dashboard is future and reads only `POST_CALL_EMAIL_LOGS` + `POST_CALL_EMAIL_EVENTS`; schema changes are additive.
- Synthetic data only in workspace, Git and ordinary logs. Logs carry IDs and codes, never content.

## Working assumptions (not yet confirmed)

- "Customer's perspective" = email to the customer from support, centred on their goals (OD-05).
- English-only emails, plain text, 80–250 words (OD-08, OD-09).
- Sensitive topics (refunds, legal, security…) are skipped for a human (OD-11).
- Proposed defaults still unconfirmed: `max_followup_age_days=7`, daily run at 09:00 IST (OD-17).

## Technical discoveries

- Google Sheets cells hold max 50,000 characters → long transcripts may be truncated; deterministic `TRANSCRIPT_POSSIBLY_TRUNCATED` check.
- Gmail `gmail.metadata` scope does not support search queries; reconciliation needs `gmail.readonly` (OD-07).
- Whether Gmail preserves a client-supplied `Message-ID` is unverified (OD-16).
- Claude Code auto-discovers skills only under `.claude/skills/`; this repo's `skills/` is application content.
- Read Sheets dates with `UNFORMATTED_VALUE` + `SERIAL_NUMBER` to avoid dd/mm vs mm/dd ambiguity. Verified: the source sheet's `Date` and `Time of the call` are real date/time cells, and the sheet timezone is `Asia/Calcutta` (= Asia/Kolkata).
- **Source sheet (verified):** spreadsheet `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, worksheet `Calls DONE` (GID 1314582701), a shared CSC team workbook. Mapping: `Date`, `Time of the call`, `Customer Name`, `Email`, `Call lead by(who took the call)`, `Recording URL` (Fathom `/share/` links), `Meeting Notes`, `Transcript` (direct text, `[HH:MM:SS] Speaker: text`).
- Missing in the sheet: Call ID, Fathom recording ID, structured call status (`Customer Not Came` / `Cancel` columns unused; outcome is free text in `Meeting Notes`), opt-out, call type.
- An existing automation fills `Transcript` and `AI Summary`; `Recording Sent` suggests manual recording emails (OD-29). Transcripts can be empty the day after a call. Some transcripts contain Hindi.
- Data issues: trailing spaces in emails, whitespace-only URLs, two URLs in one cell, the same URL in two rows, inconsistent name casing, rows created before the call, date-only placeholder rows.
- Internal columns (`Mistakes…`, `Bugs…`, `Suggetions…`) must never reach prompts or logs.
- The Sheets MCP `get_values` result for transcripts can exceed the tool output limit and spill to a file under `~/.claude/projects/.../tool-results/`. Delete such files after use (they contain real customer data).
- Python's `zoneinfo` on Windows needs the `tzdata` package (no system tz database); add it as a dependency in Phase 1.
- A run between 00:00 and 05:30 IST has a different UTC date — the main reason target-date logic must never use server/UTC time.

## Environment

- Repository lives at `C:\dev\post-call-email-agent` (not synced). Synthetic data only still applies.
- Python is **not installed** on the dev machine (Store alias only). Git 2.55 available. Repo on `main` with commits.
- A Google Sheets MCP connector is available in Claude Code for read-only inspection. It is a development tool, not the production integration.
