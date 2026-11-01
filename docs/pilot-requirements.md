# Pilot requirements (C0, D-068)

Applies to pilot stages C1 and C2 (supervised, individually approved customer emails). C3 (capped automation) needs its own requirements and authorisation. Words: MUST is mandatory; every requirement is testable (see `docs/pilot-acceptance-criteria.md`).

## 1. Scope and authority
- R1. The pilot MUST NOT start without the user's explicit authorisation in chat for each stage. Every gate (`gmail_adapter_enabled`, `customer_sending_authorised`, `pilot.c1_authorised`, `pilot.c2_authorised`, `delivery_mode: live`) is closed until then; internal testing never authorises customer sending.
- R2. The Gmail connector is the only provider, sending as `supportcore@flexifunnels.com`; there is no fallback (D-066).
- R3. The source spreadsheet is read-only; writes go only to the destination spreadsheet through the write guard with `writes_enabled` open for the shortest possible time.
- R4. The 21-column draft schema and the 19-column Send Log do not change.

## 2. Selection and approval
- R5. Candidates come only from the deterministic pool (`docs/pilot-approval-and-selection.md`): PASSED and DRAFT_READY, exactly one valid recipient, medium or high confidence, not sensitive, not deferred (15453, 15454), not suppressed, not already in the Send Log.
- R6. C1 sends at most five emails, C2 at most fifteen more, only from an explicit send-key allowlist chosen by the user.
- R7. Every email is individually approved by a named approver after seeing the full review card. The approval is bound to the exact recipient and draft hash; any change invalidates it; there is no bulk approval.
- R8. Sensitive-topic, validation and recipient rules are never weakened; an approval does not override them.

## 3. Sending and verification
- R9. A durable `SEND_IN_PROGRESS` row is written and read back before each send. One send per email, no automatic retry; an uncertain outcome is reconciled or becomes `RECONCILIATION_REQUIRED` for a human.
- R10. After sending, the message is read back and `SENT` is recorded only if recipient (exact), actual From (`supportcore@flexifunnels.com`), subject, body and URLs verify. **A successful send, or a message ID, is not proof of delivery.**
- R11. Unique customer send keys; test sends use separate test keys; duplicates are prevented, including inside one batch.

## 4. URL handling (D-066, D-067)
- R12. The canonical Fathom URLs are those in the validated stored draft. They are never rewritten or re-stored; the draft hash is unaffected by wrapping.
- R13. Gmail rewrites URLs into `https://www.google.com/url?q=<original>&source=gmail&ust=<µs>&sa=E`. This exact shape is accepted; its destination MUST equal the canonical URL exactly, at the same position, with the same count.
- R14. Any unknown, malformed, nested or mismatched redirect, any other Google redirect form, and any non-matching destination MUST be rejected (the message goes to reconciliation, never to `SENT`).
- R15. Wrapper validity is not assumed: `ust` (about 24 hours after sending) is reported, and what a customer sees after it, and the Redirect Notice page, remain an **unverified, user-accepted risk** until checked.

## 5. Replies, opt-outs, suppression
- R16. Replies and bounces are checked by thread and sender (`docs/pilot-reply-monitoring.md`) by a named owner within the agreed time. The agent never replies, labels or deletes.
- R17. A confirmed opt-out is suppressed the same day; a suppressed address or domain is never sent to (`RECIPIENT_SUPPRESSED`). A complaint or two bounces pause the pilot.

## 6. Consent and data protection
- R18. The business confirms the consent checklist before C1 (`docs/pilot-consent-checklist.md`); the agent never assumes consent.
- R19. No customer name, address, transcript or recording URL is committed to git or written to logs or run summaries. Approvals and the suppression list live in git-ignored `local/`. Credentials are never printed, committed or requested in chat.

## 7. Reporting and stopping
- R20. After C1 and after C2 a pilot report is produced (`docs/pilot-report-template.md`) and the user decides whether to continue.
- R21. Stop immediately on: a wrong-recipient send, a URL mismatch, a missed duplicate, any `RECONCILIATION_REQUIRED` that is not resolved by a person, a complaint, two bounces, or a failed read-back.

## 8. Out of scope until separately authorised
Scheduling or unattended runs, C3, any change to skills or validation rules, changes to the source sheet, Brevo, and any other provider.
