# Architecture

Status: **Proposed (D-026), pending Phase 1 validation.** The primary design runs as a **Claude Code scheduled task** using the user's Claude subscription and **native Google connectors** (Sheets, Gmail). Every capability marked *(validate)* has not been verified in a scheduled execution yet; see `scheduled-execution.md` §4. The earlier Python / Anthropic API / Cloud Run design is kept in `future-alternatives.md`.

Business rules, safety controls and data rules (D-001 … D-025) are unchanged by this pivot unless stated.

## 1. Goals

1. Send a concise, accurate, personalised follow-up email after each eligible support call.
2. Never send an email that is inaccurate, incomplete or a duplicate.
3. Record every outcome (sent, skipped, failed) with reasons and timestamps.
4. Run unattended once a day; recover safely from interrupted runs.
5. Provide a tracking schema a future dashboard can read without changing the agent.
6. **Avoid separately billed infrastructure:** no Anthropic API billing, no deployed backend, no Google Cloud resources for the initial workflow (D-026).

## 2. Non-goals (initial workflow)

- Fathom API/MCP integration (recording URLs and transcripts come from Google Sheets).
- Human approval of each email. Before go-live the agent runs in `shadow` mode while the manual process continues (D-022).
- Generating or modifying transcripts. The existing transcript automation stays independent (D-023).
- Replying to customer responses.
- Dashboard (future).
- A separately deployed Python backend, Cloud Run, Cloud Scheduler, Secret Manager (see `future-alternatives.md`).

## 3. Components

```
┌──────────────── Claude Code scheduled task (daily 09:00 Asia/Kolkata) ────────────────┐
│  Claude model from the user's Claude plan (consumes plan usage; not unlimited)          │
│                                                                                          │
│  Instructions loaded from the repository:                                                │
│    CLAUDE.md ─ project rules            workflows/daily-post-call-run.md ─ the runbook   │
│    skills/*/SKILL.md ─ analysis, summary, generation, validation                          │
│    config/run-settings.yaml ─ delivery mode, go-live date, windows, limits               │
│    docs/ ─ reference rules (pipeline, Call ID, validation, reason codes)                 │
│                                                                                          │
│  Optional deterministic helpers run inside the session (OD-38, validate)                 │
│    date maths · URL parsing · row signatures · hashes · UUIDs                             │
└──────────────┬──────────────────────────────────────────┬────────────────────────────────┘
               │ native Google Sheets connector (OAuth)   │ native Gmail connector (OAuth)
               ▼                                          ▼
   Google spreadsheet "CSC  Booking - All Agents"     Sender mailbox (the authorising
     Calls DONE      ─ read; write AD only            Google account, OD-39)
     POST_CALL_EMAIL_LOGS    ─ read/write               search · drafts · send (live only)
     POST_CALL_EMAIL_EVENTS  ─ append
               ▲
               │ writes Transcript / AI Summary (independent; never touched by the agent)
   Existing transcript automation (OD-33)
```

### 3a. Operational source and recovery copy (D-029)

| Role | Spreadsheet | ID | GID | Agent access |
|---|---|---|---|---|
| **Operational and authoritative source (agent input)** | `CSC  Booking - All Agents` (two spaces), worksheet `Calls DONE` | `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI` | `1314582701` | Read each run. Writes disabled (see below) |
| **Recovery copy only** | `CSC Booking - Backup`, worksheet `Calls DONE` | `10YjhBUPpJBEnbXz5zTqGoXEIVEIuuMZT4cCyiYJ7p3Q` | not verified | **None.** Not an input, never read or written by the agent |

The backup synchronisation (script, schedule, logic) is **outside this repository**, is not part of agent execution and is documented separately in `backup-recovery.md`. The original is the only operational source; all column mappings (`source-sheet-profile.md`, `data-model.md`) refer to it.

