# Security and Privacy

Status: **Approved principles; adapted to the Claude Code scheduled-task architecture (D-026).** Retention periods and access lists are open (OD-19). The data-handling approval for the scheduled environment is OD-12.

## 1. Data inventory

| Data | Sensitivity | Lives in | Never in |
|---|---|---|---|
| Transcripts | High (customer conversation, may include account details) | Source Google Sheet; read into the scheduled Claude session at run time | Git, repository files, run summaries, `outputs/` (unless synthetic) |
| Customer name / email | Personal data | Source sheet, `POST_CALL_EMAIL_LOGS`, Gmail | Git, repository files, run summaries |
| Generated email body | Personal data | Gmail Sent; `POST_CALL_EMAIL_LOGS.email_body` (restricted access, OD-19) | Run summaries, Git |
| Fathom recording URLs (share tokens) | High — anyone with the link may be able to view the recording | Source sheet; `POST_CALL_EMAIL_LOGS.fathom_urls`; the customer's own email | Run summaries, Git, docs, any other customer's email |
| Zoom `Meeting URL` | Medium | Source sheet only (used during the run for row signatures) | Prompts for analysis, emails, logs |
| Call IDs, statuses, reason codes, counts | Low | Logs worksheets, source column AD, run summaries | — |
| Connector authorisations | Secret (OAuth grants held by Claude / Google) | Managed by the connector platform | Repository, docs, chat |

No API keys, service-account keys or `.env` secrets exist in the primary architecture.

## 2. Where customer data flows in the scheduled architecture

- Transcripts, names, emails and drafts pass through the **scheduled Claude session**. Where session history is stored, for how long and who can view it must be confirmed and approved by the company before real data is processed (R-12, OD-12).
- The connectors act as the **authorising Google user** (R-13): the sheet is edited as that user, and email is sent from that user's mailbox (OD-39).
- Repository files never contain real customer data. Only synthetic data goes in `tests/fixtures/` and `outputs/`.

## 3. Workspace rules

- The repository lives at `C:\dev\post-call-email-agent`, outside OneDrive (D-020). OneDrive sync can corrupt `.git` internals and sync files mid-write, and it uploads content to the cloud.
- A cloud scheduled task may need the repository on a remote Git host (OD-37, OD-21). That remote must be private, and it holds instructions only, never customer data.
- During development, large connector results may spill into local tool-result files under `~/.claude/projects/…`. Delete them after use; they contain real data.

## 4. Logging rules

- Run summaries and events carry: `run_id`, `target_date`, `call_id`, status, reason codes, counts.
- **Never** in run summaries, events or repository files: transcript text, email subject or body, customer name or email, Fathom or Zoom URLs, credentials.
- The `email_body`, `customer_*` and `fathom_urls` columns of `POST_CALL_EMAIL_LOGS` are the only places customer content is stored by the agent.

## 5. Model data handling

- The analysis stage gets only what it needs: transcript, customer first name, call metadata, recording count. The customer email address and Zoom link are not used in analysis.
- Internal columns (`Mistakes…`, `Bugs…`, `Suggetions…`) and `Phone` are never read into the session's analysis.
- Transcript content is untrusted: the runbook and skills treat it as data. Validation includes `INSTRUCTION_INJECTION_FOLLOWED`.

## 6. Access control

| Area | Rule | Enforcement |
|---|---|---|
| `Calls DONE` | Read; write only empty AD cells (`POST_CALL_CALL_ID`) | **Verified protected ranges only.** The runbook and pre/post-write checks are defence in depth, not enforcement. Connector permissions are per spreadsheet and act as the user; there is no code write guard in this architecture |
| Protected ranges (OD-36) | **Required and verified** before any real-sheet write: A–AC and AE+ protected from the connector's account | Effective **only** if the connector's Google account is not the owner and not an allowed editor of those ranges. If it is the owner, protection can only warn. A dedicated non-owner Google account for the connector is the likely route (R-03, R-13) |
| Draft destination spreadsheet (Phase 3, D-035) | Write for approved draft output only; holds real customer data | Inspect first, never assume headers or access; writes disabled until Phase 3 approval, OD-12 approval and inspection; limit access to named support leads (`phase3-draft-destination.md` section 8) |
| Logs worksheets | Read/write by the agent | Created only with approval (Phase 4) |
| Gmail | Search/read for reconciliation; drafts in `test`; send only in `live` | Runbook gates; whether unattended sending needs approval is R-04 |
| Forbidden tool uses | Row inserts, clears, formula or spreadsheet-property edits on the source; Gmail delete/trash/forward | Runbook (`architecture.md` §5) |

**Instructions and agent checks are not an enforcement mechanism.** The runbook, pre/post-write checks and forbidden-tool list reduce the chance of a mistake but cannot stop one. The original design's code guard (`future-alternatives.md` §1, §3) no longer exists. **The AD-only restriction is enforced only by actual Google Sheets protected-range permissions, and those must be verified** before the agent writes anything to the real source sheet:

1. Identify which Google account each connector uses (R-13).
2. Inspect the protected ranges on `Calls DONE` (view-only inspection by the sheet owner).
3. Confirm that the connector's account can edit AD but **cannot** edit A–AC or AE+ (e.g. attempt a harmless write to a protected cell on a **test copy** using that same account and confirm Google rejects it).
4. Record the result in `docs/scheduled-execution.md` (R-03). If the account is the owner, or an editor of the protected cells, protection does not bind it and the restriction is **not** enforced.

If enforcement cannot be verified, the real source sheet receives no writes at all (no AD header, no Call IDs) and the design must change (for example, Call IDs stored in `POST_CALL_EMAIL_LOGS` instead, which needs a new decision, or the service-account design in `future-alternatives.md`).

## 7. Email safety switches

- `delivery_mode: dry_run` by default in `config/run-settings.yaml`. `test` can only reach `recipient_allowlist` (internal addresses). `shadow` never emails anyone (D-022).
- `live` requires explicit go-live approval (ROADMAP Phase 6) and a `go_live_date`. Calls before that date are never auto-emailed.
- Rollback: set `shadow`; it takes effect from the next run.
- **Recording privacy:** an email may contain only the recording URLs from its own source row. A URL shared with another row is never sent (`RECORDING_URL_CONFLICT`). A malformed token blocks the whole email rather than sending a partial set.

## 8. Source sheet write safety (D-024)

- One-time AD1 header creation requires explicit user approval.
- Every Call ID write is a single-cell write to an empty AD cell, preceded and followed by a row-signature check (`call-id-strategy.md` §6). If the row match is ambiguous, nothing is written.
- No backfill of historical rows.
- Development and validation sessions must not write to the real source sheet. Write testing uses a test copy.

## 8a. Phase 3 read-only source and draft destination (D-035, proposed)

- In Phase 3 the source `Calls DONE` is read only and drafts go only to the dedicated draft spreadsheet; never to the source, never to the backup. Gmail is not connected or invoked and no scheduled task exists.
- Read-only on the source is a procedure unless the connector account has view-only access (R-03, R-15); this must be confirmed and recorded before Phase 3 writes anything.
- The draft spreadsheet will hold real customer names, emails, recording links and email bodies: restrict access, no link sharing, OD-12 approval first. Failed or unvalidated drafts are never stored as validated.

## 9. Version control

- `.gitignore` excludes `.env*`, key/credential files, `outputs/*`, `logs/*`, `data/`, CSV/XLSX exports.
- Review `git status` before every commit.
- If a secret is ever committed: rotate it immediately; rewriting history alone is not enough.
