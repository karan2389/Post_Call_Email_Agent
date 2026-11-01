# ROADMAP

Consolidated seven-phase roadmap (D-034, 2026-11-01). Each phase needs explicit user approval before it starts, and its exit criteria must be met before moving on. The architecture is Claude Code scheduled tasks + native Google connectors (D-026), still **proposed** until validated end to end.

| Phase | Name | Status |
|---|---|---|
| 0 | Project Foundation | Completed |
| 1 | Connector & Scheduling Feasibility | Completed |
| 2 | Agent Skills & Email Generation | Completed — Synthetic Implementation Baseline (latest refinements untested) |
| 3 | Real Data Integration | Not Started |
| 4 | Tracking & Gmail Integration | Not Started |
| 5 | Shadow Mode & Production Readiness | Not Started |
| 6 | Live Automation & Scheduling | Not Started |
| 7 | Dashboard & Optimization | Not Started |

**Current position:** Phase 2 is complete as a synthetic baseline; Phase 3 has not started and needs your approval. Nothing is production-ready. No recurring schedule, source-sheet write, Gmail operation or customer email exists.

Previous structure (superseded by D-034): Phases 0–6 plus a "Later — Dashboard" item, with the old Phase 3 (test copy, tracking) and Phase 4 (Gmail) now combined into Phase 4, real-data reading split out as Phase 3, and the dashboard promoted to Phase 7. Phase mapping to the earlier Python roadmap (local Python foundations, Cloud Run) is unchanged: dropped from the primary path, kept in `docs/future-alternatives.md`.

---

## Phase 0 — Project Foundation
**Status: Completed.**
- Repository and project structure; architecture, requirements and risks (R-01 … R-14); project documentation and operating rules (`CLAUDE.md`, runbook, test strategy).
- Business decisions D-001 … D-025 preserved; D-026 records the pivot to scheduled tasks and native connectors.

## Phase 1 — Connector & Scheduling Feasibility
**Status: Completed** (feasibility questions answered; items below were carried forward, not resolved). Results: `docs/phase1-results.md`.
- Google Sheets connector verified locally and in manual cloud runs (reads only). Claude scheduled routines examined: UTC cron, 1-hour minimum, one disabled manual-only routine with the Sheets connector only (OD-42). No recurring schedule exists.
- Permissions and integration limitations found: `Calls DONE` has no protected ranges; routine tool settings are not access controls; connector account identity unknown; instructions reach a cloud run only via a git source (private remote `karan2389/Post_Call_Email_Agent`, Test 2).
- Read-only access verified on the original `CSC  Booking - All Agents` (D-029); `CSC Booking - Backup` is a recovery copy only.
- **Carried forward (not done):** Gmail in a cloud run (R-01, R-04); connector-account identity (R-13); protected-range verification on a test copy (R-03, OD-36); deterministic helpers (OD-38); a full runbook run in a cloud session and automatic `CLAUDE.md` loading (R-02); data-handling approval for session history (R-12, OD-12). These belong to Phases 3–5 below.

## Phase 2 — Agent Skills & Email Generation
**Status: Completed — Synthetic Implementation Baseline.** This is a synthetic-data baseline only; it is **not production-ready**.
- Four skills: transcript-analysis 1.4.0, customer-summary 1.3.0, email-generation 1.4.0, email-validation 1.4.0; policy file `config/email_policy.yaml`; synthetic fixtures (including Hindi and multi-segment) and a Node test harness.
- Historical results (`docs/phase2-report.md`, `docs/phase2-final-report.md`, D-030, D-031): first run 19/20 (S-11 found); final regression three full runs 24/25, 25/25, 25/25 plus individual P2-03/P2-10 passes, on the earlier skill versions (customer-summary 1.2.0, email-generation 1.3.0, email-validation 1.3.0). One P2-10 run had a broken UTF-8 subject, accepted as a one-off. S-11 closed by user decision (D-032).
- **Caveat — untested refinements (D-033):** the UTF-8 instruction, the narrowed P2-03 expectation and the friendlier email wording (customer-summary 1.3.0, email-generation 1.4.0, email-validation 1.4.0) were deliberately **not regression-tested** and are not verified by execution. Re-test before relying on them.
- No real customer data processed, no Google Sheets access or write, no Gmail operation, no customer email sent, no scheduled task. Still open from this phase: OD-05, OD-08, OD-09 (length part decided), OD-11, OD-13, OD-30, OD-32; usage per call (R-09) unmeasured.

