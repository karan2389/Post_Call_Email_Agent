# Phase 4: idempotency and duplicate prevention

Draft de-duplication (Phase 3, fingerprint) and send de-duplication are separate problems. This page covers sending.

## Identity
- **Send key** = hash of the call's source fingerprint (date, time, email; D-036) and its recording-URL set. It is **per call, not per draft**.
- **Draft hash** = hash of recipient, subject and body. It identifies the exact text. **Body hash** is used to recognise our message in Sent.
- Because the send key does not depend on the draft, regenerating or editing a draft **cannot** create a second send. A changed draft after a send is blocked with `DRAFT_CHANGED_AFTER_SEND`.

## Rules (implemented in `src/lib/sendstate.js` and `src/lib/sender.js`, covered by tests)
1. Ten pre-send checks must all pass; any failure means no send and no state change.
2. The `SEND_IN_PROGRESS` event is durably written **before** the Gmail call. If the write fails: no send.
3. The text sent is exactly the stored, validated text (`buildSendRequest`: plain text, one recipient, no cc/bcc, HTML, attachments, signature or threading).
4. `SENT` only on a connector-confirmed message ID, or on reconciliation that finds exactly one matching sent message with the same body hash.
5. A timeout, a missing message ID, or any error that is not a definite "no message created" rejection is an **unknown outcome**: it is reconciled, never retried.
6. Repeated daily runs and manual reruns see `SENT` in the log and send nothing; the duplicate is counted in the daily summary.
7. An interrupted run is detected by an event log that ends in `SEND_IN_PROGRESS` or `SEND_OUTCOME_UNKNOWN`; the next run reconciles first and never resends.
8. A new send of an already sent call requires an explicit, auditable resend authorisation (named person, reason, bound to that draft hash) **and** a human re-opening of the record; it is never automatic.

## What this does not guarantee
The Gmail connector has no idempotency key and no custom headers. A crash between the connector's send and our `SENT` event is **detected** by reconciliation, not prevented. Reconciliation searches Sent by recipient, subject and date and verifies the body hash; a missing message is not proof that nothing was sent (indexing delay), so zero or several candidates go to a human (`RECONCILIATION_REQUIRED`). **This design is not exactly-once delivery.**