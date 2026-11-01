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

### D-052 — Controlled storage test passed; Phase 3 closed with limitations (2026-11-01)

**Decision:** on the user's authorisation ("Authorise test") one synthetic row was written to the destination through the guard, read back with 0 mismatches, the 15 existing rows were shown unchanged, the planner re-ran as idempotent on the stored rows, and the test row was cleared; `writes_enabled` was set back to false. Phase 3 is marked complete with the limitations in `docs/phase3-acceptance-report.md` section 12. No real record was written, replaced or deleted; nothing was sent.

### D-051 — Three stale test expectations aligned to D-044 (2026-11-01)

**Decision (user instruction "Update them"):** F2, P2-07 and P2-13 expectations and three Phase 2 check rules were aligned to the coverage-first policy (D-044); originals kept in `tests/fixtures/_history/2026-11-01-before-d044-alignment/`; changed after the failures were seen, so disclosed as not a blind re-test (report section 10.1). Scores after: nine cases 9/9, Phase 2 harness 25/25.

### D-050 — Regression findings fixed in two skills; Gmail connector facts recorded (2026-11-01)

**Decision:** the Phase 4 regression found two skill defects, fixed in email-generation 1.6.1 (owner-neutral done heading) and customer-summary 1.4.1 (a pending item is never cited in `covered`). Three expectations are stale against D-042/D-044 (F2 completed-owner, P2-07 skip, P2-13 uncertain-owner confidence) and were NOT edited; they need the user's decision (`docs/phase3-acceptance-report.md` section 10). Gmail connector facts (schemas only, one read-only metadata lookup) are in `docs/phase4-gmail-integration.md`.

### D-049 — Sending state machine, send key, draft versioning, pre-send checks (2026-11-01)

**Decision (user instruction):** `src/lib/sendstate.js`: the 12 states and transitions (SENT and SKIPPED terminal; VALIDATION_FAILED and REVIEW_REQUIRED cannot reach READY_TO_SEND except by named human decision); send key = hash of record fingerprint + recording URL set, stable per call and independent of the draft, so a changed draft cannot create a second send; draft hash = recipient + subject + body; an authorised resend must name a reason and person and be bound to that draft hash, and is never automatic; ten pre-send checks; reconciliation marks SENT only on exactly one matching Sent message with a verified body hash, otherwise RECONCILIATION_REQUIRED (human). **Limit:** the Gmail connector has no idempotency key, so this is not exactly-once delivery. Tests: `tests/unit/phase4.test.js`.

### D-048 — Deterministic spreadsheet write guard (2026-11-01)

**Decision (user instruction, Phase 4 master task):** every spreadsheet write must pass `authorizeWrite()` (`src/lib/guard.js`, CLI `node src/p3.js guard-write`, exit 4 = rejected) before the connector call. Only the destination ID `1_TxhedZ...` is approved; the source, the backup and any unknown ID are rejected whatever the gates say; non-connector paths, non-write tools, a copy target outside the destination, and a config destination that differs from the approved ID are rejected; `writes_enabled`, `destination_sharing_verified` and `headers_verified` must all be true.

**Limits (stated honestly):** the guard is a code check the session is instructed to call; it cannot stop a connector call made without it. The connector account is Editor on the source, so source read-only is enforced by instructions plus this guard, not by Google. Destination sharing remains user-confirmed, not verified. Tests: `tests/unit/phase3.test.js` (28 groups).

### D-047 — Three older-skill drafts replaced on the user's explicit authorisation (2026-11-01)

The user authorised replacing the stored drafts of source rows 15451, 15448 and 15442 (written by email-generation 1.4.0 and 1.5.0) with the validated coverage-first drafts. Overwriting a stored body is normally forbidden (D-036 rule: never overwrite a draft automatically); this was an explicit, one-time authorisation for these three rows only. Done with pre-write identity checks and a program read-back (0 mismatches over 7 rows). The previous bodies are not retained; the notes keep their skill version, word count and the reason. Rule unchanged for the future: no automatic overwrite. `writes_enabled` is `false` again. All 7 stored drafts now come from ta 1.6.0 / cs 1.4.0 / eg 1.6.0 / ev 1.5.0.
### D-046 — Destination sharing user-confirmed restricted; four drafts stored (2026-11-01)

