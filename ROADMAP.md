# ROADMAP

Each phase requires explicit user approval before it starts. Exit criteria must be met before moving on.

**Current phase: Phase 0 — Initialisation (complete, awaiting approval for Phase 1).**

---

## Phase 0 — Initialisation ✅
- Folder structure, Git repository, `.gitignore`.
- Documentation: CLAUDE, README, memory, handoff, roadmap, `docs/`.
- Four SKILL.md specifications.
- Open decisions documented.

**Exit:** user approves documentation and skills.

## Phase 1 — Local foundations (no external services)
- Install Python 3.12; choose package manager (OD-21); `pyproject.toml`.
- Package skeleton under `src/post_call_agent/`.
- Typed models (`CallRecord`, `AnalysisResult`, `CustomerSummary`, `EmailDraft`, `ValidationResult`, `TrackingRecord`).
- Configuration loader (env + YAML), injectable clock and timezone utilities (Asia/Kolkata).
- Previous-day selection: target-date calculation, call-date parsing, lookback, work queue, `TARGET_DATE` override.
- Eligibility checker (ELIGIBLE / DEFER / SKIP) with wait-window handling; duplicate checker.
- Per-record error boundary and circuit breaker.
- Skill loader: parse SKILL.md, extract runtime sections and versions.
- Call ID assignment and source fingerprint logic.
- State machine as pure logic (allowed transitions, lease handling).
- Deterministic validation checks.
- Synthetic fixtures for every evaluation case in `tests/evals/README.md`.
- Unit tests with fakes for Sheets, Gmail and LLM.

**Exit:** all unit tests pass; no network access required.

## Phase 2 — LLM pipeline on synthetic data
- *Requires:* Anthropic API access and company approval (OD-12); model IDs confirmed.
- Anthropic client wrapper with structured (JSON) outputs, retries, timeouts.
- Implement analysis → summary → generation → semantic validation.
- Evaluation harness over synthetic cases; drafts written to `outputs/` (git-ignored).
- Tune skills until evaluation cases pass consistently.

**Exit:** evaluation suite meets agreed pass rate; zero unsafe emails pass validation.

## Phase 3 — Google Sheets integration (test spreadsheet)
- *Requires:* OD-01, OD-02, OD-04, OD-18, OD-26, OD-28 resolved; test spreadsheet with synthetic rows; credentials provisioned by the user (never committed).
- Read source rows; assign/write Call IDs.
- Tracking and events worksheets; state transitions; leases; duplicate checks.

**Exit:** end-to-end dry run on the test spreadsheet over several simulated days (late transcripts, cancelled/no-show rows); state transitions correct; rerun is idempotent.

## Phase 4 — Gmail integration (test recipients only)
- *Requires:* OD-06, OD-07, OD-09, OD-16 resolved.
- Gmail sending with deterministic `Message-ID`; reconciliation search.
- Recovery tests: simulated tracking-write failure after successful send.
- Allowlist mode: only internal test addresses may receive mail.

**Exit:** recovery scenarios proven; no duplicate sends under simulated failures.

## Phase 5 — Pilot / shadow mode
- *Requires:* OD-04, OD-05, OD-08, OD-10, OD-11 resolved; real data access approved.
- Run against real records but create Gmail drafts (or send to internal reviewers) instead of customers.
- Review quality, skip rates and reason distribution with the support team.

**Exit:** support team signs off on quality; skip reasons understood.

## Phase 6 — Production deployment
- *Requires:* OD-17, OD-22, OD-23 resolved.
- Container image; Cloud Run Job (or Service); Secret Manager; service accounts with least privilege.
- Cloud Scheduler trigger in Asia/Kolkata; max one concurrent execution.
- Cloud Logging with redaction; failure alerting.

**Exit:** scheduled runs succeed in production with sending still restricted.

## Phase 7 — Automatic sending go-live
- Remove recipient allowlist; enable automatic customer sends.
- Monitor first runs; weekly quality review for the first month.

## Phase 8 — Dashboard (future)
- Separate component reading `POST_CALL_EMAIL_LOGS` and `POST_CALL_EMAIL_EVENTS` only.
- No change to the core agent required (schema designed for this in Phase 0).
