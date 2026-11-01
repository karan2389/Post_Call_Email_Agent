# handoff.md

_Last updated: 2026-10-31 — Phase 1 partly done (read-only). Awaiting review. Nothing from Tasks 6–8 is committed._

## Three older drafts replaced (2026-11-01, uncommitted, D-047)
On your authorisation, replaced the drafts of source rows 15451, 15448 and 15442 (sheet rows 3, 11, 13) with the coverage-first versions; read-back verified (7 draft rows, 0 mismatches); `writes_enabled` false. Sheet: 15 rows = 7 drafts (all new skills), 2 deferred (15453, 15454), 6 skipped. Real-record temp files deleted. Next: your review of the 7 drafts (notes column says what to check in each recording); transcripts for 15453/15454; confirm sharing for real (I cannot verify); OD-10/OD-32.

## Storage done after sharing restricted (2026-11-01, uncommitted, D-046)
You confirmed `Phase 3 Emails` is restricted (not verifiable by me). Stored 4 validated drafts: new rows for source rows 15443 and 15445, in-place updates of 15450 (neutral fallback) and 15447; read-back verified cell by cell (0 mismatches); re-plan shows 0 new/duplicate rows; `writes_enabled` false again. Sheet now: 15 rows, 7 drafts (4 new-skill, 3 old-skill: 15451, 15442, 15448 not replaced; newer versions are in the scratchpad `real` folder), 2 deferred (15453, 15454), 6 skipped. Needs: your review; decision whether to replace the 3 old-skill bodies; transcripts for 15453/15454.

## Skill optimisation + full-coverage run, 30/31 Oct (2026-11-01, uncommitted, D-043/D-044/D-045)
All four skills optimised (ta 1.6.0, cs 1.4.0, eg 1.6.0, ev 1.5.0): coverage first, neutral fallback email, statement-level confidence, exact transcript hash (`node src/p3.js extract-transcript`). Focused tests 9/9 + validators PASS. Real run: 15 records, 9 eligible, 7 with transcripts -> 7 drafts (6 conservative, 1 neutral fallback), all validated (2 after one regeneration) = 100% draft coverage; 2 transcripts (15453, 15454) still empty. NOTHING written to the destination: sharing is unverified after your report of broad Editor access (D-045; `destination_sharing_verified` reset to false). Drafts are in the session scratchpad `real` folder (outside the repo). Needs: restrict/confirm destination sharing (13 real rows already stored there), your review of drafts, then a storage run. Report `docs/phase3-acceptance-report.md` section 9. Nothing sent or committed.

## transcript-analysis 1.5.0: guided-action classification (2026-11-01, uncommitted, D-042)
A step done on screen under guidance is now `completed` when it has a performer basis and a completion signal (customer confirms, support states the result, or the result is used later); instructions and `okay` are not signals; unclear garbled steps stay `explained` (low confidence). Not re-run on any record and not regression-tested. Suggested check: re-analyse source row 15451 (31 Oct) only if you approve; the stored drafts are not changed. Still open: rule for low-confidence items, OD-10, OD-32.

## Second dry run, 30 Oct calls, email-generation 1.5.0 (2026-11-01, uncommitted, D-041)
Skill 1.5.0 (four statement kinds, status-word rules, `review_flags`). 9 source records for 30 Oct: 2 no-show, 2 cancelled, 3 processed (cap) -> 2 validated drafts (sheet rows 11 and 13), 1 review-required (row 10), 7 rows written and read back, rerun plan shows no new rows, `writes_enabled` back to false. Needs your human review of the drafts, and your decisions on the upstream classification gap, low-confidence items, OD-10/OD-32. Known issue: transcript hashes are not byte-exact (not stored this run). Report `docs/phase3-acceptance-report.md` section 8. Nothing sent or committed.

## Phase 3 dry run done, acceptance PARTIAL (2026-11-01, uncommitted, D-039/D-040)
Helpers in `src/` (tests: `node tests/unit/phase3.test.js`), runbook Phase 3 section, destination set up (21 headers, plain-text columns, frozen row; read back). Dry run on 2026-10-31 calls: 6 records -> 1 validated draft (source row 15451, stored in row 3 of `Phase 3 Emails`), 3 skipped, 2 deferred; no duplicates; `writes_enabled` back to false. Needs your human review of the draft, a second run, and OD-10/OD-32 confirmation. Report `docs/phase3-acceptance-report.md`. Nothing sent, nothing committed.

## Connector identity recorded (2026-11-01, uncommitted, D-038): documentation only
Connector account `karan.s@flexifunnels.com` (confirmed by you): Editor on the source and Editor on `Phase 3 Emails`. `Calls DONE` is unprotected, so source write protection is NOT enforced. Unresolved: make that account Viewer on the source (or an equivalent Google-enforced restriction) and confirm the destination is shared only with named support leads with link sharing off. Flags still false: writes_enabled, header_setup_authorized, headers_verified, source_access_enforced, destination_sharing_verified. No permission changed, no sheet touched.

## Phase 3B approvals recorded (2026-11-01, uncommitted, D-037): documentation only
Recorded your explicit approvals: real-transcript processing (OD-12) and persistent storage of names, emails, Fathom URLs, subjects and bodies in `Phase 3 Emails` (OD-19); schema confirmed (21 columns, last header `Source Row (reference only)`, no Call ID column). Retention period NOT set (company policy, to be confirmed). Not verified: connector account/access, source Viewer restriction (`Calls DONE` unprotected), destination sharing. One-time header/format setup planned (`docs/phase3-draft-destination.md` section 11), NOT performed, awaiting those checks and your go-ahead. OD-05/08 do not block a first dry run; OD-11 recommended before it. No sheet written, nothing committed.

## Phase 3A preflight done (2026-11-01, uncommitted, read-only)
Inspected both spreadsheets read-only (no writes). Source matches the documented headers; time cells have inconsistent zero-padding; `Calls DONE` has no protected ranges. Destination `Phase 3 Emails` / `Sheet1` (GID 0) is empty, 26 columns, timezone Etc/GMT; the 21-column schema fits unchanged. Connector account and Viewer/Editor level cannot be determined without a write; OD-12 and persistent-storage approvals are not recorded. Report with collision/idempotency design and the Phase 3B plan: `docs/phase3a-preflight-report.md`. Phase 3B not started; waiting for your approvals.

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
