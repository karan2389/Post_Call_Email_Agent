# handoff.md

_Last updated: 2026-10-31 — Phase 1 partly done (read-only). Awaiting review. Nothing from Tasks 6–8 is committed._

## No Call ID column; fingerprint identification (2026-11-01, uncommitted, D-036): documentation only
Phase 3 uses no new Call ID column and no UUIDs. Record fingerprint = normalised call date + call time + customer email (duplicate detection and draft association only, not unique). Different times on the same day = separate calls, rows and drafts; exact collisions flagged for review (FINGERPRINT_COLLISION), nothing merged or discarded; row numbers are references only. Draft schema now 21 columns. New OD-46 (collision resolution, not a gate); OD-44 resolved. Open for you: whether Phase 4+ still needs a persistent ID. Nothing read or written in any spreadsheet.

## Phase 3 draft destination decided (2026-11-01, uncommitted, D-035): documentation only
Draft spreadsheet 1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40 (GID 0) is the only place for generated drafts; the source stays read only; backup untouched. Phase 3 = read-only source, write-enabled draft sheet, Gmail-disabled, customer-send-disabled, manual (not scheduled). Design, proposed 22-column schema and de-duplication: docs/phase3-draft-destination.md. New OD-45 (headers and access), R-15 (OD-44 interim Call ID superseded by D-036). Nothing was read or written in either spreadsheet; Phase 3 not started; awaiting your approval and the gates in that document's section 9.

## Roadmap consolidated to seven phases (2026-11-01, uncommitted, D-034)
Phases 0-2 completed (Phase 2 = synthetic implementation baseline, latest refinements untested); Phases 3-7 not started: 3 Real Data Integration, 4 Tracking & Gmail, 5 Shadow & Production Readiness, 6 Live Automation & Scheduling, 7 Dashboard. Phase 3 needs your approval and OD-12 data-handling approval first. Documentation only; no tests, no external access. Phase 2 was committed as 817fe0e and pushed.

## Phase 2 final changes (2026-11-01, D-033): NOT tested by design
Per your instruction, no regression runs. Done: UTF-8 instruction in email-generation 1.4.0 (+ encoding check documented in `docs/validation-rules.md`; the check already existed in `tests/unit/checks.js`); P2-03 `must_not_include` narrowed to `we (have )?fixed|has been fixed|was fixed` (original preserved in `tests/fixtures/_history/`); language refinements in customer-summary 1.3.0, email-generation 1.4.0, email-validation 1.4.0. Business logic unchanged. Report §11 of `docs/phase2-final-report.md`. Nothing committed or pushed; Phase 3 not started. Re-test before relying on the new wording.

## Final policy implementation and regression (2026-11-01, uncommitted): S-11 CLOSED by your decision (D-032)
Implemented your four decisions (length 250/350/review, P2-03 investigation, ownership expectations, call-date timelines): skills transcript-analysis 1.4.0, customer-summary 1.2.0, email-generation 1.3.0, email-validation 1.3.0; policy in `config/email_policy.yaml`; D-031. Results (`tests/results/phase2-final/`): individual P2-03 and P2-10 pass; full runs 24/25, 25/25, 25/25 (13 fixtures + 12 adversarial drafts, all adversarial rejected every time). One failure: P2-10 in run 1 has a broken UTF-8 subject ("â€“"), caught by a new deterministic check. S-11's own criteria (ownership, grounding, no fabricated intent/promise/timeline, no leak) hold in every run, but "all fixtures pass consistently" does not, but you decided to close S-11 and accept that run as a one-off generation-session fault (D-032). Still pending: your approval to narrow the P2-03 expectation (`must_not_include: fixed`, preserved as is). Nothing committed. Report: `docs/phase2-final-report.md`. Nothing committed.

