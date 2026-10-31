# tests/fixtures/

Synthetic test data only. Fixture files are created in Phase 1, one per evaluation case in `tests/evals/README.md`.

## Rules

- Names: obviously fictional (e.g. "Arjun Testwala", "Riya Demo"). No real customers; real staff names only with approval.
- Emails: `@example.com` / `@example.org` only (reserved domains).
- Fathom URLs: `https://fathom.video/share/EXAMPLE-<case-id>` style — clearly fake tokens.
- Companies, domains, order numbers: invented (`testfunnel.example`).
- No real transcripts, even anonymised.
- No passwords, card numbers or keys — when a case needs one, use an obviously fake value (`sk-FAKE-0000`) to test redaction.

## Planned file format (one per case)

```
fixtures/EV-05/
├── metadata.json        call_id, customer_name, customer_email, fathom_url, call_datetime, support_agent_name, call_type
├── transcript.txt       synthetic transcript
├── expected.json        expected status, reason code, item categories, must/must-not include
└── adversarial/         (optional) deliberately flawed drafts the validator must reject
```
