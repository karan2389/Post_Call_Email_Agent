# Architecture

Status: **Approved design (Phase 0).** Items marked *OD-xx* depend on `open-decisions.md`.

## 1. Goals

1. Send a concise, accurate, personalised follow-up email after each eligible support call.
2. Never send an email that is inaccurate, incomplete or a duplicate.
3. Record every outcome (sent, skipped, failed) with reasons and timestamps.
4. Run unattended on a schedule; recover safely from crashes and partial failures.
5. Provide a tracking schema a future dashboard can read without changing the agent.

## 2. Non-goals (MVP)

- Fathom API/MCP integration (Fathom URL and transcript come from Google Sheets).
- Human approval of each email (only during the pilot, Phase 5).
- Replying to customer responses or continuing threads.
- Dashboard (future, Phase 8).
- Agent frameworks.

## 3. Components

```
                    ┌─────────────────── Cloud Scheduler (Asia/Kolkata) ───────────────────┐
                    ▼
┌─────────────────────────────── Cloud Run (single execution) ───────────────────────────────┐
│ main / run orchestrator                                                                     │
│   ├─ config            env + YAML, model IDs, policy                                        │
│   ├─ sources           SourceSheetReader: read rows, write Call IDs                         │
│   ├─ identity          CallIdAssigner, SourceFingerprint                                    │
│   ├─ tracking          TrackingStore: POST_CALL_EMAIL_LOGS + POST_CALL_EMAIL_EVENTS         │
│   ├─ state             StateMachine: allowed transitions, leases, retry policy              │
│   ├─ selection         TargetDateCalculator (Asia/Kolkata), CallDateParser, WorkQueue       │
│   ├─ eligibility       EligibilityChecker: ELIGIBLE / DEFER / SKIP (no LLM)                 │
│   ├─ duplicates        DuplicateChecker: Call ID, fingerprint, Fathom ID                    │
│   ├─ skills            SkillLoader: reads skills/*/SKILL.md, versions                       │
│   ├─ llm               LlmClient: Anthropic wrapper, structured output, retries             │
│   ├─ pipeline          analyse → summarise → generate → validate                            │
│   ├─ validation        deterministic checks + semantic validator result                     │
│   ├─ delivery          GmailSender + GmailReconciler                                        │
│   └─ logging           structured, redacted logs                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
        │ read/write                      │ HTTPS                     │ send / search
        ▼                                 ▼                           ▼
  Google Sheets                     Anthropic API                  Gmail API
  (source + tracking)
```

Each external service sits behind a small interface (`SourceSheetReader`, `TrackingStore`, `LlmClient`, `GmailSender`) so the pipeline and state machine are tested with in-memory fakes.

## 4. Run flow (one scheduled execution)

The full stage-by-stage specification is in **`pipeline.md`**. In summary, one daily run (Asia/Kolkata):

```
FETCH RECORDS → (RECOVER) → FILTER PREVIOUS-DAY CALLS → CHECK ELIGIBILITY → CHECK DUPLICATES
   → ANALYSE TRANSCRIPT → GENERATE EMAIL → VALIDATE → SEND → UPDATE TRACKING → (RUN SUMMARY)
```

1. **Fetch** — load config and skills (`CONFIG_ERROR` aborts); snapshot the source worksheet and `POST_CALL_EMAIL_LOGS`.
2. **Recover** — reconcile `SENDING` rows with Gmail; return expired leases and retryable failures to `PENDING`.
3. **Filter previous-day calls** — `target_date = today(Asia/Kolkata) − 1`. Work queue = new calls dated `target_date` (plus optional lookback) + `PENDING` records still waiting for data + retries. Assign Call IDs; `SENT`/`SKIPPED` never enter the queue.
4. **Check eligibility** — deterministic, per record: `ELIGIBLE`, `DEFER` (e.g. transcript not yet available → stays `PENDING`, rechecked next run) or `SKIP` (e.g. cancelled, no-show, opted out).
5. **Check duplicates** — Call ID, fingerprint, Fathom ID; then claim `PENDING → PROCESSING`.
6. **Analyse transcript** → **generate email** (summary + generation) → **validate** → **send** (write-ahead `SENDING`) → **update tracking** (`SENT` with final body, customer info, timestamps).
7. **Run summary** — counts by status and reason for `target_date`.

Each record runs inside its own error boundary: one failed record never stops the others (`pipeline.md` §3).

## 5. LLM pipeline and data contracts

| Stage | Skill | Input | Output |
|---|---|---|---|
| Analysis | `transcript-analysis` | transcript, call metadata | `AnalysisResult`: transcript status, sentiment, issues, classified items (`discussed`, `explained`, `completed`, `pending_customer_action`, `pending_support_action`) with evidence |
| Summary | `customer-summary` | `AnalysisResult`, customer first name | `CustomerSummary`: customer-facing sections, each item traceable to an analysis item ID |
| Generation | `email-generation` | `CustomerSummary`, recipient, Fathom URL, sender/signature policy | `EmailDraft`: subject, plain-text body, referenced item IDs |
| Validation | `email-validation` | `EmailDraft`, `AnalysisResult`, `CustomerSummary`, policy | `ValidationResult`: pass/fail, issue codes, evidence |

Every stage returns JSON matching a schema defined in its SKILL.md. Invalid JSON or schema mismatch → one retry, then `FAILED` (`LLM_OUTPUT_INVALID`).

Traceability is the core safety property: every statement in the email must map to an item ID in the summary, and every summary item maps to an analysis item with transcript evidence.

## 6. Key design decisions

See `decisions/decision-log.md`. Summary:

- Google Sheets is the only data source in the MVP.
- Stable, immutable Call IDs; never row numbers.
- Explicit delivery state machine with leases and Gmail reconciliation.
- SKILL.md files are runtime prompt sources, loaded and versioned by Python.
- Anthropic API; model IDs from configuration only.
- Plain Python 3.12.
- Asia/Kolkata timestamps everywhere.
- Daily run processes the previous calendar day's calls (Asia/Kolkata), with deferral for late transcripts.
- Eligibility is a separate deterministic component before any LLM call.

## 7. Concurrency

MVP assumes **one execution at a time** (Cloud Run max instances / job parallelism = 1, OD-17). Leases on tracking rows add protection if two executions ever overlap, but Google Sheets has no transactions, so single execution is the primary guarantee.

## 8. Configuration

- Secrets (Anthropic key, Google credentials): environment / Secret Manager only.
- Non-secret settings (sheet IDs, worksheet names, batch size, lease duration, retry limits, email policy): YAML in `config/` plus environment overrides.
- `DRY_RUN` and `RECIPIENT_ALLOWLIST` safety switches exist from the first Gmail integration.

## 9. Failure philosophy

- Data that may still arrive (transcript, Fathom URL, customer details) → stays `PENDING` with a `pending_reason`, rechecked each run until a wait window expires, then `SKIPPED`.
- Data or content problem that will not change (cancelled, no-show, opted out, failed validation) → `SKIPPED` (terminal, reason recorded). The system does not guess.
- Transient technical problem → `FAILED` (retryable up to a limit).
- Unknown whether an email went out → reconcile; if still unknown, `FAILED` with `SEND_UNCONFIRMED` and **no automatic resend**.
