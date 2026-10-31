# Decision Log

Accepted decisions. Newest last. Each entry: ID, date, decision, rationale, consequences. Never delete entries; supersede them with a new entry.

---

### D-001 — Google Sheets is the only MVP data source (2026-10-31)
**Decision:** Customer info, transcripts and Fathom URLs are read from Google Sheets. No Fathom API/MCP integration in the MVP.
**Rationale:** Keeps the MVP small; data already flows into Sheets.
**Consequences:** 50,000-character cell limit can truncate transcripts → `TRANSCRIPT_POSSIBLY_TRUNCATED` check.

### D-002 — Stable, immutable Call IDs; never row numbers (2026-10-31)
**Decision:** `fathom:{id}` when a verified recording ID exists, otherwise `gen:{uuid4}` assigned once and stored with the row. A source fingerprint is a secondary duplicate guard.
**Rationale:** Rows move; identity must not.
**Consequences:** Needs a writable `call_id` column or upstream ID (OD-02). See `docs/call-id-strategy.md`. *Refined by D-024 (AD column, `gen:` only) and D-025 (fingerprint no longer uses the URL).*

### D-003 — Outcome categories in analysis and validation (2026-10-31)
**Decision:** Every item is exactly one of `discussed`, `explained`, `completed`, `pending_customer_action`, `pending_support_action`, with transcript evidence. Validation blocks any misrepresentation.
**Rationale:** The main risk of a follow-up email is telling a customer something is fixed when it is not, or assigning work to the wrong party.

### D-004 — Delivery state machine with idempotency and recovery (2026-10-31)
**Decision:** States `PENDING`, `PROCESSING`, `VALIDATING`, `SENT`, `FAILED`, `SKIPPED`; write-ahead before send; deterministic Message-ID; Gmail reconciliation; no automatic resend when ambiguous. `SENDING` proposed as an additional state (OD-15) — accepted in D-017.
**Rationale:** Prevent duplicates, including Gmail-succeeded/tracking-failed.

### D-005 — SKILL.md files are loaded explicitly by Python (2026-10-31)
**Decision:** Skills are modular Markdown files with a fixed section contract, loaded and versioned by the runtime. Claude Code skills are not assumed to run in production.
**Consequences:** Skill versions recorded per email. See `docs/skills-runtime.md`.

### D-006 — Python 3.12, plain Python (2026-10-31)
**Decision:** No agent frameworks. Official SDKs only.
**Status:** *Superseded for the primary architecture by D-026* (no Python application). "No agent frameworks" still applies. Kept in `future-alternatives.md` §1.

