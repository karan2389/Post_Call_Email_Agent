# FlexiFunnels Post-Call Email Agent

An automated agent for the FlexiFunnels Customer Success / Support team. Every day it picks up the previous day's support calls (Asia/Kolkata) from Google Sheets, understands each conversation, writes a concise, personalised follow-up email that includes the Fathom recording link(s), validates it, and (only in `live` mode) sends it through Gmail. Every outcome is recorded in the `POST_CALL_EMAIL_LOGS` worksheet.

> **Status:** Phase 1 partly done (read-only, `docs/phase1-results.md`). The architecture below is **proposed** (D-026): the Sheets connector works in a cloud run, but project instructions are not yet reachable from the cloud (no remote repository), Gmail in the cloud is untested, and AD-only writes are not yet enforceable. No recurring schedule, spreadsheet change, application code or email exists. See `ROADMAP.md` and `handoff.md`.

## Architecture in brief

| Layer | Proposed design |
|---|---|
| Development | Claude Code, this repository (instructions, skills, runbook, docs, tests) |
| Execution | **Claude Code scheduled task**, once daily at 09:00 Asia/Kolkata, using the Claude model from the user's subscription (consumes plan usage; limited) |
| Data access | **Native Google Sheets connector** and **native Gmail connector** (Google OAuth) |
| State | `POST_CALL_EMAIL_LOGS` / `POST_CALL_EMAIL_EVENTS` worksheets, and `POST_CALL_CALL_ID` in source column AD (the only approved source-sheet write) |
| Avoided | A separately billed Anthropic API, a deployed backend, and Google Cloud infrastructure for the initial workflow (kept as `docs/future-alternatives.md`) |

## What a daily run does

```
Scheduled task starts (09:00 IST, target date = yesterday)
  PREFLIGHT ─► FETCH ─► RECOVER ─► FILTER PREVIOUS-DAY ─► ELIGIBILITY ─► DUPLICATES
     ─► ANALYSE ─► GENERATE ─► VALIDATE ─► PRE-SEND RE-CHECK ─► SEND (live only) ─► LOG
Outcome per call:  SENT │ PENDING (waiting for data) │ SKIPPED (reason) │ FAILED (reason, retryable)
```

- Yesterday is calculated in **Asia/Kolkata**. Late transcripts wait as `PENDING` and are picked up in later runs. Running more than once is safe.
- Rule-based **eligibility** comes first: cancelled calls, no-shows and `Recording Sent = yes` are skipped. Ambiguous cases go to review, never guessed.
- Each call has a persistent **Call ID** (`gen:{uuid4}` in column AD). One call = one email, even if the call was recorded in several Fathom segments.
- Analysis separates what was **discussed**, **explained**, **completed**, and **pending for the customer** versus **for support**; the validator rejects emails that blur these.
- **Delivery modes** `dry_run`, `test`, `shadow`, `live`: only `live` emails customers, and only for calls on or after the go-live date. Before go-live the manual recording process continues.
- A delivery state machine with write-ahead and reconciliation prevents duplicate emails, including after interrupted runs.

## Repository layout

```
CLAUDE.md          Rules for every Claude Code session (interactive and scheduled)
README.md          This file
memory.md          Durable decisions, discoveries, milestones
handoff.md         Current status and exact next steps
ROADMAP.md         Phases and exit criteria
workflows/         daily-post-call-run.md — the runbook the scheduled task follows
docs/              Architecture, scheduled execution and risks, rules, data model, security, decisions
skills/            Four SKILL.md files: analysis, summary, generation, validation
config/            run-settings.yaml (non-secret) and planned schema/policy files
tests/             Scenario catalogue (EV-01 … EV-113) and synthetic fixtures
src/               Reserved for optional deterministic helpers (OD-38); no application code
outputs/, logs/    Local synthetic outputs (git-ignored)
```

## Documentation index

| Document | Contents |
|---|---|
| `docs/architecture.md` | Proposed architecture, components, boundaries, run flow |
| `docs/scheduled-execution.md` | Execution model, schedule, delivery modes by phase, **validation register R-01 … R-13**, cost policy, go-live checklist |
| `docs/phase1-results.md` | Phase 1 read-only feasibility results, connector limitations and remaining blockers |
| `workflows/daily-post-call-run.md` | The daily runbook |
| `docs/pipeline.md` | Rules: previous-day selection, eligibility E1–E18, deferral, duplicates, failure isolation, delivery modes |
| `docs/source-sheet-profile.md` | Verified `Calls DONE` columns, formats, data-quality findings, transcript-automation dependency |
| `docs/call-id-strategy.md` | Call ID in column AD and the write-safe assignment procedure |
| `docs/delivery-state-machine.md` | States, transitions, leases, idempotency, recovery |
| `docs/data-model.md` | Source mapping, recording-URL parsing, logs and events schemas |
| `docs/validation-rules.md` | Deterministic and semantic email validation |
| `docs/skip-reasons.md` | Every skip, deferral and failure reason code; event types |
| `docs/skills-runtime.md` | How a scheduled session uses the skills |
| `docs/testing-strategy.md` | How scenarios run on a test copy; scoring; recovery scenarios |
| `docs/security-privacy.md` | Data flow, access control, logging rules, write safety |
| `docs/future-alternatives.md` | The original Python / Anthropic API / Cloud Run design and when to reconsider it |
| `docs/open-decisions.md` | Unresolved decisions with recommendations |
| `docs/decisions/decision-log.md` | Accepted decisions with rationale |

## Setup

Nothing to install for the primary architecture. Phase 1 will create and validate one **read-only** scheduled task (needs user approval). Python is not needed unless helper scripts are approved (OD-38).

## Data protection

Only synthetic data is allowed in this repository. Real transcripts, customer details, recording URLs and credentials must never be committed, stored in OneDrive or written into run summaries. See `docs/security-privacy.md`.