The user confirmed that `Phase 3 Emails` is now restricted (correcting the report of broad Editor access that D-045 treated as unresolved). The agent cannot verify sharing; the flag `destination_sharing_verified: true` is therefore user-confirmed, not independently verified. Under the standing authorisation to store drafts once that gate is satisfied, four validated drafts were stored: two new rows (source rows 15443, 15445) and two in-place updates of body-less rows left by the retired low-confidence skip (15450, 15447; history kept in the notes). Existing stored bodies (15442, 15448, 15451) were not overwritten. Read-back verified cell by cell by program (0 mismatches); idempotency planning shows no new or duplicate rows. `writes_enabled` is back to `false`. New helper: `node src/p3.js verify-rows` compares a read-back with the intended rows from the recorded tool result without retyping. D-045 is superseded by this entry for the sharing gate only; the source read-only state remains user-confirmed (D-039), not verified.
### D-045 — Destination storage blocked: sharing unverified after a user report of broad access (2026-11-01)

The user reported that `Phase 3 Emails` was made accessible to everyone with Editor rights and asked that this be treated as unresolved until independently confirmed or corrected. The Sheets connector cannot show sharing settings or its own access level, so it cannot be confirmed from this repository. Consequence: no write to the destination in the full-coverage run (`writes_enabled` stayed `false`); the seven drafts are held in a temporary folder outside the repository; idempotency was checked by planning only. This **supersedes the user-confirmed `destination_sharing_verified: true` of D-039** until the user confirms the sharing again; the config flag is set back to `false`. The 13 rows already stored by the earlier runs remain in the sheet and are a potential exposure if it is broadly shared. Results: `docs/phase3-acceptance-report.md` section 9.
### D-044 — Coverage-first pipeline: low confidence no longer means no email (2026-11-01)

**Decision (user):** maximise draft coverage; difficult transcripts get more conservative emails, never an automatic absence of an email. Implemented: transcript-analysis 1.6.0 (quality never causes a skip; statement-level confidence; `transcript_quality`, `generation_mode` full/conservative/neutral_fallback, `analysis_notes`; skips only for no-show, nothing substantive, internal calls, ambiguous recipient and policy-required sensitive topics; `sales`/`onboarding`/`other` calls analysed), customer-summary 1.4.0 (only medium/high items stated; low ones omitted and recorded in `analysis_gaps`; neutral_fallback summary), email-generation 1.6.0 (neutral fallback email; `caveats` instead of blocking `review_flags`; no credentials; no unsupported legal/financial/security statements), email-validation 1.5.0 (confidence never a condition; low-confidence-only claims, contradictions, invented technical content and sensitive information fail; `email_class`; new code `SENSITIVE_INFO_INCLUDED`). Pipeline: `src/lib/policy.js` retires `ANALYSIS_LOW_CONFIDENCE`/`TRANSCRIPT_INCOMPLETE` as outcomes (superseded by a fallback email), ownership uncertainty no longer triggers review, `min_transcript_chars` is now a floor of 40, the three-call cap is not applied to full-coverage runs, rows stored under the retired codes can be superseded in place by a draft. **Unchanged:** OD-11 (sensitive topics such as refunds, billing disputes, legal and security → `REVIEW_REQUIRED`, no email text), genuine no-shows and cancellations, storage rules, D-036 fingerprints. Tension noted: the instruction to write a neutral email for sensitive information concerns credentials and personal data inside an email (handled by the validator), not sensitive topics, which stay under OD-11 unless you decide otherwise. Tests and results: `docs/phase3-acceptance-report.md` section 9.
### D-043 — Exact transcript hash from the recorded connector result (2026-11-01)

A transcript hash was unreliable because the session copied the transcript into a file by retyping it (one worker's copy was a paraphrase; another's copy was one character longer than the real cell: 27,084 vs 27,083 characters). New design: workers never save, retype or hash a transcript; the orchestrator recovers the cell value byte for byte from the worker's own recorded `get_values` tool result (`node src/p3.js extract-transcript <agent log> <row>`, `src/lib/transcript.js`) and hashes the UTF-8 bytes of the cell string exactly as the connector returned it (no trimming); `hash_verified: true` only when that result is found. Limits: it relies on the harness log format (`subagents/agent-*.jsonl`) and proves that the cell value equals what the worker saw, not that the worker read it perfectly. Hashes stored before this decision (source rows 15450 and 15451, `p3-dryrun-2026-11-01-1`) remain unverified.
### D-042 — transcript-analysis 1.5.0: guided on-screen steps are `completed` when the transcript shows performance and a completion signal (2026-11-01)