**Source writes are disabled.** Column AD `POST_CALL_CALL_ID` is a *proposal* until all of these hold (`call-id-strategy.md` §0): column ownership confirmed, header approved, protected ranges verified (R-03, OD-36), and the backup synchronisation confirmed not to erase agent-owned data (OD-43). `source.source_writes_enabled` and `source.protected_ranges_verified` stay `false` until then.
| Component | Role | Status |
|---|---|---|
| Claude Code scheduled task | Starts the daily run and executes the workflow | Proposed; cloud variant to be tested first, desktop as fallback (OD-37) *(validate)* |
| Claude model (subscription) | Transcript analysis, summary, email generation, semantic validation | Proposed; usage limits *(validate, R-09)* |
| Repository instructions | `CLAUDE.md`, `workflows/`, `skills/`, `config/`, `docs/` | Exists; availability in scheduled sessions *(validate, R-02)* |
| Google Sheets connector | Read `Calls DONE`; write empty AD cells; read/write logs | Tools observed in an interactive session; scheduled access *(validate, R-01)* |
| Gmail connector | Reconciliation search; test drafts; sends in `live` mode | Tools observed in an interactive session; scheduled access and unattended sending *(validate, R-01, R-04)* |
| `POST_CALL_EMAIL_LOGS` / `POST_CALL_EMAIL_EVENTS` | Persistent state across independent sessions | Designed; not created |
| Column AD `POST_CALL_CALL_ID` | Stable Call ID per call | Proposed (D-024); writes gated, not approved to write; not created |

**Observed connector tools (interactive session, 2026-10-31).** Sheets: `get_spreadsheet`, `get_values`, `update_values`, `append_values`, `batch_clear_values`, `insert_dimension`, `update_spreadsheet`, `update_formulas`, `copy_sheet_to_another_spreadsheet`. Gmail: `search_threads`, `get_thread`, `get_message`, `create_draft`, `send_message`, `reply`, label tools, and others. This shows what exists in an interactive session only. It says nothing about scheduled runs, and some tools are **forbidden** for this agent (see §5).

## 4. Run flow (one scheduled execution)

The runbook is `workflows/daily-post-call-run.md`; the rules it applies are in `pipeline.md`.

```
PREFLIGHT → FETCH → RECOVER → FILTER PREVIOUS-DAY → ELIGIBILITY → DUPLICATES
   → ANALYSE → GENERATE → VALIDATE → PRE-SEND RE-CHECK → SEND (live only) → LOG → RUN SUMMARY
```

How the user's 9-step workflow maps onto these stages:

| User workflow step | Stage(s) |
|---|---|
| 1 Scheduled task starts | PREFLIGHT (connectors, instructions, settings, run lock) |
| 2 Read eligible records from `Calls DONE` | FETCH, FILTER PREVIOUS-DAY |
| 3 Identify pending calls and late transcripts | FILTER (waiting and retry records), RECOVER |
| 4 Validate customer information and recording links | ELIGIBILITY |
| 5 Analyse transcripts | ANALYSE |
| 6 Generate customer-focused emails | GENERATE, VALIDATE |
| 7 Check duplicate status and transcript changes | DUPLICATES (before analysis, cheap) **and** PRE-SEND RE-CHECK (transcript hash, `Recording Sent`, URLs) |
| 8 Log results in `POST_CALL_EMAIL_LOGS` | Every state change, plus LOG and RUN SUMMARY |
| 9 Send only in live mode with permissions | SEND gate: `delivery_mode: live`, `go_live_date`, connector permission confirmed in PREFLIGHT |

Each record is processed on its own; one failed record never stops the others (`pipeline.md` §3).

## 5. Agent boundaries (enforced by instructions, not by infrastructure)

**Instructions and agent checks do NOT enforce these limits.** The connectors act with the authorising Google user's permissions. The runbook, the pre/post-write checks and the forbidden-tool list only describe intended behaviour; a mistake, a prompt-injection in sheet content or a changed connector could still write anywhere that account can edit. The only real enforcement of the AD-only rule is **Google Sheets protected-range permissions that have been verified** (R-03, OD-36), and that verification is a **precondition for any write to the real source sheet** (AD header or Call IDs). Until it is done, writes are limited to a test copy. Instruction-level rules stay in place as defence in depth, never as the control.

