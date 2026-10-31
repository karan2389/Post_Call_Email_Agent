# handoff.md

_Last updated: 2026-10-31 — Phase 0 complete and approved by the user; initial commit made._

## Completed work

### Task 1 — Initialisation (earlier today)
- Local Git repo (`main`), `.gitignore` verified with `git check-ignore`.
- Folder structure, project docs, design docs, four SKILL.md specs, planning READMEs.

### Task 2 — Previous-day call processing design (this task)
- New canonical pipeline spec `docs/pipeline.md`: Asia/Kolkata target-date calculation, call-date parsing, work queue (new target-date calls + waiting records + retries), deterministic eligibility component (E1–E15, `ELIGIBLE`/`DEFER`/`SKIP`), deferral lifecycle for late transcripts, duplicate check, stage-by-stage flow in the requested order, per-record failure isolation, circuit breaker, rerun safety, configuration table.
- Tracking worksheet renamed to `POST_CALL_EMAIL_LOGS` (stores final email body, customer info, status, timestamps); events worksheet `POST_CALL_EMAIL_EVENTS`.
- New reason codes: `CALL_CANCELLED`, `CUSTOMER_NO_SHOW`, `FATHOM_NOT_SHAREABLE`, `UNEXPECTED_ERROR`; deferrable/terminal type on every code; new event types `RUN_ABORTED`, `PROCESSING_HALTED`, `DEFERRED`, `WAIT_EXPIRED`.
- State machine: `PENDING → PENDING` (deferral recheck), `PENDING → SKIPPED`, `FAILED → SKIPPED` (`CALL_TOO_OLD`); write-ahead now includes subject and body.
- transcript-analysis skill → v1.1.0 (no-show detection).
- 19 new evaluation/reliability cases (EV-49 … EV-67); EV-06 and EV-20 … EV-24 changed from immediate skip to deferral.
- Decisions D-013 … D-016 recorded; new open decisions OD-24 … OD-28; OD-04, OD-10, OD-17, OD-18, OD-19 updated.
- Consistency checks passed: every code used is defined; every OD referenced exists (28 defined); skill versions consistent.

## Files modified in Task 2

```
NEW   docs/pipeline.md
EDIT  CLAUDE.md, README.md, ROADMAP.md, memory.md, handoff.md, .env.example
EDIT  docs/architecture.md, delivery-state-machine.md, data-model.md (rewritten), skip-reasons.md (rewritten),
      call-id-strategy.md, testing-strategy.md, open-decisions.md, deployment.md, security-privacy.md,
      decisions/decision-log.md
EDIT  skills/transcript-analysis/SKILL.md (1.0.0 → 1.1.0)
EDIT  tests/evals/README.md, src/README.md, config/README.md
```

## Current status

Phase 0 complete. Documentation and previous-day design **approved by the user** (2026-10-31) and committed as the initial Git commit. **No application code, no API connections, no credentials, no cloud resources, no emails sent.** Phase 1 has not started; it needs explicit go-ahead plus the prerequisites below.

## Pending work

- Answers to OD-15, OD-21, OD-24, OD-25 (Phase 1 defaults).
- Python 3.12 installation.
- Phase 1 per `ROADMAP.md` (now includes selection, eligibility, duplicates, failure isolation).

## Errors / blockers

- **Python 3.12 not installed** — blocks Phase 1. On Windows, also add `tzdata` for `zoneinfo`.
- Repo inside OneDrive (OD-21).
- Decisions needed early:
  - Phase 1 config defaults: OD-15 (`SENDING`), OD-21, OD-24 (lookback), OD-25 (wait window).
  - Phase 2: OD-05, OD-08, OD-09, OD-11, OD-12, OD-13.
  - Phase 3: OD-01, OD-02, OD-04 (shareability signal), OD-10, OD-18, OD-20, OD-26 (`call_status`), OD-28 (date format/sheet timezone).
  - Full list: `docs/open-decisions.md`.

## Exact next steps

1. User answers OD-15, OD-21, OD-24, OD-25 (others can wait); record answers in `decision-log.md` and `open-decisions.md`.
2. ~~Commit Phase 0~~ — done.
3. Install Python 3.12 (+ `uv` if chosen); decide on moving the repo out of OneDrive.
4. Phase 1: `pyproject.toml`; package skeleton; `Clock` + target-date logic; call-date parser; work queue; eligibility checker; duplicate checker; Call ID/fingerprint; state machine; deterministic validation; skill loader; synthetic fixtures EV-01 … EV-67; unit tests with fakes (run under non-IST process timezone).