**Decision (user, chosen from the two upstream gaps found in the second dry run):** fix the guided-action classification first. transcript-analysis now says a guided step is `completed` (owner = performer, normally the customer, `guided_by: support`) when it has both a performance basis (existing ownership rules) and at least one completion signal tied to that step: the customer confirms it, support states the result as a present state ("saved", "it is published now", "this is created"), or a later part of the call uses the result. Instructions, questions, "okay", "you can" and descriptions of later events are not signals; a step shown not to have worked is not completed; a completed step is never also pending; a step that stays unclear in a garbled passage remains `explained` with low confidence and is not guessed either way. The "choose the less complete category" rule no longer applies to a step that meets the signals, because understating a clearly completed step produces "still open" wording in the email. Example B2 and two edge cases added. customer-summary, email-generation and email-validation are unchanged. **Not regression-tested and not re-run on any record.** The second gap (a rule for low-confidence items) is still open. Skill versions: ta 1.5.0, cs 1.3.0, eg 1.5.0, ev 1.4.0.
### D-041 — Email-generation 1.5.0 wording and status refinement; second controlled dry run on 30 October 2026 (2026-11-01)

After human review of the first real draft (source row 15451), email-generation was refined to 1.5.0: four distinct statement kinds (completed during the call / explained or demonstrated / still to do by the customer / status cannot be established); "still open" wording only for pending or unresolved summary entries, once per email; no contradictions; one action and outcome per bullet; concrete wording, no unsupported promises; customer-owned follow-ups under the customer next steps; optional `review_flags: ["STATUS_UNCLEAR"]` so unclear key outcomes are stored as `REVIEW_REQUIRED` without email text; friendlier headings as guidance. Ownership, recordings, UTF-8 checks, length policy, sensitive-topic review and the validator are unchanged. The independent review of the first draft found that the main cause is upstream: guided on-screen actions were classified `explained` (not `completed`) by transcript-analysis/customer-summary on a garbled transcript; that is **not changed here** (no request) and is recommended for a separate decision. Checks run: skill consistency checks (11/11 pass), the skill's example email through the deterministic checks (clean), `tests/unit/phase3.test.js` (19 groups pass). Not regression-tested end to end. A second controlled real-data dry run on 2026-10-30 calls followed (9 source records: 2 no-show, 2 cancelled, 3 processed -> 2 validated drafts + 1 review-required, 7 rows written and read back, no duplicates, `writes_enabled` back to false); results in `docs/phase3-acceptance-report.md` section 8. Found: transcript hashes cannot be made byte-exact through the model (not stored this run; the first run's hashes unverified); the planner now has `NOOP_REVIEW_PENDING`.
### D-040 — Phase 3 controlled dry run and acceptance: partially complete (2026-11-01)

Controlled real-data dry run (target date 2026-10-31, cap three eligible calls) after the destination setup of D-039: 6 source records; 2 skipped as no-show (E2); 4 transcripts read: 2 empty (deferred, `MISSING_TRANSCRIPT`), 1 skipped by the analysis (`ANALYSIS_LOW_CONFIDENCE`, garbled), 1 validated draft stored (`PASSED`/`DRAFT_READY`; deterministic checks clean; independent validator PASS). 6 rows written to `Phase 3 Emails`, read back and matched; duplicate planning on a rerun gave no new rows and no overwrite. Source: reads only. Backup: not accessed. Gmail: not used. No email, no schedule, no customer data in the repository. `writes_enabled` set back to `false`. **Phase 3 is partially complete:** no human review of the draft yet, no sensitive-topic case exercised, one draft only, real collision handling and a second write run not exercised, the two security gates rest on user confirmation. OD-04 confirmed by the user in chat; OD-10 (`min_transcript_chars: 600`) and OD-32 (title-cased names) applied from their recommendations and still need your confirmation. Report: `docs/phase3-acceptance-report.md`.
### D-039 — Phase 3B implementation: helpers approved, OD-11 decided, security gates confirmed, destination setup performed (2026-11-01)