### D-007 — Anthropic API for runtime inference (2026-10-31)
**Decision:** Subject to API access and company approval. Model IDs come from configuration and are not hardcoded until confirmed.
**Status:** *Superseded by D-026* (Claude model via the user's subscription in scheduled tasks). Kept in `future-alternatives.md` §2.

### D-008 — Platform (2026-10-31)
**Decision:** Gmail for sending; Google Sheets for data and tracking; Google Cloud Run for execution; Google Cloud Scheduler for scheduling.
**Status:** *Partly superseded by D-026.* Gmail and Google Sheets remain, now through native connectors. Cloud Run and Cloud Scheduler are replaced by a Claude Code scheduled task and kept in `future-alternatives.md` §4.

### D-009 — Timezone Asia/Kolkata (2026-10-31)
**Decision:** Production schedule and all stored timestamps use Asia/Kolkata (ISO 8601 with `+05:30`).

### D-010 — Dashboard is a future, decoupled component (2026-10-31)
**Decision:** Dashboard reads only `POST_CALL_EMAIL_LOGS` and `POST_CALL_EMAIL_EVENTS`. Schema changes are additive.

### D-011 — Synthetic data only in workspace, Git and ordinary logs (2026-10-31)
**Decision:** No real transcripts, personal data or credentials in OneDrive, Git or ordinary logs.

### D-012 — Local Git repository (2026-10-31)
**Decision:** Git initialised on branch `main`; secrets, credentials, logs and generated customer data git-ignored.

### D-013 — Daily previous-day call processing (2026-10-31)
**Decision:** Each scheduled run computes `target_date = today(Asia/Kolkata) − 1` once at start and selects source records whose call date (in Asia/Kolkata) equals it. The server timezone is never used. Pipeline order: FETCH → FILTER PREVIOUS-DAY → CHECK ELIGIBILITY → CHECK DUPLICATES → ANALYSE → GENERATE → VALIDATE → SEND → UPDATE TRACKING, with RECOVER after fetch. Manual `TARGET_DATE` override for reruns.
**Rationale:** User requirement. Transcripts are available by the next morning; customers get one predictable follow-up.
**Consequences:** Supersedes the hourly-schedule recommendation in OD-17 and the "send delay" in OD-10. See `docs/pipeline.md`.

### D-014 — `POST_CALL_EMAIL_LOGS` is the tracking worksheet and stores the final email body (2026-10-31)
**Decision:** The tracking worksheet is named `POST_CALL_EMAIL_LOGS` and records customer information, status, reasons, timestamps and the final email body. Append-only audit events go to `POST_CALL_EMAIL_EVENTS`.
**Consequences:** Replaces the earlier `Email_Tracking` / `Email_Events` / `Email_Content` proposal. The worksheet holds personal data → restricted access (OD-19).

### D-015 — Deferrable vs terminal eligibility outcomes (2026-10-31)
**Decision:** A separate deterministic eligibility component runs before any LLM call and returns `ELIGIBLE`, `DEFER` or `SKIP`. Missing data that may still arrive (transcript, Fathom URL/shareability, customer name/email) keeps the record `PENDING` with a `pending_reason`, rechecked each run until `pending_until`, then `SKIPPED` with the same code. Cancelled calls, no-shows, opt-outs and similar are terminal immediately. A terminal failure beats a deferrable one.
**Rationale:** Missing transcripts must be recorded as pending, never discarded, and must be processed when they arrive later.

### D-016 — Per-record failure isolation (2026-10-31)
**Decision:** Each record runs in its own error boundary; a failure marks only that record `FAILED`. The run stops claiming new records only on config errors, unreadable sheets at fetch, `GMAIL_AUTH_ERROR`, or the LLM circuit breaker. Unclaimed records are left untouched as `PENDING`.

_The Phase 0 documentation and the previous-day design (D-001 … D-016) were approved by the user on 2026-10-31._

### D-017 — `SENDING` state adopted (2026-10-31)
**Decision:** The state machine has seven states: `PENDING`, `PROCESSING`, `VALIDATING`, `SENDING`, `SENT`, `FAILED`, `SKIPPED`. Resolves OD-15.
**Rationale:** Lets recovery tell "an email may have left" apart from "validation unfinished", which is the duplicate-send risk.

### D-018 — Discovery lookback of 2 days (2026-10-31)
**Decision:** `discovery_lookback_days = 2`. Each run also discovers unlogged calls dated up to 2 days before `target_date`. Resolves OD-24.
**Rationale:** A missed or failed daily run fixes itself; duplicates stay impossible.

### D-019 — Wait window of 1 day for late data (2026-10-31)
**Decision:** `transcript_wait_days = 1`. `pending_until` = run date of the first deferral + 1 day, at 23:59:59 IST. Eligibility is always rechecked before expiry, so data arriving any time before the next run after `pending_until` is still used. Resolves OD-25.
**Consequences:** A call is normally either emailed or closed by the second run after its call date (e.g. call 30 Oct → closed by the 2 Nov run).

### D-020 — Python 3.12 with uv; repository outside OneDrive (2026-10-31)
**Decision:** Python 3.12 from python.org, dependencies managed with `uv`. Move the repository out of OneDrive to a non-synced folder before Phase 1 code is written. Resolves the main part of OD-21 (remote hosting still open).
**Update (2026-10-31):** Repository moved to `C:\dev\post-call-email-agent`.
**Status:** *Python + uv superseded by D-026* for the primary architecture (needed only if helper scripts, OD-38, or the future-alternatives design are adopted). The repository location stays.

### D-021 — Verified source: `Calls DONE` worksheet (2026-10-31)
**Decision:** The source is spreadsheet `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, worksheet `Calls DONE` (GID `1314582701`), with columns mapped by exact header text: `Date`, `Time of the call`, `Customer Name`, `Email`, `Call lead by(who took the call)`, `Recording URL`, `Meeting Notes`, `Transcript`. The sheet is read-only for the agent unless OD-02 approves a Call ID column (approved later in D-024).
**Basis:** Read-only inspection through the Google Sheets MCP connector; details in `docs/source-sheet-profile.md`.
**Consequences:** Resolves OD-03 (no recording IDs) and OD-28 (date cells, IST). Updates OD-01, OD-02, OD-04, OD-26. Adds OD-29 … OD-32. Internal columns (`Mistakes…`, `Bugs…`, `Suggetions…`) are excluded from prompts and logs.
**Update:** The read-only status is superseded by D-024 (AD writes only).

### D-022 — Controlled transition from manual to automated recording emails (2026-10-31)
**Decision (business):** Support executives stop manually sending post-call recording emails once the agent officially goes live. Until then the manual process continues and the agent runs in draft/test mode. At go-live the agent becomes the designated sender for eligible post-call emails.
**Design:**
- `DELIVERY_MODE` = `dry_run` / `test` / `shadow` / `live`; only `live` emails customers.
- `GO_LIVE_DATE`: in `live` mode, calls before it → `BEFORE_GO_LIVE`.
- `Recording Sent = yes` (any case) → `RECORDING_ALREADY_SENT`, checked at eligibility and again before sending. Unrecognised values → `RECORDING_SENT_STATUS_UNCLEAR`.
- An empty `Recording Sent` is **not** treated as "never sent". The go-live cut-over date, not the empty cell, is what authorises sending.
- The agent never writes `Recording Sent`.
- Rollback: switch back to `shadow`.
**Resolves:** OD-29 (b, c). Open details: OD-34 (date, drafts), OD-35 (reports).

### D-023 — Existing transcript automation stays independent (2026-10-31)
**Decision (business):** The automation that fills `Transcript` and `AI Summary` stays independent. The agent consumes `Transcript` from the source worksheet, never writes `Transcript` or `AI Summary`, and accounts for late transcripts.
**Design:** read-only consumption; deferral for late transcripts (D-019); transcript hash re-checked before sending; conflicts C1–C8 documented in `source-sheet-profile.md` §7.
**Resolves:** OD-29 (a) in principle. Name, owner and schedule remain open (OD-33).

### D-024 — Call ID stored in source column AD `POST_CALL_CALL_ID` (2026-10-31)
**Decision (business):** Permission granted to use the empty column AD of `Calls DONE` with header `POST_CALL_CALL_ID`. This is the **only** approved modification to the source worksheet; all other processing and email logs stay in `POST_CALL_EMAIL_LOGS`.
**Design:**
- `gen:{uuid4}`, generated once, never overwritten.
- The Fathom URL is never part of the identity.
- Write-safe assignment: row signature from Date, Time, Email, Name and Zoom Meeting URL; pre-write and post-write verification; single-cell writes to empty AD cells only.
- Header guard on every run; code-level write guard; recommended protected ranges (OD-36).
- No backfill of historical rows. Handling of invalid, duplicated and cleared IDs is defined.
- See `docs/call-id-strategy.md`.
**Resolves:** OD-02.

### D-025 — Multiple recording URLs in one cell are segments of one call (2026-10-31)
**Decision (business):** Two or more Fathom URLs in one `Recording URL` cell mean the call was extended and Fathom created separate recording segments. They belong to the same customer interaction, and every valid link goes into the same email.
**Design:**
- Extract and validate every URL; keep the original order; remove duplicates within the cell (first occurrence wins).
- A malformed token flags the row (`INVALID_FATHOM_URL`, deferrable); no partial-recording email.
- The email explains naturally that the call continued across recordings, with `Part n` labels.
- The Call ID identifies the call, not a segment. One call = one email, whatever the segment count.
- The same URL in **different rows** is not assumed to be the same call; each row is investigated separately by Call ID and row data (policy details OD-31).
**Supersedes:** the earlier OD-31 recommendation to defer two-URL cells as invalid.

### D-026 — Claude Code scheduled tasks + native Google connectors as the primary architecture (2026-10-31)
**Decision (business):** Avoid separate API and cloud costs by using the capabilities of the existing Claude subscription. The primary architecture becomes a **Claude Code scheduled task** (daily 09:00 Asia/Kolkata) running the repository's runbook and skills with the Claude model from the user's plan. Data access uses the **native Google Sheets and Gmail connectors** (OAuth). Persistent state lives in `POST_CALL_EMAIL_LOGS` / `POST_CALL_EMAIL_EVENTS` and source column AD.
**Status:** **Proposed until Phase 1 validation** of scheduled connector access, instruction availability, write restriction, unattended sending, persistence, recovery, overlap, usage limits, failure reporting, deterministic steps, data handling and connector identity (R-01 … R-13 in `docs/scheduled-execution.md`).
**Supersedes for the primary path:** D-006 (Python runtime), D-007 (Anthropic API), the Cloud Run / Cloud Scheduler parts of D-008, and the Python + uv part of D-020. These are retained in `docs/future-alternatives.md`.
**Unchanged:** all business rules and safety controls D-001 … D-005, D-009 … D-019, D-021 … D-025 (delivery modes, manual-send transition, AD-only writes, transcript handling, multi-segment recordings, deferral, duplicate prevention, privacy).
**Consequences:**
- Write restriction and the email boundary have no code guard. **Corrected 2026-10-31:** instructions and agent checks do not enforce AD-only writes; only verified protected-range permissions do, and they only bind a non-owner connector account (R-03, OD-36). Real-sheet writes are blocked until that is verified.
- Deterministic Message-ID reconciliation is replaced by a **human-review process** for any send that cannot be positively confirmed (OD-41). *Corrected 2026-10-31:* the earlier footer-reference proposal is withdrawn; no technical marker is added to customer emails.
- Deterministic steps may need in-session helpers (OD-38).
- Testing moves from in-memory fakes to scenario runs on a test copy of the spreadsheet.
- Claude plan usage is consumed and limited (R-09).
- New open decisions OD-37 … OD-41; OD-07, OD-16, OD-22 superseded; OD-12, OD-17, OD-21, OD-23, OD-36 revised.

### D-027 — Cloud-first scheduling test with minimal connector scope (2026-10-31)
**Decision (business, corrections of 2026-10-31):** (1) Instructions and agent checks are documented as **not** enforcing the AD-only write rule; only verified protected ranges do, and real-sheet writes are blocked until they are verified (R-03, OD-36). (2) OD-41 reworked: no technical reference or footer in customer emails; an uncertain send stops and goes to **human review**, with no automatic resend. (3) OD-37: test **cloud** scheduled execution first, if available; desktop only as a fallback; nothing assumed to work until verified.
**Phase 1 actions taken (read-only):** local Sheets connector checks; one **disabled, manual-only** cloud routine with the Google Sheets connector only, run once. No spreadsheet writes, no Gmail calls, no recurring schedule.
**Evidence recorded in `docs/phase1-results.md`:** cloud scheduling is available; a cloud run read the sheet through the native connector; project instructions are **not** reachable without a remote repository (blocked); `Calls DONE` has no protected ranges; routine tool/connector settings are not reliable restrictions; API-created routines attach all account connectors by default (OD-42).
