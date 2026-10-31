# handoff.md

_Last updated: 2026-10-31 — Phase 1 partly done (read-only). Awaiting review. Nothing from Tasks 6–8 is committed._

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
B1 no remote repository (R-02) · B2 connector Google accounts unidentified (R-13) · B3 protected ranges absent/unverified, needs a test copy (R-03) · B4 Gmail in cloud untested, needs test-mailbox plan and approval (R-01, R-04) · B5 helpers undecided (OD-38) · B6 data-handling approval for cloud session history (R-12, OD-12).

## Exact next steps
1. Review `docs/phase1-results.md`; decide whether to commit Tasks 6–8, and whether to delete the test routine / default environment at claude.ai.
2. Decide on **B1**: create a **private** remote repository (instructions only, no customer data) and connect it to claude.ai, then run a second manual cloud test that only reads `CLAUDE.md` and the runbook (R-02). Needs your approval before anything is pushed.
3. Tell me which Google accounts authorise the Sheets and Gmail connectors (B2), and agree a test copy of the spreadsheet for the R-03 protection test (B3).
4. Do not enable any schedule until R-01 … R-04 and R-12 are resolved.