**Decisions (user):** (1) **OD-38 approved:** small deterministic helpers in `src/` (`p3.js`, `lib/normalize|eligibility|destination|policy.js`), dependency-free, no network, no credentials, no spreadsheet access, tests in `tests/unit/phase3.test.js`. (2) **OD-11 decided:** sensitive topics (refunds and disputes, billing disputes, legal threats or complaints, security incidents or suspected compromise, sensitive personal information, other high-risk situations, and ambiguity where a customer request could be mistaken for a confirmed company commitment) are `REVIEW_REQUIRED` with no generated email; `sensitive_topics_require_human: true` in `config/email_policy.yaml`. The existing skills already flag the topics and are unchanged. (3) **Security gates confirmed by the user in chat (not independently verifiable by the agent):** the connector account is Viewer on the source or an equivalent Google-enforced restriction exists, and `Phase 3 Emails` is shared only with named support leads with link sharing off. Config: `source_access_enforced: true`, `destination_sharing_verified: true`, both marked user-confirmed. This supersedes the unresolved state of D-038.
**Performed (2026-11-01):** the one-time destination setup, authorised by the master task after those confirmations: destination re-read (empty, no structures, revision unchanged); columns A, B, F, O, P, Q set to plain text for rows 1-1000; row 1 frozen; the 21 headers written to `Sheet1!A1:U1`; read-back verified exactly (`headers_verified: true`). No data row was written. `writes_enabled` stays `false` until the controlled dry run is enabled. No source write, no backup access, no Gmail, no schedule.
**Not decided:** OD-04 (Fathom link shareability): `fathom_shareability_confirmed: false` makes the documented E10 rule defer every record. `min_transcript_chars: 600` is the OD-10 recommended value, proposed, not separately approved. The four skills' latest refinements remain untested by regression. Unchanged: D-036, D-037, D-038.
### D-038 — Connector account and access levels recorded; source protection not enforced (2026-11-01)

**Information (confirmed by the user, reported to the agent; not independently verifiable through the Sheets connector):** the Google Sheets connector account is `karan.s@flexifunnels.com`. Access: **Editor (read + write) on `CSC  Booking - All Agents`** (the source) and **Editor (read + write) on `Phase 3 Emails`** (the destination). `Calls DONE` has no protected ranges. Consequently the connector account can potentially modify the source, and **source write protection is NOT enforced** (`source_access_enforced: false`).
**Unresolved (not claimed complete):** (1) **Source protection.** Recommended: change `karan.s@flexifunnels.com` to Viewer on the source; the account stays Editor on the destination. Alternative: an equivalent Google-enforced restriction that prevents this account from modifying `Calls DONE`. Prompt instructions alone do not provide protection (R-03, R-15, OD-36). (2) **Destination sharing.** `Phase 3 Emails` must be shared only with named, authorised support leads with general link sharing disabled; the account's Editor access does not establish who else can access it.
**Configuration:** `writes_enabled`, `header_setup_authorized`, `headers_verified`, `source_access_enforced` and `destination_sharing_verified` stay `false`. No Google permission was changed, no spreadsheet read or written, no setup performed. Builds on D-037; D-036 unchanged.
### D-037 — Real-transcript processing and customer-data storage approved; setup preconditions (2026-11-01)

**Decision (user, explicit):** (1) real customer call transcripts may be processed using Claude (OD-12); (2) customer names, email addresses, Fathom recording URLs, email subjects and generated email bodies may be stored persistently in the dedicated `Phase 3 Emails` spreadsheet (`1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40`, `Sheet1`, GID 0). **Retention:** no period is set; it must follow the company's applicable data-retention policy and remains to be confirmed. The 21-column destination schema is confirmed with the last header exactly `Source Row (reference only)`; D-036 (no Call ID column, fingerprint, collision handling) is preserved unchanged.
**Security, not verified:** `Calls DONE` has no protected ranges. Before destination writes are enabled, the connector account must be Viewer on the source, or an equivalent Google-enforced restriction must be in place; the connector account identity and access level, and the destination sharing list, are still to be confirmed. Nothing here claims they are verified.
**Setup:** a one-time destination setup plan (plain-text formatting of the date, time, recording URL, timestamp and hash columns; the 21 headers in A1:U1; optional frozen header row) is documented in `docs/phase3-draft-destination.md` section 11 and is **not performed**; it needs the checks above and your explicit authorisation. `draft_destination.writes_enabled` stays `false`.
**Policies:** OD-05 and OD-08 do not block the first dry run (provisional behaviour stays); OD-11 is recommended for decision before it (the policy is unset) and is not decided here. No spreadsheet was read or written for this entry. Phase 3B implementation has not started.
### D-036 — No new Call ID column; record fingerprint identification for Phase 3 (2026-11-01)