| Allowed | Forbidden |
|---|---|
| `get_values` / `get_spreadsheet` on the source spreadsheet | Any write to `Calls DONE` other than a single empty AD cell |
| `update_values` on exactly one `Calls DONE!AD{row}` cell, after the pre-write check | `insert_dimension`, `batch_clear_values`, `update_formulas`, `update_spreadsheet`, `copy_sheet_to_another_spreadsheet` on the source worksheet |
| Read/write/append on `POST_CALL_EMAIL_LOGS` and `POST_CALL_EMAIL_EVENTS` (once created with approval) | Writing `Transcript`, `AI Summary`, `Recording Sent` |
| Gmail search/read on the sender mailbox for reconciliation | Gmail delete, trash, spam, label changes on unrelated mail, forwarding |
| `create_draft` in `test` mode (internal recipients only) | `send_message` / `reply` in any mode other than `live`, or to any recipient other than the record's customer |
| `send_message` in `live` mode after every gate passes | Sending more than one email per Call ID |

## 6. LLM stages and data contracts

The four stages are now steps the scheduled Claude session performs while following each SKILL.md. They are no longer separate API calls. Contracts are unchanged:

| Stage | Skill | Output |
|---|---|---|
| Analysis | `transcript-analysis` | `AnalysisResult` with classified items and evidence |
| Summary | `customer-summary` | `CustomerSummary`, each entry traceable to analysis items |
| Generation | `email-generation` | `EmailDraft` (all recording segments, in order) |
| Validation | `email-validation` + deterministic checks | `ValidationResult` |

Each stage writes its JSON result into the session's working notes before the next stage. Traceability stays the core safety property. Long transcripts and many records per run affect context and plan usage (R-09); per-record isolation is OD-40.

## 7. Key design decisions

See `decisions/decision-log.md`. Still in force: D-001 … D-005, D-009 … D-025. Changed by D-026: D-006 (Python runtime), D-007 (Anthropic API), D-008 (Cloud Run / Cloud Scheduler) and D-020 (Python + uv) are superseded for the primary architecture and kept as future alternatives.

## 8. Concurrency

The initial assumption is one scheduled run per day. Whether the scheduler can start a second run while one is still active is unknown (R-08). Protection, in order:

1. One scheduled task, one daily trigger, no manual runs while it is active.
2. A **run lock** row in `POST_CALL_EMAIL_EVENTS` (`RUN_STARTED` without `RUN_FINISHED` less than *N* minutes old means another run is active) checked in PREFLIGHT.
3. Per-record leases in `POST_CALL_EMAIL_LOGS`.

Google Sheets has no transactions, so these reduce the risk without eliminating it. Validate in Phase 1.

## 9. Configuration

- **No API keys or service-account credentials** in the primary architecture. Access comes from connector OAuth grants made by the user (R-01, OD-39).
- Run settings (delivery mode, go-live date, allowlist, windows, limits, worksheet names) live in `config/run-settings.yaml`, read at PREFLIGHT. Changing the mode (e.g. back to `shadow`) is a one-line edit.
- Model choice is a scheduled-task setting. The model name is recorded per record if the session can report it.

## 10. Failure philosophy (unchanged)

- Data that may still arrive → `PENDING` with `pending_reason`, rechecked each run until the wait window expires, then `SKIPPED`.
- Data or content problem that will not change → `SKIPPED` with a reason. The agent does not guess.
- Transient technical problem (connector, model, interrupted session) → `FAILED`, retryable up to a limit.
- Unknown whether an email went out → reconcile; if still unknown, `FAILED` `SEND_UNCONFIRMED`, **never** resent automatically.
- If PREFLIGHT cannot confirm connectors, instructions or settings, the run stops before touching any record (`CONFIG_ERROR` / `CONNECTOR_UNAVAILABLE`).
