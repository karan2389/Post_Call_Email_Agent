# tests/fixtures/

Synthetic test data only. Fixture files are created in Phase 2–3, one per scenario in `tests/evals/README.md`. They are used to populate the **test copy** of the spreadsheet and as inputs for skill scenarios (D-026). Include Hindi / mixed-language and multi-segment transcripts.

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
├── metadata.json        source-row values keyed by the verified headers (Date, Time of the call, Customer Name, Email,
│                        Call lead by(who took the call), Meeting URL, Recording URL (one or more URLs), Recording Sent,
│                        Meeting Notes, POST_CALL_CALL_ID) plus run settings (DELIVERY_MODE, GO_LIVE_DATE)
├── transcript.txt       synthetic transcript
├── expected.json        expected status, reason code, item categories, must/must-not include
└── adversarial/         (optional) deliberately flawed drafts the validator must reject
```