**Decision (user):** Phase 3 introduces **no new Call ID column** in the original source spreadsheet and requires **no UUID-based Call IDs**; the existing source data identifies ordinary call records. A deterministic **record fingerprint** = normalised Call Date + Call Time + normalised Customer Email is used for duplicate detection and draft association only; it is not a guaranteed globally unique identifier. Same customer, same day, **different** call times = separate calls: processed independently, two drafts, two destination rows, each with its own recording URLs; calls are never merged because name, email or date match. **Exact fingerprint collisions** are not merged and not silently discarded: they are flagged for review (`FINGERPRINT_COLLISION`), source-row context and recording URLs are inspected, and no duplicate drafts are generated until the ambiguity is resolved. Source row numbers are temporary investigation references only, never permanent identity. The destination schema drops the proposed Call ID column (21 columns, `Source Row (reference only)`). Before writing, existing destination records are checked by fingerprint; an already-processed call gets no duplicate draft and existing drafts are never overwritten automatically. The Call ID requirement is removed from the Phase 3 gates.
**Approval:** the user approved the D-035/D-036 documentation and the 21-column schema on 2026-11-01 (design only; Phase 3 not started; the gates in `docs/phase3-draft-destination.md` section 9 are unchanged). and OD-44 proposal in D-035 (D-035 stays as recorded; its other parts stand). **Not changed:** the source stays read only, Gmail disabled, manual runs, eligibility rules, `Recording Sent = yes` blocks, all recording segments kept, the four skills. **Left open, not decided here:** whether Phase 4+ needs a persistent ID (the `gen:{uuid4}`/AD design in `docs/call-id-strategy.md` is neither approved nor removed; confirm at Phase 4), and how a human resolves a collision (OD-46). In Phase 3 the automatic `DUPLICATE_SOURCE_ROW` skip is replaced by review flagging. New code `FINGERPRINT_COLLISION` (`docs/skip-reasons.md`). Documentation only; no spreadsheet was read or written; Phase 3 has not started.
### D-035 — Separate source and draft-destination spreadsheets for Phase 3 (2026-11-01)

