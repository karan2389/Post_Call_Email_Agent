# handoff.md

_Last updated: 2026-10-31 — source sheet inspected and documented; awaiting user review._

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

### Task 5 — Source sheet inspection (this task)
- Used the Google Sheets MCP connector (`get_spreadsheet`, `get_values`) **read-only** on spreadsheet `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, worksheet `Calls DONE` (GID 1314582701). Nothing was written.
- Read: workbook metadata (timezone, locale, sheets), header row, sample rows for 30–31 Oct 2026, cell types for one row, a `Recording URL` slice (≈60 rows), the `Customer Not Came`/`Cancel` columns (rows 15000–15455), and transcript structure (profiled by length/format only).
- A transcript read exceeded the tool output limit and was saved to a local tool-results file. It was profiled without printing content, then **deleted**.
- Wrote `docs/source-sheet-profile.md` (verified columns, formats, data-quality issues, implications; no customer data or share tokens).
- Updated data-model §1 (verified / never-use / missing / assumptions), pipeline (date + time columns, E1/E2 from `Meeting Notes`, E3/E4 inactive, E9/E10 URL rules), call-id-strategy, skip-reasons (proposed `RECORDING_ALREADY_SENT`), open-decisions (OD-03 and OD-28 resolved; OD-01/02/04/08/10/26 updated; new OD-29 … OD-32), decision-log D-021, README, config/README, `.env.example`.

## Files modified in Task 5

```
NEW   docs/source-sheet-profile.md
EDIT  docs/data-model.md, pipeline.md, call-id-strategy.md, skip-reasons.md, open-decisions.md,
      decisions/decision-log.md
EDIT  README.md, config/README.md, .env.example, memory.md, handoff.md
```

## Current status

Phase 0 complete and approved; source sheet verified and documented. Documentation only: **no application code, no production integration, no credentials, no cloud resources, no emails sent, no writes to the source sheet.** Awaiting user review of the source mapping. Phase 1 has not started.

## Pending work

- Install Python 3.12 and `uv`.
- The obsolete OneDrive copy is kept for now as a backup (user decision, 2026-10-31). Do not edit it.
- Explicit go-ahead for Phase 1.

## Errors / blockers

- **Python 3.12 not installed.** It blocks Phase 1. On Windows, add `tzdata` as a dependency for `zoneinfo`.
- Open decisions by phase (full list in `docs/open-decisions.md`):
  - Phase 1: none blocking.
  - Phase 2: OD-05, OD-08, OD-09, OD-11, OD-12, OD-13.
  - Phase 2: also OD-30 (Meeting Notes as context), OD-32 (name normalisation).
  - Phase 3: OD-01 (automation owner), OD-02 (Call ID storage — the sheet is shared and has no ID column), OD-04, OD-10, OD-18, OD-20, OD-26 (cancel/no-show patterns), OD-29 (existing automation and manual recording emails), OD-31 (URL anomalies).
- **Highest-risk finding:** the team may already email recordings manually (`Recording Sent`). Customers could receive two emails unless OD-29 is settled before go-live.

## Exact next steps

1. User reviews `docs/source-sheet-profile.md` and the updated `docs/data-model.md` §1.
2. User answers or delegates OD-02, OD-26 and OD-29 (they shape Phase 3; none block Phase 1).
3. Work only in `C:\dev\post-call-email-agent`. The OneDrive copy stays as a backup.
4. Install Python 3.12 (python.org) and `uv`; verify `python --version` and `uv --version`.
5. On go-ahead, start Phase 1 (synthetic fixtures should mirror the verified header names and formats):
   - `pyproject.toml` (Python 3.12, `tzdata`, `pytest`);
   - package skeleton under `src/post_call_agent/`;
   - `Clock` and target-date logic, call-date parser, work queue;
   - eligibility checker with D-019 wait logic, duplicate checker;
   - Call ID and fingerprint, state machine with `SENDING`;
   - deterministic validation, skill loader;
   - synthetic fixtures EV-01 … EV-67;
   - unit tests with fakes, run under a non-IST process timezone.
