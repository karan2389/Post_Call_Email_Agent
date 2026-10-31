# handoff.md

_Last updated: 2026-10-31 — Phase 0 complete and approved; repository moved to `C:\dev\post-call-email-agent`._

## Completed work

### Task 1 — Initialisation
- Local Git repo (`main`), `.gitignore` verified with `git check-ignore`.
- Folder structure, project docs, design docs, four SKILL.md specs, planning READMEs.

### Task 2 — Previous-day call processing design
- `docs/pipeline.md` (Asia/Kolkata target date, work queue, eligibility E1–E15, deferral, duplicates, failure isolation, rerun safety).
- `POST_CALL_EMAIL_LOGS` / `POST_CALL_EMAIL_EVENTS`; new reason codes and event types; transcript-analysis skill v1.1.0; evaluation cases EV-49 … EV-67; D-013 … D-016.

### Task 3 — Approval, commit and Phase 1 decisions (this task)
- User approved all Phase 0 documentation and the previous-day design.
- Initial commit `642f7ea` "Phase 0: project initialisation and previous-day pipeline design" (33 files).
- Recorded user decisions:
  - D-017 `SENDING` state adopted (OD-15 resolved).
  - D-018 discovery lookback 2 days (OD-24 resolved).
  - D-019 wait window 1 day after first deferral (OD-25 resolved). Clarified the rule: eligibility is rechecked **before** expiry, and waiting records past `pending_until` are still pulled into the queue once more. Added EV-52b and EV-52c; rewrote EV-52.
  - D-020 Python 3.12 + `uv`; repo to move out of OneDrive (OD-21 mostly resolved).

### Task 4 — Repository move
- Copied the repository (including `.git`) from `C:\Users\karan\OneDrive\Documents\POST-CALL-EMAIL-AGENT` to `C:\dev\post-call-email-agent`.
- Verified: `git fsck --full` clean, both commits present, working tree clean, all 33 tracked files byte-identical (SHA-256).
- Updated location references in CLAUDE.md, memory.md, ROADMAP.md, docs/security-privacy.md, docs/open-decisions.md, docs/decisions/decision-log.md.
- The OneDrive copy was **not** deleted. It is obsolete and should not be edited.

## Files modified in Task 3

```
CLAUDE.md, ROADMAP.md, memory.md, handoff.md
docs/pipeline.md, data-model.md, delivery-state-machine.md, open-decisions.md,
     security-privacy.md, decisions/decision-log.md
config/README.md, tests/evals/README.md
```

## Current status

Phase 0 complete and approved. Documentation only: **no application code, no API connections, no credentials, no cloud resources, no emails sent.** Task 3 changes are committed as a second commit on top of `642f7ea`. Phase 1 has not started.

## Pending work

- Install Python 3.12 and `uv`.
- The obsolete OneDrive copy is kept for now as a backup (user decision, 2026-10-31). Do not edit it.
- Explicit go-ahead for Phase 1.

## Errors / blockers

- **Python 3.12 not installed.** It blocks Phase 1. On Windows, add `tzdata` as a dependency for `zoneinfo`.
- Open decisions by phase (full list in `docs/open-decisions.md`):
  - Phase 1: none blocking.
  - Phase 2: OD-05, OD-08, OD-09, OD-11, OD-12, OD-13.
  - Phase 3: OD-01, OD-02, OD-04, OD-10, OD-18, OD-20, OD-26, OD-28.

## Exact next steps

1. Work only in `C:\dev\post-call-email-agent` from now on. The OneDrive copy stays as a backup until the user says otherwise.
2. Install Python 3.12 (python.org) and `uv`; verify `python --version` and `uv --version`.
3. On go-ahead, start Phase 1:
   - `pyproject.toml` (Python 3.12, `tzdata`, `pytest`);
   - package skeleton under `src/post_call_agent/`;
   - `Clock` and target-date logic, call-date parser, work queue;
   - eligibility checker with D-019 wait logic, duplicate checker;
   - Call ID and fingerprint, state machine with `SENDING`;
   - deterministic validation, skill loader;
   - synthetic fixtures EV-01 … EV-67;
   - unit tests with fakes, run under a non-IST process timezone.