**Decision (user):** generated customer email drafts are stored in a dedicated spreadsheet, `1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40` (GID 0). The original `CSC  Booking - All Agents` (`1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, `Calls DONE`, GID `1314582701`) stays the only source and is **read only**; the agent never modifies it. The backup spreadsheet stays recovery-only and is never modified. Phase 3 is therefore: read-only on the source, write-enabled on the draft spreadsheet (approved draft-output operations only), Gmail-disabled, customer-send-disabled, manually initiated and not scheduled. Phase 3 scope now includes writing validated drafts and recording skipped records and failures in the draft spreadsheet. Invalid or unvalidated drafts are never stored as validated; no duplicate rows on reprocessing; all recording URLs of a call are preserved. The destination's worksheet name, headers and access are unknown and must be inspected (read-only) before any write; headers are never assumed.
**Proposed, not decided:** the 22-column schema and storage rules (`docs/phase3-draft-destination.md` section 4), an interim deterministic Call ID key because the source cannot hold `gen:{uuid4}` in Phase 3 (OD-44), and the headers/access agreement (OD-45).
**Honest limits:** read-only on the source is a procedure, not an enforcement, unless the connector's Google account is view-only there (R-03, R-15). The draft spreadsheet will hold real customer data (OD-12 approval before Phase 3). `dry_run` keeps meaning "never sends"; it gains one approved exception for draft-destination writes. Nothing was read, written or run when this decision was recorded; Phase 3 has not started. Does not change D-029, the four skills, eligibility, `Recording Sent = yes`, Asia/Kolkata, or the native-connector runtime.
### D-034 — Consolidated seven-phase roadmap (2026-11-01)

**Decision (user):** the roadmap is now seven phases: 0 Project Foundation, 1 Connector & Scheduling Feasibility, 2 Agent Skills & Email Generation (Completed - Synthetic Implementation Baseline, latest refinements untested), 3 Real Data Integration, 4 Tracking & Gmail Integration, 5 Shadow Mode & Production Readiness, 6 Live Automation & Scheduling, 7 Dashboard & Optimization. The remaining work is five phases (3-7); the previous roadmap had Phases 3-6 plus a "Later - Dashboard" item (not nine). Old Phases 3 and 4 (test copy, tracking, Gmail) are combined into new Phase 4; reading real data and drafting (read-only, no writes, no Gmail, no schedule) becomes Phase 3. Phase 1 is marked Completed as a feasibility phase; its unresolved items (Gmail in cloud, connector identity, protected ranges, helpers, data-handling approval) are carried into Phases 3-5, not resolved. No technical or business decision changed (original source and tab, backup is recovery only, four skills, eligibility and exclusions, no duplicates, `Recording Sent = yes` blocks, all Fathom URLs, Asia/Kolkata, native connectors and scheduled tasks). Consequences to confirm when Phase 3 is approved: the data-handling approval for session history (OD-12, R-12) is now needed before real transcripts are processed (it was before the old Phase 5), and where drafts are held while nothing may be written or stored is undecided. Phase 3 has not started. See `ROADMAP.md`.
### D-033 — Phase 2 final changes without regression runs (2026-11-01)

**Decision (user):** the existing Phase 2 testing is sufficient; no further regression runs. Approved and implemented: (1) explicit UTF-8 instruction in email-generation (1.4.0, instruction 13) and the encoding sub-check documented under `FORMAT_INVALID` in `docs/validation-rules.md` (the check itself already exists in `tests/unit/checks.js`); (2) P2-03 `must_not_include` narrowed from `fixed` to `we (have )?fixed|has been fixed|was fixed` (original preserved in `tests/fixtures/_history/`; semantic validation unchanged); (3) customer-facing language refinements in customer-summary 1.3.0, email-generation 1.4.0 and email-validation 1.4.0 (style only). No business logic changed. **These changes were not tested**: no fixture, regression or synthetic run was executed. Versions: ta 1.4.0, cs 1.3.0, eg 1.4.0, ev 1.4.0. Resolves the two open items left by D-032.

### D-032 — S-11 closed (2026-11-01)

**Decision (user):** close S-11. Basis: ownership by performer, summary grounding, no fabricated intent, no invented promise or timeline and no internal-information leak held in every final run; all 36 adversarial validations were rejected; individual P2-03 and P2-10 passed; full runs were 24/25, 25/25, 25/25. The single failure (P2-10, run 1) was a broken UTF-8 subject written by the generating session and is accepted as a one-off fault.
**Not decided by this closure:** narrowing the P2-03 expectation (unchanged, approval requested) and any encoding instruction in the skills. The deterministic encoding check stays in the harness. See docs/phase2-final-report.md.

### D-031 — Final Phase 2 policies: email length, relative timelines, customer-intent wording, ownership expectations (2026-10-31)

**Decisions (user):** (1) **Length:** preferred maximum 250 words; 251–350 permitted when necessary to preserve important customer information; above 350 requires human review (new skip code `LENGTH_REVIEW_REQUIRED`); unresolved issues, important completed actions and pending actions are never omitted to meet the limit; remove repetition, filler and unnecessary explanations first. One policy in `config/email_policy.yaml` is used by the generator, the deterministic checks and the validator; words are whitespace-separated tokens of the body excluding the signature. (2) **P2-03 "wanted this fixed":** the customer's hope is in the transcript ("I just hope it gets sorted out.", "I need something concrete.") but was not in the analysis, so the summary stage invented the wording. The original expectation (`must_not_include: fixed`) is **preserved** and a change is not applied (approval requested); the analysis must record a stated desired outcome, and the validator rejects intent statements the analysis does not support (`UNSUPPORTED_CLAIM`, new regression drafts ADV-10…12). (3) **Ownership expectations** in P2-01, 02, 04, 05, 06, 09, 10 updated to the performer, from transcript evidence only; originals in `tests/fixtures/_history/`; `ownership-truth.json` now carries verbatim evidence lines audited on every run. (4) **Relative timelines:** `call_date` is passed in; relative words are read against the call date, never the sending date; no calendar dates; the customer's timing is never turned into a support commitment; bare today/tonight/tomorrow/yesterday are banned in the email.

**Versions:** transcript-analysis 1.4.0, customer-summary 1.2.0, email-generation 1.3.0, email-validation 1.3.0. Supersedes the length wording of OD-09 and addresses S-1, S-6 and S-12; closed with D-032 after the final regression (`docs/phase2-final-report.md`).

### D-030 — S-11: action ownership by performer; summary grounding (2026-10-31) — fix verified in tests; CLOSED by D-032

**Decision (user-authorised correction):** the `owner` of a `completed` item is the party who **performed** the action (`customer`, `support`, or `uncertain`); guidance is recorded separately (`guided_by`); an unestablished performer is never guessed (neutral wording, `ownership_review_required`, skip `ANALYSIS_LOW_CONFIDENCE` if a main outcome). The customer summary and `call_purpose` must be traceable to the analysis (issue `problem_statement`, items); omissions are reported in `analysis_gaps`, never filled from the transcript; merged entries share category and timeline; unresolved issues stay stated. Skill versions: transcript-analysis 1.3.1, customer-summary 1.1.1, email-generation 1.2.0, email-validation 1.2.0. Rules documented in `docs/validation-rules.md` §1a. No change to eligibility, delivery modes, sending, recording links, privacy exclusions, skip reasons or issue codes.

**Evidence and status:** `docs/phase2-s11-report.md`. Round 2 (three runs): 21/22, 21/22, 20/22, no owner misattribution, grounding held, adversarial drafts all rejected. Remaining: P2-10 over `max_words` (S-6), one borderline P2-03 email, and owner expectations in seven fixtures that encode the old defect (awaiting approval). S-11 is therefore **not marked resolved**; it closes after your decisions and one clean re-run. *(Superseded: S-11 was closed by D-032 on 2026-11-01.)*

### D-029 — Original spreadsheet is the only operational source; the backup is a recovery copy (2026-10-31)

**Decision (user instruction):** The agent operates directly on the original `CSC  Booking - All Agents` (ID `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, worksheet `Calls DONE`, GID `1314582701`). `CSC Booking - Backup` (ID `10YjhBUPpJBEnbXz5zTqGoXEIVEIuuMZT4cCyiYJ7p3Q`) is a recovery copy only: never an input, never read or written by the agent. Its synchronisation is outside this repository and documented separately (`docs/backup-recovery.md`). **Supersedes D-028.**

