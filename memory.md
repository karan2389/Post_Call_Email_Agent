# memory.md

Durable project knowledge only: architectural decisions, technical discoveries, milestones. Not a conversation log. Full rationale lives in `docs/decisions/decision-log.md`; open items in `docs/open-decisions.md`.

## Milestones

- 2026-10-31 — Phase 0 initialisation complete: structure, Git, documentation, four SKILL.md specs.
- 2026-10-31 — Previous-day processing requirement designed (D-013 … D-016, `docs/pipeline.md`).
- 2026-10-31 — User approved the Phase 0 documentation and previous-day design; committed to Git. Phase 1 not yet started (needs Python 3.12 and OD-15/21/24/25).

## Accepted decisions (D-001 … D-016)

- Daily run: `target_date = today(Asia/Kolkata) − 1`, computed once per run; server timezone never used; `TARGET_DATE` manual override. Order: FETCH → (RECOVER) → FILTER PREVIOUS-DAY → ELIGIBILITY → DUPLICATES → ANALYSE → GENERATE → VALIDATE → SEND → UPDATE TRACKING.
- Eligibility is deterministic and pre-LLM: `ELIGIBLE` / `DEFER` / `SKIP`. Missing transcript, Fathom URL/shareability or customer details → `PENDING` + `pending_reason`, rechecked each run until `pending_until`, then `SKIPPED` with the same code. Cancelled, no-show, opted-out → terminal. Terminal beats deferrable.
- Tracking worksheet `POST_CALL_EMAIL_LOGS` holds the final email body, customer info, status and timestamps; `POST_CALL_EMAIL_EVENTS` is the append-only audit trail.
- Per-record error boundary; the run stops claiming only on config error, unreadable sheets, Gmail auth error or the LLM circuit breaker.

- Google Sheets is the only MVP source (customer info, transcript, Fathom URL). No Fathom API/MCP.
- Call ID: `fathom:{id}` if verified, else `gen:{uuid4}`; immutable; stored with the row. Never row numbers. `source_fingerprint` (email + normalised URL) is a secondary duplicate guard.
- Five outcome categories: `discussed`, `explained`, `completed`, `pending_customer_action`, `pending_support_action`. When unsure, choose the less complete category.
- States: `PENDING`, `PROCESSING`, `VALIDATING`, `SENT`, `FAILED`, `SKIPPED` + proposed `SENDING`. Gmail is called only from `SENDING` after a write-ahead of the planned `rfc822_message_id`. Ambiguous sends → `SEND_UNCONFIRMED`, never auto-resent.
- SKILL.md files are loaded explicitly by Python with a fixed section contract; versions recorded per email.
- Python 3.12, plain Python, official SDKs only. Anthropic API; model IDs from config only (unset until confirmed).
- Gmail / Sheets / Cloud Run / Cloud Scheduler. Timezone Asia/Kolkata, ISO 8601 `+05:30`.
- Dashboard is future and reads only `POST_CALL_EMAIL_LOGS` + `POST_CALL_EMAIL_EVENTS`; schema changes are additive.
- Synthetic data only in workspace, Git and ordinary logs. Logs carry IDs and codes, never content.

## Working assumptions (not yet confirmed)

- "Customer's perspective" = email to the customer from support, centred on their goals (OD-05).
- English-only emails, plain text, 80–250 words (OD-08, OD-09).
- Sensitive topics (refunds, legal, security…) are skipped for a human (OD-11).
- Proposed defaults: `discovery_lookback_days=2` (OD-24), `transcript_wait_days=3` (OD-25), `max_followup_age_days=7`, daily run at 09:00 IST (OD-17).

## Technical discoveries

- Google Sheets cells hold max 50,000 characters → long transcripts may be truncated; deterministic `TRANSCRIPT_POSSIBLY_TRUNCATED` check.
- Gmail `gmail.metadata` scope does not support search queries; reconciliation needs `gmail.readonly` (OD-07).
- Whether Gmail preserves a client-supplied `Message-ID` is unverified (OD-16).
- Claude Code auto-discovers skills only under `.claude/skills/`; this repo's `skills/` is application content.
- Read Sheets dates with `UNFORMATTED_VALUE` + `SERIAL_NUMBER` to avoid dd/mm vs mm/dd ambiguity; serials are in the spreadsheet's timezone, which must be Asia/Kolkata (OD-28).
- Python's `zoneinfo` on Windows needs the `tzdata` package (no system tz database); add it as a dependency in Phase 1.
- A run between 00:00 and 05:30 IST has a different UTC date — the main reason target-date logic must never use server/UTC time.

## Environment

- Workspace is inside OneDrive (syncs to cloud) — synthetic data only; consider moving the repo out (OD-21).
- Python is **not installed** on the dev machine (Store alias only). Git 2.55 available. Repo initialised on `main`, no commits yet.
