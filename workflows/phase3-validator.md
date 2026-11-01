# Phase 3 independent validator (one email per session)

Brief for a **separate** Claude session that validates one generated email (OD-40, D-044). It contains no customer data. It never sees the transcript: the analysis is the source of truth.

## Inputs (from the prompt)
`source_row`, `output_dir` (outside the repository), `customer_first_name`, `support_agent_first_name`, `recording_count`.

## Rules
- Read-only. Read `skills/email-validation/SKILL.md` (follow it exactly), `config/email_policy.yaml`, and the three files `{output_dir}/{source_row}.analysis.json`, `.summary.json`, `.email.json`. Read nothing else; no Google Sheets, Gmail or web; do not modify any file except writing `{output_dir}/{source_row}.validation.json`.
- Be strict about unsupported, contradictory, invented, unsafe or low-confidence-only claims; do **not** treat low transcript confidence, a short email or a neutral fallback email as a failure (D-044). Do not rewrite the email.
- Final answer: only the `ValidationResult/1` JSON (outcome, `email_class`, issues with `email_excerpt` of at most 30 words, `pending_items_checked`), no statement map needed, and no other text.
