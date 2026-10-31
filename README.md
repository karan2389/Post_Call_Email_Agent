# FlexiFunnels Post-Call Email Agent

An automated agent for the FlexiFunnels Customer Success / Support team. Every day it picks up the previous day's support calls (Asia/Kolkata) from Google Sheets, understands each conversation, writes a concise, personalised follow-up email that includes the Fathom recording link, validates it, sends it through Gmail, and records the outcome in the `POST_CALL_EMAIL_LOGS` worksheet.

> **Status:** Phase 0 — project initialisation (documentation only). No application code, integrations or cloud resources exist yet. See `ROADMAP.md` and `handoff.md`.

## What the agent does

```
Daily, Asia/Kolkata — target date = yesterday

Google Sheets (source)                              Google Sheets (tracking)
  customer, transcript, Fathom URL                    POST_CALL_EMAIL_LOGS + POST_CALL_EMAIL_EVENTS
          │                                                     ▲
          ▼                                                     │ every state change
  1. Fetch records ─► 2. Filter previous-day calls ─► 3. Check eligibility ─► 4. Check duplicates
                                                         │ missing transcript → PENDING, recheck next run
                                                         ▼
  9. Update tracking ◄─ 8. Send (Gmail) ◄─ 7. Validate ◄─ 6. Generate email ◄─ 5. Analyse transcript
          │
          ▼
  SENT  │  PENDING (waiting for data)  │  SKIPPED (with reason)  │  FAILED (with reason, retryable)
```

- Each run calculates **yesterday in Asia/Kolkata** and processes that day's calls, plus any earlier calls still waiting for a transcript. Running the job more than once is safe.
- A deterministic **eligibility check** runs before any AI call: cancelled calls, no-shows and opt-outs are skipped; missing transcripts wait as `PENDING` and are processed when they arrive.
- Each call gets an immutable **Call ID** (verified Fathom recording ID, or a generated UUID). Row numbers are never used for identity.
- The LLM pipeline separates what was **discussed**, **explained**, **completed**, and what is **pending for the customer** versus **pending for support** — and the validator rejects emails that blur these.
- A **delivery state machine** (`PENDING → PROCESSING → VALIDATING → SENDING → SENT`, or `SKIPPED` / `FAILED`) with idempotency and recovery prevents duplicate emails, including when Gmail succeeds but the tracking update fails.
- Incomplete transcripts, details still missing after the wait window, and failed validation are **skipped and recorded**, never sent. One failed record never stops the others.

## Technology

| Concern | Choice |
|---|---|
| Language | Python 3.12, plain Python (no agent frameworks) |
| LLM inference | Anthropic API (subject to access and company approval; model IDs configured, not hardcoded) |
| Data source and tracking | Google Sheets |
| Email delivery | Gmail API |
| Production execution | Google Cloud Run |
| Scheduling | Google Cloud Scheduler |
| Timezone | Asia/Kolkata |
| Future reporting | Separate dashboard reading the tracking worksheets |

## Repository layout

```
CLAUDE.md          Rules for Claude Code sessions
README.md          This file
memory.md          Durable decisions, discoveries, milestones
handoff.md         Current status and exact next steps
ROADMAP.md         Phases and exit criteria
docs/              Architecture and design documentation
skills/            Runtime LLM instructions (loaded by Python)
src/               Python package (Phase 1+)
config/            Non-secret configuration templates
tests/             Unit, integration, evaluation cases, synthetic fixtures
outputs/           Local drafts from synthetic runs (git-ignored)
logs/              Local logs (git-ignored)
```

## Documentation index

| Document | Contents |
|---|---|
| `docs/architecture.md` | Components, data flow, module boundaries |
| `docs/pipeline.md` | Daily previous-day selection, eligibility, deferral, failure isolation, rerun safety |
| `docs/source-sheet-profile.md` | Verified source spreadsheet, worksheet, column mapping and data-quality findings |
| `docs/delivery-state-machine.md` | States, transitions, leases, idempotency, recovery |
| `docs/call-id-strategy.md` | How Call IDs are assigned and protected |
| `docs/data-model.md` | Source sheet, tracking and events worksheet schemas |
| `docs/skip-reasons.md` | Every skip and failure reason code |
| `docs/validation-rules.md` | Deterministic and semantic email validation |
| `docs/skills-runtime.md` | How SKILL.md files are loaded and versioned at runtime |
| `docs/testing-strategy.md` | Test layers and evaluation approach |
| `docs/security-privacy.md` | Data handling, secrets, logging rules |
| `docs/deployment.md` | Planned Cloud Run / Scheduler deployment |
| `docs/open-decisions.md` | Unresolved decisions with recommendations |
| `docs/decisions/decision-log.md` | Accepted decisions with rationale |

## Setup

Not applicable yet. Local setup (Python 3.12, virtual environment, dependencies) will be documented in Phase 1. Python is not currently installed on the development machine.

## Data protection

Only synthetic data is allowed in this repository and workspace. Real transcripts, customer details and credentials must never be committed, stored in OneDrive or written to ordinary logs. See `docs/security-privacy.md`.
