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
**Consequences:** Needs a writable `call_id` column or upstream ID (OD-02). See `docs/call-id-strategy.md`.

### D-003 — Outcome categories in analysis and validation (2026-10-31)
**Decision:** Every item is exactly one of `discussed`, `explained`, `completed`, `pending_customer_action`, `pending_support_action`, with transcript evidence. Validation blocks any misrepresentation.
**Rationale:** The main risk of a follow-up email is telling a customer something is fixed when it is not, or assigning work to the wrong party.

### D-004 — Delivery state machine with idempotency and recovery (2026-10-31)
**Decision:** States `PENDING`, `PROCESSING`, `VALIDATING`, `SENT`, `FAILED`, `SKIPPED`; write-ahead before send; deterministic Message-ID; Gmail reconciliation; no automatic resend when ambiguous. `SENDING` proposed as an additional state (OD-15).
**Rationale:** Prevent duplicates, including Gmail-succeeded/tracking-failed.

### D-005 — SKILL.md files are loaded explicitly by Python (2026-10-31)
**Decision:** Skills are modular Markdown files with a fixed section contract, loaded and versioned by the runtime. Claude Code skills are not assumed to run in production.
**Consequences:** Skill versions recorded per email. See `docs/skills-runtime.md`.

### D-006 — Python 3.12, plain Python (2026-10-31)
**Decision:** No agent frameworks. Official SDKs only.

### D-007 — Anthropic API for runtime inference (2026-10-31)
**Decision:** Subject to API access and company approval. Model IDs come from configuration and are not hardcoded until confirmed.

### D-008 — Platform (2026-10-31)
**Decision:** Gmail for sending; Google Sheets for data and tracking; Google Cloud Run for execution; Google Cloud Scheduler for scheduling.

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
