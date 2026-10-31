# ROADMAP

Revised for the Claude Code scheduled tasks + native Google connectors architecture (D-026). Each phase needs explicit user approval before it starts, and its exit criteria must be met before moving on. **Phase 0 is complete; Phase 1 is partly done (2026-10-31, read-only).**

**Current phase: Phase 1 — Connector and scheduled-execution validation — PARTIAL.** Results and blockers: `docs/phase1-results.md`. Done: Sheets connector verified locally and in one manually triggered cloud run (reads only). Not done: instructions in cloud runs (**untested: private remote `karan2389/Post_Call_Email_Agent` now exists, not yet attached to a routine**), Gmail in cloud, connector-account identity, protected-range verification, deterministic helpers, usage at volume. No recurring schedule exists.

Phase mapping to the previous roadmap: the old Phase 1 (local Python foundations) and old Phase 6 (Cloud Run deployment) are dropped from the primary path and kept in `docs/future-alternatives.md`.

---

## Phase 0 — Architecture and documentation
- Revised architecture, runbook, requirements, risks (R-01 … R-13), test strategy.
- Business decisions D-001 … D-025 preserved; D-026 records the pivot.
- **Exit:** user approves the revised documentation.

## Phase 1 — Connector and scheduled-execution validation (read-only)
- Test **cloud** scheduled execution first, if available in this environment (OD-37); desktop only as a fallback on evidence. Include how a cloud session would reach this repository (OD-21). Results go in `docs/phase1-results.md`; nothing is assumed to work until verified.
- Validate R-01 (connectors in scheduled runs), R-02 (repository instructions and skills available), R-08 (schedule timezone, overlap), R-10 (failure visibility), R-11 (deterministic helpers, OD-38), R-12 (data handling of session history), R-13 (connector account identity).
- Start **read-only**: a scheduled `dry_run` that runs PREFLIGHT and reads `Calls DONE` headers and yesterday's rows, and reports counts only. No writes, no email.
- Assess R-03 with the sheet owner (OD-36): which Google account the connector uses, and what protected ranges exist. Instructions and agent checks do **not** enforce AD-only writes; only verified protected-range permissions do. No write of any kind to the real sheet in this phase.
- **Done so far:** one disabled, manual-only cloud routine with the Sheets connector only (OD-42). No recurring schedule.
- **Remaining:** (remote created) attach it to a routine and run a second manual cloud run that reads `CLAUDE.md` and the runbook (R-02); identify the connector accounts (R-13); inspect/verify protected ranges on a test copy (R-03); Gmail availability in cloud only with a test mailbox plan and approval (R-01, R-04); decide helpers (OD-38); data-handling approval (R-12, OD-12).
- **Exit:** validation results recorded; go/no-go on the scheduled architecture, or escalation to `future-alternatives.md`.

## Phase 2 — Transcript processing and email generation (no sending)
- Synthetic fixtures (`tests/fixtures/`), including Hindi and multi-segment transcripts.
- Run the four skills in `dry_run`; check categories, multiple recording URLs, validation and adversarial drafts.
- Decide OD-05, OD-08, OD-09, OD-11, OD-13, OD-30, OD-32; measure usage per call (R-09); decide per-record isolation (OD-40).
- **Exit:** safety scenarios 100%; quality threshold met; usage acceptable.

## Phase 3 — Persistent tracking and duplicate prevention (test copy)
- With approval: create a **test copy** of the spreadsheet, the `POST_CALL_EMAIL_LOGS` / `POST_CALL_EMAIL_EVENTS` worksheets on it, and the AD header on it.
- Validate the write-safe Call ID assignment, transcript hashes, deferral, duplicate and URL-conflict checks, run lock, and recovery after interrupted runs (R-05, R-06, R-08).
- Decide OD-04, OD-10, OD-18, OD-20, OD-26, OD-31.
- **Exit:** workflow scenarios pass on the test copy across several simulated days; snapshot diffs show no forbidden writes.

## Phase 4 — Gmail integration (internal only)
- Test-mode drafts or sends to allowlisted internal addresses only.
- Validate unattended sending and what controls approval (R-04), returned identifiers and the uncertain-send human-review process (R-07, OD-41), and sender identity (OD-39).
- **Exit:** reconciliation proven; no duplicate sends under simulated failures; sending permissions documented.

## Phase 5 — Scheduled shadow mode (real records, no customer emails)
- **Gate:** protected ranges verified for the connector's account (R-03, OD-36), including a rejected forbidden write on the test copy. Without this, nothing is written to the real sheet.
- With approval, and only after the gate: AD header on the real sheet; logs worksheets in the approved location.
- Daily scheduled run in `shadow`: real Call IDs written to AD, drafts stored in the logs, **no customer emails**. Executives continue manual sending (D-022).
- Review quality, skip reasons, `MISSING_TRANSCRIPT` rates against the transcript automation schedule (OD-33), usage (R-09) and failure reporting (R-10, OD-23).
- **Exit:** the CSC team signs off on quality and operations.

## Phase 6 — Production readiness and controlled go-live
- Review test results, permissions, duplicate protection, failure recovery, usage limits.
- Decide `go_live_date` (OD-34) and the reporting impact (OD-35); obtain management approval.
- Switch `delivery_mode: live`; executives stop manual sending for calls from the go-live date. Rollback = `shadow`.
- Monitor the first runs; weekly quality review for the first month.

## Later — Dashboard (future)
- Separate component reading `POST_CALL_EMAIL_LOGS` and `POST_CALL_EMAIL_EVENTS` only.