## Phase 3 — Real Data Integration
**Status: COMPLETE with documented limitations (2026-11-01, `docs/phase3-acceptance-report.md` sections 9 to 12): coverage-first skills, 7 validated drafts stored for 30/31 Oct, regression on the latest skills, write guard, controlled storage test, cell-exact read-back and idempotency passed; sharing and source read-only are user-confirmed only; the sensitive-topic path has not run on real data.** Helpers, runbook section and destination setup done; a controlled real-data dry run produced 6 stored rows (1 validated draft, 3 skipped, 2 deferred) with no duplicate rows; human review of the draft, sensitive-case handling and a second run are still outstanding (`docs/phase3-acceptance-report.md`). Phase 3A preflight: `docs/phase3a-preflight-report.md`. Deliverable: accurate customer email drafts generated from actual call records and stored as validated drafts in the dedicated draft spreadsheet. Design and schema: `docs/phase3-draft-destination.md`.
- **Posture:** read-only on the source spreadsheet; write-enabled on the dedicated draft spreadsheet only; Gmail-disabled; customer-send-disabled; manually initiated, not scheduled.
- **Source (read only):** the original `CSC  Booking - All Agents` (`1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, `Calls DONE`, GID `1314582701`). Reads call records, customer details, transcripts and recording URLs. The agent never modifies it (no AD header, no Call ID, no other write). The backup spreadsheet is for recovery, not agent processing.
- **Draft destination (write):** `1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40`, GID `0`. Stores validated drafts, customer and call references, validation status, timestamps and errors. **Inspected first, never assumed:** worksheet name, headers, existing rows and access are unknown until a read-only inspection; schema proposal (21 columns, no Call ID column), fingerprint-based duplicate prevention and storage rules are in the design document (D-036).
- **Identification (D-036):** calls are fingerprinted by normalised Call Date + Call Time + Customer Email for duplicate detection and draft association only (not a unique identifier). Same customer, same day, different times = separate calls with separate drafts and rows; an exact fingerprint collision is flagged for review, never merged or discarded.
- **Scope:** (1) read eligible calls from the source; (2) retrieve and analyse available transcripts; (3) generate customer summaries; (4) generate personalised follow-up emails; (5) validate accuracy and policy compliance; (6) write successfully validated drafts to the draft spreadsheet; (7) record skipped records and processing failures there. Eligibility and exclusion rules unchanged (E1–E18; `Recording Sent = yes` excludes); missing and late-arriving transcripts are deferred (D-019, D-023); **all** recording URLs of a call are kept (D-025); no duplicate rows when a call is reprocessed.
- **Restrictions:** no write to the source or the backup; drafts never written to the source; no Gmail connection or invocation; no customer email; no scheduled task or routine; invalid or unvalidated drafts are never stored as validated; bounded reads, one transcript at a time, tool-result files deleted; real transcripts, names, emails and drafts never stored in the repository (`CLAUDE.md` §6).
- **Approvals recorded (D-037, 2026-11-01):** real-transcript processing (OD-12) and persistent storage of customer names, emails, Fathom URLs, subjects and bodies in `Phase 3 Emails` (OD-19); 21-column schema confirmed. Retention period not decided (company policy applies; to be confirmed).
- **Gates still open before any destination write (D-037, D-038):** source access restricted to Viewer for the connector account `karan.s@flexifunnels.com` (currently Editor on both spreadsheets, confirmed by the user) or an equivalent Google-enforced restriction (`Calls DONE` has no protected ranges; source write protection is NOT enforced); destination sharing verified (named support leads only, general link sharing off); explicit authorisation of the one-time header setup; then `draft_destination.writes_enabled: true`. No Call ID column or UUID scheme is required (D-036).
- Decisions that belong here: OD-04, OD-10, OD-26 (eligibility), OD-45, OD-46 (collision resolution, not a start gate), and OD-05, OD-08, OD-11, OD-30, OD-32 if still open.
- **Exit:** drafts for a reviewed sample of real calls are accurate against their transcripts; eligibility, deferral, recording-URL handling and de-duplication behave as specified; no write occurred to the source or the backup; no Gmail call and no email occurred.
## Phase 4 — Tracking & Gmail Integration
**Status: IN PROGRESS (2026-11-02).** Done: write guard (D-048), send state machine and idempotency (D-049), Send Log worksheet (D-054, D-055), explicit internal test mode (D-056), Gmail link-rewriting investigation (D-057 to D-059), Brevo adapter and two real Brevo tests (D-060 to D-065, now **retired**), **Gmail-only architecture (D-066):** provider selection with no fallback, strict Google-wrapper URL verification, read-back verification of recipient/From/subject/body/URLs, per-email approvals bound to recipient and draft hash (`docs/phase4-gmail-only.md`). Not done: a controlled Gmail internal test of the read-back path, pilot C0 to C3 (all closed), scheduling, go-live. Deliverable: a trackable end-to-end pipeline capable of controlled internal email delivery. **Internal email testing does not authorise customer-facing sending.**
- Stable Call IDs (`gen:{uuid4}`, `docs/call-id-strategy.md`) and duplicate-processing prevention. Source writes stay disabled until the gate in `docs/call-id-strategy.md` §0 is met (AD ownership, header approval, protected ranges verified, backup-sync safety; OD-36, OD-43, R-03, R-14).
- The approved tracking worksheet (builds on the Phase 3 draft spreadsheet, OD-18; `POST_CALL_EMAIL_LOGS`, `POST_CALL_EMAIL_EVENTS`; location OD-18), created only with approval on a **test copy** first: processing status, email content, timestamps; processed, skipped, pending and failed calls (`docs/delivery-state-machine.md`); transcript hashes, run lock, recovery after interrupted runs (R-05, R-06, R-08).
- Verify Gmail connector availability and permissions in the intended run environment (R-01, R-04, R-07); sender identity (OD-39, OD-06); unattended send and the uncertain-send human-review process (OD-41, `SEND_UNCONFIRMED`).
- Validate recipients, subject lines, email formatting and recording links; controlled internal delivery tests to allowlisted internal addresses only (`delivery_mode: test`).
- Decisions that belong here: OD-14, OD-18, OD-20, OD-31, OD-36, OD-38, OD-43.
- **Exit:** workflow scenarios pass on the test copy over several simulated days with no forbidden writes; no duplicate sends under simulated failures; sending permissions documented.

## Phase 5 — Shadow Mode & Production Readiness
**Status: Not Started.** Deliverable: evidence that the workflow is reliable enough for controlled live operation.
- **Gate:** protected ranges verified for the connector's account (R-03, OD-36), including a rejected forbidden write on a test copy; without it nothing is written to the real sheet.
- Run on real calls in `shadow` mode: **no customer emails** (executives keep sending manually, D-022). Generate and validate drafts; compare them against source transcripts; verify call eligibility, duplicate prevention, recording links and customer details.
- Identify real-world edge cases (`MISSING_TRANSCRIPT` rates against the transcript automation schedule, OD-33; deferrals, OD-27); resolve critical reliability issues; measure usage (R-09) and failure reporting (R-10, OD-23); retention and access to logs (OD-19).
- **Define explicit go-live acceptance criteria** and the go-live checklist (`docs/scheduled-execution.md` §7); decide `go_live_date` (OD-34) and the reporting impact (OD-35).
- **Exit:** the CSC team signs off on quality and operations; acceptance criteria met.

## Phase 6 — Live Automation & Scheduling
**Status: Not Started.** Deliverable: automated daily customer follow-up emails. **Customer-facing sending stays disabled until the go-live conditions are explicitly approved.**
- Enable controlled customer-facing delivery (`delivery_mode: live`, calls on/after `go_live_date`); `Recording Sent = yes` always blocks a send; all sending exclusions and safeguards enforced. Rollback = `shadow`.
- Configure daily execution at **09:00 Asia/Kolkata** (cloud routines use UTC, `30 3 * * *`; nothing is scheduled until Phases 4–5 allow it).
- Retries and recovery behaviour (OD-14); execution and delivery logs; monitoring of scheduled-execution failures (R-10, OD-23).
- Monitor the first runs; weekly quality review for the first month.
- **Exit:** management approval of go-live recorded; first live runs reviewed.

## Phase 7 — Dashboard & Optimization
**Status: Not Started.** Deliverable: a complete, observable CSC automation system.
- CSC monitoring dashboard (a separate component reading `POST_CALL_EMAIL_LOGS` and `POST_CALL_EMAIL_EVENTS` only): sent, skipped, pending and failed counts; customer names, email addresses and call dates; generated email content and timestamps; processing performance and error rates; an audit trail.
- Improve the workflow from actual operational usage.
