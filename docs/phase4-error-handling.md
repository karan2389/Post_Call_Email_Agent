# Phase 4: error handling

Every row below is covered by `tests/unit/phase4-sender.test.js` (mocked Gmail and log) unless marked otherwise.

| Failure | Behaviour | Resulting state |
|---|---|---|
| Missing transcript, validation failure, sensitive topic, ineligible record | never reaches the sender (earlier pipeline stages; Phase 3) | not stored as sendable |
| Invalid recipient, empty subject/body, recipient does not match the source record | blocked by pre-send checks, nothing logged or sent | unchanged |
| Not live-authorised, `dry_run`/`shadow`, unapproved test recipient, pilot limit | blocked by pre-send checks | unchanged |
| Destination (`Sheet1`) write failure | the draft is not stored, so no send is possible (Phase 3 rule) | none |
| Send Log write fails before the send | no send; reported as a tracking failure | stays `READY_TO_SEND` |
| Gmail rejects the call definitively (no message created) | recorded with a retry count; no automatic retry; re-opening needs a named human and a reason; limit of 2 | `SEND_FAILED` |
| Timeout, error of unknown effect, success without message ID | outcome unknown; reconcile; never retry | `SEND_OUTCOME_UNKNOWN`, then `SENT` or `RECONCILIATION_REQUIRED` |
| Reconciliation search fails, finds nothing, finds several, or cannot verify the body | no retry; human decision (`resolveReconciliation`) | `RECONCILIATION_REQUIRED` |
| `SENT` event cannot be written after a confirmed send | the next run reconciles the open attempt and records `SENT`; no resend | log shows `SEND_IN_PROGRESS` until recovered |
| Duplicate execution (second run, manual rerun) | nothing sent; duplicate counted | `SENT` unchanged |
| Interrupted scheduled task | recovery reconciles open attempts first | `SENT` or `RECONCILIATION_REQUIRED` |
| One record throws or fails | contained; the other records continue; reported as an error for that record | per record |
| Overlapping runs, scheduler failures | **not implemented yet** (scheduling investigation pending) | n/a |