## S-11 correction and regression (2026-10-31, uncommitted): fix verified in tests (earlier rounds)
Skills corrected (transcript-analysis 1.3.1, customer-summary 1.1.1, email-generation 1.2.0, email-validation 1.2.0; D-030, `docs/validation-rules.md` §1a). Round 2 (3 independent runs, 13 fixtures + 9 adversarial): 21/22, 21/22, 20/22; ownership and grounding correct everywhere; all adversarial drafts rejected. Open: P2-10 exceeds 250 words in all six runs (S-6, needs your length policy); one borderline P2-03 email ("wanted this fixed"); owner expectations in P2-01/02/04/05/06/09/10 encode the old defect and need your approval to update (not edited); S-1 relative timelines still undecided. Original results preserved in `tests/results/phase2`; new results in `phase2-s11/` and `phase2-s11-r2/`. Report: `docs/phase2-s11-report.md`. Nothing committed.

## Phase 2 — synthetic dry run (2026-10-31): NOT complete, awaiting your review
Authorised by you; scope synthetic data only. 11 fixtures (`tests/fixtures/P2-*`), 9 adversarial drafts, `config/email_policy.yaml`, Node harness `tests/unit/run-phase2.js`, plan `docs/phase2-plan.md`, report `docs/phase2-report.md`. Result: 19/20 harness checks pass; 7 of 8 generated emails pass independent semantic validation; **P2-06 fails** (`OWNER_MISATTRIBUTED`, skill defect S-11: `completed` items are always owned by `support` even when the customer did the step). A proposed fix was tested on skill copies only: partly effective (P2-06, P2-09 pass; P2-02 and P2-01 diverged). Skills unchanged. No Gmail, no spreadsheet access, no routine, no commit. Next: your decisions on S-11, S-1 (relative timelines), word limits and OD-08/09/11/38 (`docs/phase2-report.md` §10). Do not start Phase 3 without approval.

## Completed work

### Tasks 1–5 (committed): `642f7ea`, `39b1fc2`, `1f0dddb`, `6d9c76d`
- Phase 0 docs, repository move, previous-day design, source-sheet inspection.

### Tasks 6–7 (uncommitted)
- Business decisions D-022 … D-025; architecture pivot D-026 (Claude Code scheduled tasks + native Google connectors); future-alternatives; runbook; run settings.

### Task 8 — Corrections and Phase 1 read-only test (this task, uncommitted)
**Corrections**
1. AD-only restriction: docs now state that instructions and agent checks **do not enforce** it; only verified protected ranges do; **no write to the real sheet until verified** (`source.protected_ranges_verified: false` in `config/run-settings.yaml`). Updated architecture §5, security §6, call-id-strategy §3, R-03, OD-36, runbook §0, ROADMAP, CLAUDE.md, decision log.
2. OD-41 reworked: footer reference **withdrawn**; internal `send_attempt_id`; `SENT` only on positive confirmation; otherwise `SEND_UNCONFIRMED` → **human review** (`review_decision`, `reviewed_by`, `reviewed_at`) → no auto-resend. Updated delivery-state-machine §4–§7, data-model, pipeline, runbook, validation-rules (conditional check removed), skip-reasons (`SEND_REVIEW_REQUIRED`, `REVIEW_RESOLVED`), tests (EV-112, EV-114 … EV-117).
3. OD-37: cloud-first test (if available), desktop as fallback, nothing assumed.

**Phase 1 read-only results** → full detail in `docs/phase1-results.md`
- Sheets connector available (local and one manual cloud run, reads only). Header A–AC validated; AD empty.
- **Yesterday (2026-10-30 IST) = 9 records** (rows 15441–15449); today 6; future 0. Aggregates for those 9: recording URL single 5 / empty 4 / multi 0; `Recording Sent` no 8, empty 1, yes 0; transcripts present 4, missing 5 (1 with a recording URL).
- Cloud routine created **disabled and manual-only**, narrowed to the Sheets connector, run once (17 s, success).
- Findings: no protected ranges on `Calls DONE`; routine tool settings not enforced; API routines attach all connectors by default; instructions unreachable in cloud (no remote repo); date-format quirks; full-column reads overflow; transcript checks pull content.
- New docs: `docs/phase1-results.md`; new OD-42, D-027; EV-118 … EV-123; `fetch_window_rows` setting; windowed read + coverage check in pipeline and runbook.

