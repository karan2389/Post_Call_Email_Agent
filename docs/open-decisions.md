# Open Decisions

Every unresolved decision lives here with a recommendation. When one is decided: record it in `decisions/decision-log.md`, mark it **Resolved** here with the decision ID, and update `memory.md`.

"Blocks" = earliest phase that cannot complete without the decision.

## Data source

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-01 | Exact source sheet: spreadsheet, worksheet, column names, who/what fills it (manual, Zapier, Fathom export), how soon after a call the transcript appears | Share a synthetic copy of the real header row; document the upstream process | Phase 3 |
| OD-02 | Where generated Call IDs are stored: agent writes a `call_id` column in the source sheet (A), or upstream generates it (B) | **A**, with the column protected from manual edits | Phase 3 |
| OD-03 | Is a verified Fathom recording ID available (dedicated column, or confirmed URL pattern)? | Use a dedicated column if the upstream can provide it; otherwise generated IDs only | Phase 3 (non-blocking: falls back to generated IDs) |
| OD-04 | How is "shareable" determined without the Fathom API: (a) upstream `recording_shareable` column, (b) a confirmed share-link URL pattern, or (c) a Fathom workspace setting that makes all recordings viewable by link | (a) if upstream can provide it; otherwise (c) confirmed in writing plus (b) as a format check. Until decided, eligibility check E10 defers (`FATHOM_NOT_SHAREABLE`) | Phase 3 |
| OD-24 | ~~Discovery lookback~~ | **Resolved → D-018:** 2 days | — |
| OD-25 | ~~Wait window for late data~~ | **Resolved → D-019:** 1 day after the first deferral | — |
| OD-26 | Does the source sheet have (or can it get) a `call_status` column, and what are the exact values for cancelled and no-show? | Add `call_status` with `completed` / `cancelled` / `no_show`; transcript analysis remains the fallback for no-shows | Phase 3 |
| OD-28 | How call dates are stored in the sheet (date cells vs text, format, separate date/time columns) and the spreadsheet's timezone setting | Real date cells; spreadsheet timezone set to Asia/Kolkata; if text, ISO `YYYY-MM-DD HH:MM` | Phase 3 |

## Email content and behaviour

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-05 | Meaning of "from the customer's perspective" | Email written **to** the customer **from** FlexiFunnels support, framed around the customer's goals and next steps (current working assumption in all skills) | Phase 2 (assumption in place) |
| OD-06 | Sender identity: shared support mailbox vs agent's mailbox; display name; reply-to; CC the agent; reply in an existing thread or new email | Shared support mailbox, display name "<Agent first name> from FlexiFunnels Support", reply-to support address, no CC, new email | Phase 4 |
| OD-07 | Gmail authentication: Workspace service account with domain-wide delegation, or OAuth refresh token for one mailbox; scopes (`gmail.send` + `gmail.readonly` for reconciliation search; `gmail.metadata` does not support search queries) | Domain-wide delegation limited to the sender mailbox, if Workspace admin access exists | Phase 4 |
| OD-08 | Email language policy (English only, or match transcript, e.g. Hindi/Hinglish) | English only for MVP; non-English transcripts analysed but email in English, or skip with `LANGUAGE_UNSUPPORTED` if analysis confidence is low | Phase 2 |
| OD-09 | Format (plain text vs HTML), subject pattern, signature, length limits | Plain text; subject "Follow-up on your FlexiFunnels support call – <topic>"; 80–250 words; standard support signature | Phase 2 |
| OD-10 | Eligibility: eligible call types, minimum transcript length, maximum follow-up age for retries, opt-out column | Support/onboarding calls only; ≥ 600 characters; `max_followup_age_days = 7`; honour opt-out. (A "delay after call" is no longer needed: previous-day processing guarantees it.) | Phase 3 |
| OD-11 | Sensitive topics (refunds, billing disputes, legal threats, account security, cancellations): send, or skip for human follow-up? | Skip with `SENSITIVE_TOPIC_REQUIRES_HUMAN` in MVP | Phase 2 |
| OD-13 | On validation failure: skip immediately, or allow one regeneration with validator feedback? | Skip immediately in MVP; revisit after pilot data | Phase 2 |

## LLM

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-12 | Anthropic API access, company approval, data-retention terms, model ID per stage, budget | Obtain approval; choose models during Phase 2 evaluations; consider a smaller model for validation only if it passes all safety cases | Phase 2 |

## Delivery and reliability

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-14 | Retry policy: max attempts, backoff; whether a verified-absent `SEND_UNCONFIRMED` may auto-retry | 3 attempts; `SEND_UNCONFIRMED` always manual in MVP | Phase 4 |
| OD-15 | ~~Add `SENDING` state~~ | **Resolved → D-017:** yes | — |
| OD-16 | Does Gmail API preserve a client-supplied `Message-ID` header? (technical verification) | Verify in Phase 4 with a test mailbox; fallback is header-based Sent search | Phase 4 |
| OD-20 | Manual reprocess mechanism for `SKIPPED`/`FAILED` rows (e.g. operator sets a `reprocess` flag) | Add a `reprocess_requested` column in tracking, processed only for non-`SENT` rows | Phase 3 |

## Storage, privacy, operations

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-18 | `POST_CALL_EMAIL_LOGS` (and `POST_CALL_EMAIL_EVENTS`) in the same spreadsheet as the source, or a separate spreadsheet? *(Partly resolved: logs hold the final email body — D-014.)* | Separate spreadsheet, so access to email bodies can be restricted without affecting the source sheet | Phase 3 |
| OD-19 | Retention period for log data and email bodies; who can access `POST_CALL_EMAIL_LOGS` | Define with management; restrict to support leads | Phase 5 |
| OD-21 | ~~Python setup and repo location~~ — **Resolved → D-020:** Python 3.12 + `uv`; move the repo out of OneDrive. Still open: exact target folder, and remote Git hosting (recommend a private GitHub repo) | Choose a non-synced folder, e.g. `C:\dev\post-call-email-agent` | Phase 1 (folder); remote hosting before Phase 6 |
| OD-17 | Cloud Run Job vs Service; exact daily run time *(Partly resolved: once-daily previous-day processing — D-013)* | Cloud Run Job at 09:00 IST, so previous-evening transcripts have arrived and customers receive the email in the morning | Phase 6 |
| OD-27 | Add a second daily run (e.g. 15:00 IST) so transcripts that arrive late are picked up the same day instead of the next morning? Same code, same target date, idempotent | Optional; start with one run, add the second if pilot data shows many deferrals | Phase 6 |
| OD-22 | GCP project, region, billing, service accounts | Dedicated project; region decided with IT | Phase 6 |
| OD-23 | Alerting: who is notified of failures and how | Email/Chat alert to support lead on job failure or any `SEND_UNCONFIRMED` | Phase 6 |
