# Open Decisions

Every unresolved decision lives here with a recommendation. When one is decided: record it in `decisions/decision-log.md`, mark it **Resolved** here with the decision ID, and update `memory.md`.

"Blocks" = earliest phase that cannot complete without the decision.

## Data source

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-01 | ~~Exact source sheet and columns~~ — **Partly resolved (verified 2026-10-31, D-021):** spreadsheet, worksheet and column mapping in `source-sheet-profile.md`. Still open: **who/what fills `Transcript` and `AI Summary`**, and how soon after a call the transcript appears | Ask the CSC team / automation owner | Phase 3 |
| OD-02 | Call ID storage. Verified: the sheet has **no ID column**, and it is a shared team workbook. Options: (A) add an agent-owned `call_id` column after `AI Summary` (currently empty column AD), protected range — needs the workbook owner's approval; (B) derive the ID from the Fathom share token (`fathom-share:<token>`), stable once a URL is pasted, with rows that have no URL tracked only by date + email until a URL appears — not strictly immutable; (C) ask the existing automation to write an ID | **A** if the owner approves; otherwise B, accepting that rows without a recording never get a permanent ID (they never receive an email either) | Phase 3 |
| OD-03 | ~~Verified Fathom recording ID~~ — **Resolved (verified, D-021):** not available. URLs carry share tokens only; a share token is not a recording ID. Generated or share-token-based IDs only (OD-02) | — | — |
| OD-04 | Shareability. Verified: all recent `Recording URL` values are `https://fathom.video/share/<token>` links. Still unknown: can a customer open them without a Fathom login (workspace sharing setting)? | Confirm the Fathom workspace setting in writing (option c), then treat a valid `/share/` link as shareable. Until confirmed, E10 defers (`FATHOM_NOT_SHAREABLE`) | Phase 3 |
| OD-24 | ~~Discovery lookback~~ | **Resolved → D-018:** 2 days | — |
| OD-25 | ~~Wait window for late data~~ | **Resolved → D-019:** 1 day after the first deferral | — |
| OD-26 | Call outcome. Verified: no structured status — `Customer Not Came` (W) and `Cancel` (X) exist but are empty in all recent rows; outcome is free text in `Meeting Notes` ("customer not came", "Call cancel"). Use text patterns, or ask agents to fill W/X? | Short term: confirm the text patterns in `source-sheet-profile.md` §6. Better: agents mark W/X consistently. Transcript analysis stays as the fallback | Phase 3 |
| OD-28 | ~~Date storage and sheet timezone~~ — **Resolved (verified, D-021):** real date cells (`mmmm d, yyyy`) in `Date`, separate time cells in `Time of the call`, spreadsheet timezone `Asia/Calcutta` (= Asia/Kolkata) | — | — |
| OD-29 | Existing processes. Verified: an existing automation writes `Transcript` and `AI Summary` (e.g. "SKIPPED: no Fathom URL"), and a `Recording Sent` column (`No`/`yes`) suggests agents sometimes email recordings manually. (a) Who runs that automation, and does it retry when a URL is added later? (b) Will agents stop sending recordings manually once the agent is live, so customers don't get two emails? (c) Should the agent read `Recording Sent = yes` as "already emailed → skip"? | (a) Identify the owner. (b) Yes — agents stop manual sends at go-live. (c) Until then, treat `Recording Sent` = yes (any case) as a terminal skip with a new code `RECORDING_ALREADY_SENT` | Phase 3 |
| OD-30 | Should `Meeting Notes` (agent-written summary) be given to the LLM as extra context next to the transcript? | Yes, as secondary context marked "agent notes"; the transcript stays the source of truth, and conflicts lower confidence | Phase 2 |
| OD-31 | Recording URL anomalies. Verified: some cells hold **two** Fathom URLs; the same URL appears in **two different rows**. Policy? | Two URLs → defer as `INVALID_FATHOM_URL` until an agent fixes it. Same URL on rows for the same customer → `DUPLICATE_SOURCE_ROW`. Same URL on rows for different customers → skip both for human review | Phase 3 |
| OD-32 | Customer name normalisation. Verified: names in all caps, all lower case, repeated words (e.g. "X X"), single initials | Title-case the first token; collapse a repeated word; if the first token is a single letter or missing, greet with the full normalised name | Phase 2 |

## Email content and behaviour

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-05 | Meaning of "from the customer's perspective" | Email written **to** the customer **from** FlexiFunnels support, framed around the customer's goals and next steps (current working assumption in all skills) | Phase 2 (assumption in place) |
| OD-06 | Sender identity: shared support mailbox vs agent's mailbox; display name; reply-to; CC the agent; reply in an existing thread or new email | Shared support mailbox, display name "<Agent first name> from FlexiFunnels Support", reply-to support address, no CC, new email | Phase 4 |
| OD-07 | Gmail authentication: Workspace service account with domain-wide delegation, or OAuth refresh token for one mailbox; scopes (`gmail.send` + `gmail.readonly` for reconciliation search; `gmail.metadata` does not support search queries) | Domain-wide delegation limited to the sender mailbox, if Workspace admin access exists | Phase 4 |
| OD-08 | Email language policy (English only, or match transcript, e.g. Hindi/Hinglish). Verified: real transcripts include Hindi (Devanagari) passages | English only for MVP; non-English transcripts analysed but email in English, or skip with `LANGUAGE_UNSUPPORTED` if analysis confidence is low | Phase 2 |
| OD-09 | Format (plain text vs HTML), subject pattern, signature, length limits | Plain text; subject "Follow-up on your FlexiFunnels support call – <topic>"; 80–250 words; standard support signature | Phase 2 |
| OD-10 | Eligibility: eligible call types, minimum transcript length, maximum follow-up age for retries, opt-out column. Verified: the sheet has **no call-type or opt-out column** (closest: `Customer Type`), so E3/E4 are inactive | Support/onboarding calls only; ≥ 600 characters; `max_followup_age_days = 7`; honour opt-out. (A "delay after call" is no longer needed: previous-day processing guarantees it.) | Phase 3 |
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
| OD-21 | ~~Python setup and repo location~~ — **Resolved → D-020:** Python 3.12 + `uv`; repo moved to `C:\dev\post-call-email-agent`. Still open: remote Git hosting | Private GitHub repository | Before Phase 6 |
| OD-17 | Cloud Run Job vs Service; exact daily run time *(Partly resolved: once-daily previous-day processing — D-013)* | Cloud Run Job at 09:00 IST, so previous-evening transcripts have arrived and customers receive the email in the morning | Phase 6 |
| OD-27 | Add a second daily run (e.g. 15:00 IST) so transcripts that arrive late are picked up the same day instead of the next morning? Same code, same target date, idempotent | Optional; start with one run, add the second if pilot data shows many deferrals | Phase 6 |
| OD-22 | GCP project, region, billing, service accounts | Dedicated project; region decided with IT | Phase 6 |
| OD-23 | Alerting: who is notified of failures and how | Email/Chat alert to support lead on job failure or any `SEND_UNCONFIRMED` | Phase 6 |