## Files modified (uncommitted, vs HEAD)
```
NEW     docs/future-alternatives.md, docs/phase1-results.md, workflows/daily-post-call-run.md, config/run-settings.yaml
RENAME  docs/deployment.md -> docs/scheduled-execution.md
DELETE  .env.example
EDIT    CLAUDE.md, README.md, ROADMAP.md, memory.md, handoff.md, config/README.md, src/README.md, tests/*,
        skills/*, docs/* (architecture, pipeline, state machine, data model, call-id, security, skip-reasons,
        validation, source profile, open decisions, decision log, testing, skills-runtime, scheduled-execution)
```

## External changes made (outside the repository)
- Anthropic cloud environment "Default" `env_01Cs49hSdGFEfboTPFSfY4Ty` **auto-created** by the scheduling skill.
- Cloud routine `trig_017psPj1c1uxCuPDXDw9rvXu` (disabled, manual-only, Sheets connector only) and one run session `cse_01FMKRNXJ9UTJA8LUr5tBe8x`. Contains headers, dates and counts only; no customer data.
- No spreadsheet, Gmail, Google Cloud or connector-permission changes. Local temporary tool-result files were deleted.

## Current status
Phase 1 partial. **No application code, no recurring schedule, no spreadsheet write (AD untouched), no worksheet, no Gmail call, no draft, no email, no Google Cloud resource, no commit.**

## Remaining blockers (see `docs/phase1-results.md` §8)
B1 **resolved**: private `karan2389/Post_Call_Email_Agent` attached to the test routine; Test 2 cloned it and read all files and skills (R-02 partly verified) · B2 connector Google accounts unidentified (R-13) · B3 protected ranges absent/unverified, needs a test copy (R-03) · B4 Gmail in cloud untested, needs test-mailbox plan and approval (R-01, R-04) · B5 helpers undecided (OD-38) · B6 data-handling approval for cloud session history (R-12, OD-12).

## Spreadsheet architecture (D-029, uncommitted, awaiting review)
Agent input = `Calls DONE` in the original `CSC  Booking - All Agents` (`1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, GID `1314582701`). `CSC Booking - Backup` (`10YjhBUPpJBEnbXz5zTqGoXEIVEIuuMZT4cCyiYJ7p3Q`) is a **recovery copy only**, never read or written by the agent, documented in `docs/backup-recovery.md`; not verified as reliable. D-029 supersedes the same-day D-028 (backup as input), which was never committed. **Source writes are disabled** (`source.source_writes_enabled: false`, `protected_ranges_verified: false`) until AD ownership, header approval, protected-range verification and backup-sync safety for agent data are all confirmed (`docs/call-id-strategy.md` §0, OD-43). No backup synchronisation script exists in this repository and none was run. The test routine's saved prompts name the original (historical); it stays disabled.

## Exact next steps
1. Review `docs/phase1-results.md`; decide whether to commit Tasks 6–8, and whether to delete the test routine / default environment at claude.ai.
2. **B1 / Test 2 done (2026-10-31):** the routine (disabled, Sheets only) ran once against https://github.com/karan2389/Post_Call_Email_Agent and read all six files, four skills and the `Calls DONE` header (`docs/phase1-results.md` §5a). Open items: the final report was truncated in the run log (rule checks 3–8, header details); review session https://claude.ai/code/session_01FMKRNUMdkCQiLUP6QhNLB4. The older repo `karan2389/flexifunnels-post-call-email-agent` is a stale copy (`39b1fc2`): archive or delete it, or tell me to fast-forward it.
3. Tell me which Google accounts authorise the Sheets and Gmail connectors (B2), and agree a test copy of the spreadsheet for the R-03 protection test (B3).
4. Do not enable any schedule until R-01 … R-04 and R-12 are resolved.