**Write gate:** the original has headers through AC and AD is empty. AD is a *proposal*, not an approved write, even though D-024 designed it. All source writes stay disabled (`source.source_writes_enabled: false`, `source.protected_ranges_verified: false`) until AD ownership is confirmed, the header is approved, protected ranges are verified and the backup synchronisation is confirmed not to erase agent-owned data (`docs/call-id-strategy.md` §0, OD-43). No change to eligibility, email or validation rules, the skills, or the phase.

### D-028 — Agent input is the operational backup spreadsheet (2026-10-31) — SUPERSEDED by D-029

Recorded briefly the same day: the agent input was switched to `CSC Booking - Backup`. It was reversed before any commit; the backup is now a recovery copy only (D-029). Kept so the history of the decision is visible.
### D-027 — Cloud-first scheduling test with minimal connector scope (2026-10-31)
**Decision (business, corrections of 2026-10-31):** (1) Instructions and agent checks are documented as **not** enforcing the AD-only write rule; only verified protected ranges do, and real-sheet writes are blocked until they are verified (R-03, OD-36). (2) OD-41 reworked: no technical reference or footer in customer emails; an uncertain send stops and goes to **human review**, with no automatic resend. (3) OD-37: test **cloud** scheduled execution first, if available; desktop only as a fallback; nothing assumed to work until verified.
**Phase 1 actions taken (read-only):** local Sheets connector checks; one **disabled, manual-only** cloud routine with the Google Sheets connector only, run once. No spreadsheet writes, no Gmail calls, no recurring schedule.
**Evidence recorded in `docs/phase1-results.md`:** cloud scheduling is available; a cloud run read the sheet through the native connector; project instructions are **not** reachable without a remote repository (blocked); `Calls DONE` has no protected ranges; routine tool/connector settings are not reliable restrictions; API-created routines attach all account connectors by default (OD-42).
