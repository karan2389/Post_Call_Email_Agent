# Future Alternatives (not the primary architecture)

Status: **Reference only.** This was the original Phase 0 design (D-006, D-007, D-008, D-020). D-026 superseded it for the primary architecture to avoid separate API and cloud costs. It is kept because it may become necessary if the scheduled-task approach cannot meet reliability, volume or control requirements (see §5). Nothing here has been built or provisioned.

## 1. Python application runtime (was D-006, D-020)

- Python 3.12, plain Python, managed with `uv`; dependencies `anthropic`, `google-api-python-client`, `google-auth`, `tzdata`, `pytest`.
- Planned package layout:

```
src/post_call_agent/
├── main.py              one run: fetch → recover → filter → eligibility → duplicates → process → summary
├── config.py            env + YAML; model IDs from configuration only; safety switches
├── models.py            CallRecord, AnalysisResult, CustomerSummary, EmailDraft, ValidationResult, TrackingRecord, Event
├── timeutil.py          injectable Clock, Asia/Kolkata, target-date calculation
├── selection.py         call-date parsing, previous-day filter, lookback, work queue
├── identity.py          Call ID assignment, row signature, fingerprint
├── recordings.py        recording URL parser (multi-segment)
├── state.py             state machine, leases, retry policy
├── eligibility.py       ELIGIBLE / DEFER / SKIP
├── duplicates.py        duplicated Call IDs, fingerprints, cross-row URLs
├── skills_loader.py     reads skills/*/SKILL.md, builds prompts, records versions
├── llm/client.py        Anthropic client (structured JSON, retries, timeouts)
├── pipeline/            analyse, summarise, generate, validate
├── sources/             read-only sheet reader + SourceCallIdWriter (single empty AD cell only)
├── tracking/            POST_CALL_EMAIL_LOGS / POST_CALL_EMAIL_EVENTS
└── delivery/            GmailSender (deterministic Message-ID) + GmailReconciler
```

- A **code-level write guard** made AD the only writable source column. This is stronger than instruction-level enforcement (compare `architecture.md` §5).
- Unit tests with in-memory fakes; evaluation suite via the API.

## 2. Anthropic API for inference (was D-007)

- Separately billed API key; a model ID per stage (`MODEL_ANALYSIS`, `MODEL_SUMMARY`, `MODEL_GENERATION`, `MODEL_VALIDATION`), never hardcoded.
- Structured JSON outputs with schema validation and one retry.
- Data-retention terms of the API account to be approved before real data.

## 3. Google APIs with a service account

- Sheets API via a dedicated service account. Protected ranges could then allow that account to edit only AD, which is a real permission boundary, unlike connector OAuth acting as a user.
- Gmail API via Workspace domain-wide delegation limited to the sender mailbox. Scopes `gmail.send` plus `gmail.readonly` (`gmail.metadata` does not support search queries).
- **Deterministic Message-ID** `<{call_id_safe}.{attempt}@{MESSAGE_ID_DOMAIN}>` plus header `X-FlexiFunnels-Call-ID`, with reconciliation by `rfc822msgid:` search. Whether Gmail preserves a client-supplied Message-ID was never verified (old OD-16).
- Read values with `valueRenderOption=UNFORMATTED_VALUE`, `dateTimeRenderOption=SERIAL_NUMBER`.

## 4. Google Cloud deployment (was D-008)

| Component | Plan |
|---|---|
| Compute | Cloud Run **Job** (batch), parallelism 1 |
| Trigger | Cloud Scheduler, `0 9 * * *`, timezone `Asia/Kolkata` |
| Secrets | Secret Manager (API key; Google credentials unless workload identity) |
| Identity | Dedicated least-privilege service account |
| Logs / alerts | Cloud Logging (structured, redacted); Cloud Monitoring alerts on job failure and `SEND_UNCONFIRMED` |
| Image | Python 3.12 slim; `skills/` and `config/` baked in |
| Region | to decide (e.g. `asia-south1`) |

Environment variables of that design: `DELIVERY_MODE`, `GO_LIVE_DATE`, `RECIPIENT_ALLOWLIST`, `TARGET_DATE`, `ANTHROPIC_API_KEY`, `MODEL_*`, `SOURCE_SPREADSHEET_ID`, `SOURCE_WORKSHEET_NAME`, `TRACKING_*`, `GMAIL_SENDER_*`, `MESSAGE_ID_DOMAIN`, `GOOGLE_APPLICATION_CREDENTIALS`.

Release checklist: tests pass; evaluation 100% on safety cases; skill versions bumped; config reviewed; secrets only in Secret Manager; AD header and protected ranges in place; one manual `shadow` run before enabling the scheduler.

## 5. When to reconsider

Move some or all of this back into scope if Phase 1–5 show any of the following:

| Trigger | Likely alternative |
|---|---|
| Scheduled sessions cannot reliably reach the Google connectors (R-01) | Python job with Google APIs |
| Unattended Gmail sending is not possible through the connector (R-04) | Gmail API with domain-wide delegation |
| Instruction-level write limits are judged too weak (R-03) | Service account + protected ranges + code write guard |
| No reliable duplicate-safe send reconciliation (R-07) | Deterministic Message-ID via Gmail API |
| Claude plan usage limits are too tight for daily volume (R-09) | Anthropic API (pay per use) for the LLM stages only |
| Deterministic steps are unreliable without code (R-11) | Helper scripts (OD-38), or the full Python runtime |
| Overlapping runs or failure reporting cannot be controlled (R-08, R-10) | Cloud Run Job + Cloud Scheduler + Monitoring |

A hybrid is possible, e.g. keep the scheduled task for orchestration and the LLM work, and add a small helper for deterministic logic.
