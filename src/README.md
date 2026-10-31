# src/

No application code yet (Phase 0). Code starts in Phase 1 after approval.

## Planned package layout

```
src/post_call_agent/
├── __init__.py
├── main.py              Entry point: one run (fetch → recover → filter → eligibility → duplicates → process → summary)
├── config.py            Env + YAML loading; model IDs (never hardcoded); safety switches
├── models.py            Dataclasses: CallRecord, AnalysisResult, AnalysisItem, CustomerSummary,
│                        EmailDraft, ValidationResult, ValidationIssue, TrackingRecord, Event, RunSummary
├── timeutil.py          Injectable Clock, Asia/Kolkata now(), target-date calculation, ISO 8601 formatting
├── selection.py         Call-date parsing (serial/ISO), previous-day filter, lookback, work queue
├── identity.py          Call ID assignment, source fingerprint, URL normalisation
├── state.py             State machine: allowed transitions, leases, retry policy (pure logic)
├── eligibility.py       EligibilityChecker: ELIGIBLE / DEFER / SKIP, wait-window handling (no LLM)
├── duplicates.py        DuplicateChecker: Call ID, fingerprint, Fathom ID
├── skills_loader.py     Reads skills/*/SKILL.md, validates sections, builds prompts, versions
├── llm/
│   └── client.py        LlmClient interface + Anthropic implementation (structured JSON, retries)
├── pipeline/
│   ├── analyse.py       transcript-analysis skill
│   ├── summarise.py     customer-summary skill
│   ├── generate.py      email-generation skill
│   └── validate.py      deterministic checks + email-validation skill
├── sources/
│   └── sheets_source.py SourceSheetReader interface + Google Sheets implementation
├── tracking/
│   └── sheets_tracking.py TrackingStore interface + POST_CALL_EMAIL_LOGS / POST_CALL_EMAIL_EVENTS implementation
├── delivery/
│   ├── gmail_sender.py  GmailSender: build MIME, deterministic Message-ID, send
│   └── reconcile.py     GmailReconciler: rfc822msgid / header search
└── logging_setup.py     Structured JSON logging with redaction
```

Rules: see `CLAUDE.md` §5 and §8. External services sit behind interfaces so tests use fakes.
