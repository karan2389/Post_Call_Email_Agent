# Security and Privacy

Status: **Approved principles.** Retention periods and access lists are open (OD-19).

## 1. Data inventory

| Data | Sensitivity | Lives in | Never in |
|---|---|---|---|
| Transcripts | High (customer conversation, may include account details) | Source Google Sheet; sent to Anthropic API at runtime | Git, OneDrive workspace, logs, `outputs/` (unless synthetic) |
| Customer name / email | Personal data | Source + tracking sheets; Gmail | Git, OneDrive workspace, logs |
| Generated email body | Personal data | Gmail Sent; `POST_CALL_EMAIL_LOGS.email_body` (restricted access, OD-19) | Ordinary logs, Git, OneDrive |
| Credentials (Anthropic key, Google credentials) | Secret | Secret Manager (prod); local `.env`/key file **outside OneDrive** (dev) | Git, OneDrive, logs, docs, chat |
| Call IDs, statuses, reason codes, counts | Low | Tracking sheet, logs | — |

## 2. Workspace rules (OneDrive)

- The repository is inside OneDrive, which syncs to the cloud. Treat everything in it as potentially shared.
- Only synthetic data in `tests/fixtures/` and `outputs/`.
- Local credential files, when they exist (Phase 3+), must be stored **outside** the OneDrive folder and referenced by path in `.env`.
- Consider moving the Git repository out of OneDrive: OneDrive sync can corrupt `.git` internals and sync files mid-write (OD-21).

## 3. Logging rules

- Structured (JSON) logs with: `run_id`, `call_id`, `status`, `reason_code`, counts, durations, Gmail message ID.
- **Never log:** transcript text, email subject or body, customer name, customer email, LLM prompts or raw responses, credentials, tokens.
- Exceptions are logged with sanitised messages; API error bodies are truncated and scrubbed of email addresses.
- Debug mode that logs content is permitted only with synthetic data and only locally.

## 4. LLM data handling

- Only the minimum data is sent to the Anthropic API: transcript, first name, call metadata needed for context. Customer email address is not sent to the model (the code inserts recipient details).
- Data retention terms of the Anthropic account must be reviewed and approved by the company before real data is used (OD-12).
- Transcript content is untrusted: prompts wrap it in tags and instruct the model to treat it as data. Validation includes `INSTRUCTION_INJECTION_FOLLOWED`.

## 5. Access control (production)

- Dedicated service account for the Cloud Run job, least privilege:
  - Sheets: read the source sheet, write only the `call_id` column (enforced by protected ranges where possible) and the tracking worksheets.
  - Gmail: send, plus read/search for reconciliation, on the sender mailbox only (scope choice OD-07).
  - Secret Manager: accessor on the specific secrets only.
- No human user credentials in production.

## 6. Email safety switches

- `DRY_RUN=true` by default in every non-production environment.
- `RECIPIENT_ALLOWLIST` enforced in test and pilot environments.
- Production auto-send requires explicit go-live approval (ROADMAP Phase 7).

## 7. Version control

- `.gitignore` excludes `.env*` (except `.env.example`), key/credential files, `outputs/*`, `logs/*`, `data/`, CSV/XLSX exports.
- Before each commit: `git status` review; never `git add -A` blindly once real integrations exist.
- If a secret is ever committed: rotate it immediately; rewriting history is not sufficient on its own.
