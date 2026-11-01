# Go-live checklist (C0, D-068)

**Current status: nothing is live. Every item below is unchecked unless marked with evidence.** Go-live (Stage D, automatic delivery) needs the user's explicit final authorisation after C1 and C2, and a separate decision on scheduling. The agent never activates any of this on its own.

Legend: [x] done with evidence, [ ] open. Owner in brackets.

## A. Engineering (agent)
- [x] Write guard, send state machine, Send Log, idempotency, durable `SEND_IN_PROGRESS` (D-048 to D-055)
- [x] Gmail the only provider, no fallback; Brevo retired (D-066)
- [x] Strict Gmail-wrapper URL verification; read-back verification before `SENT` (D-066, D-067 real test)
- [x] Approvals bound to recipient and draft hash; stage caps; suppression check (D-066, D-068)
- [x] Candidate-pool and allowlist validation helpers (D-068)
- [x] Confidence source decided and implemented: verified local confidence record, fail closed (D-070, blocker B4)
- [ ] Confidence records exist for the drafts that will be considered for C1 (needs re-analysis of the stored drafts' transcripts, user authorisation)
- [ ] Run lock and failure summary (design only, `docs/pilot-scheduling-comparison.md`)

## B. Business confirmations (user, support lead, legal)
- [ ] Consent checklist confirmed (`docs/pilot-consent-checklist.md`)
- [ ] Reply owner, response time, escalation named
- [ ] Opt-out and suppression process and owner; cross-check with existing opt-out lists
- [ ] Approver named for each pilot email
- [ ] Fathom link sharing setting understood; retention period decided

## C. Security
- [ ] Source spreadsheet read-only enforced by Google permissions (today only user-confirmed)
- [ ] Destination sharing verified independently (today user-confirmed)
- [x] `.env` ACL restricted and the unused Brevo key removed locally (D-069, blocker B7)
- [x] Brevo API key revoked in Brevo (user-confirmed in chat 2026-11-02; not independently verifiable)
- [ ] Sensitive-topic path tested on real data (OD-11)

## D. Pilot
- [ ] C1: five emails individually approved, sent, verified, reviewed (criteria in `docs/pilot-acceptance-criteria.md`)
- [ ] Wrapper behaviour observed on a real customer-style link (opens, Redirect Notice, expiry)
- [ ] C1 report approved by the user; C2 authorised
- [ ] C2: up to fifteen more, verified, reviewed
- [ ] Pilot report (`docs/pilot-report-template.md`) completed and signed off

## E. Scheduling and operations
- [ ] Unattended connector access proven by a dry-run-only task (user approval needed)
- [ ] Schedule time decided (12:00 IST proposed); failure reporting and watcher named
- [ ] Missed-run and overlap behaviour tested

## F. Final authorisation (user only)
- [ ] `customer_sending_authorised` set true by the user after C2
- [ ] `go_live_date` set; first automatic day supervised
- [ ] Rollback understood: set `customer_sending_authorised` to false; no sends continue
