# C1/C2 approval workflow and customer selection design (C0, D-068)

Design plus tested helpers (`src/lib/pilot.js`, `src/lib/approval.js`, `tests/unit/phase4-pilot.test.js`, `tests/unit/phase4-gmail-only.test.js`). **No allowlist exists, no customer is selected, no approval has been created, and every gate is closed.**

## 1. Selection rules (deterministic: `candidatePool`)
A stored draft enters the **candidate pool** only if all of these hold; every other record is excluded with a reason code:
| Rule | Exclusion code |
|---|---|
| Validation `PASSED` and processing `DRAFT_READY` | `VALIDATION_NOT_PASSED`, `NOT_DRAFT_READY` |
| Exactly one valid recipient in the cell (no list, no extra text) | `RECIPIENT_MISSING`, `RECIPIENT_NOT_SINGLE_ADDRESS`, `RECIPIENT_INVALID` |
| `overall_confidence` is medium or high | `CONFIDENCE_TOO_LOW`, `CONFIDENCE_NOT_AVAILABLE` |
| Sensitive status is explicitly "no" (sensitive topics go to REVIEW_REQUIRED, OD-11) | `SENSITIVE_TOPIC`, `SENSITIVE_STATUS_NOT_AVAILABLE` |
| Not a deferred call (source rows 15453 and 15454) | `DEFERRED_CALL` |
| Subject, body and at least one Fathom URL present; a source fingerprint exists | `DRAFT_TEXT_MISSING`, `NO_RECORDING_URL`, `NO_SOURCE_FINGERPRINT` |
| Not a synthetic address | `SYNTHETIC_RECIPIENT` |
| Not suppressed (address or domain) | `RECIPIENT_SUPPRESSED` |
| Not already in the Send Log | `ALREADY_IN_SEND_LOG` |

The pool is sorted by call date, time and source row, so the same input always gives the same output. **The pool is not a selection**: the user chooses from it.

**Allowlist (not created):** an explicit list of send keys chosen by the user. `validateAllowlist` accepts it only if it has at most five keys for C1 (fifteen for C2), no duplicates, no test keys, and every key is in the pool.

**Confidence (blocker B4, resolved by design in D-070):** `overall_confidence` is not in the 21-column draft schema, which must not change. The pool reads confidence only from a verified **local confidence record** bound to the exact call, send key, draft hash, transcript hash and skill versions (`docs/confidence-artifact.md`); the level is `min(declared, computed from evidence)`, and any missing, stale, tampered, inconsistent or conflicting record excludes the draft. The 7 drafts stored earlier have no record yet, so they are excluded until their transcripts are re-analysed (needs the user's authorisation). Sensitive status is encoded by the stored status (a sensitive call is `REVIEW_REQUIRED`, so `DRAFT_READY` means not flagged).

## 2. Approval workflow (one email at a time)
1. **Preconditions:** the consent checklist items required for C1 are confirmed; `pilot.c1_authorised` is set to true by the user's explicit authorisation; the allowlist exists and validates.
2. **Review card (`approvalCard` / `renderCard`)**, one message per email, never a table of many: customer name, recipient, call reference (source row, date, time), subject, **complete body**, Fathom URL(s), validation status, confidence and generation mode, sensitive-topic status, unique send key, draft content hash, and whether the card is approvable.
3. **Approver action:** the named approver replies in chat with the exact binding and both attestations, for example `APPROVE C1 <send_key> <draft_hash> RECORDING_PERMISSION_VERIFIED DNC_LISTS_CHECKED` (D-075). The two tokens mean the approver states, for **this** recipient, that the recording permission was verified before the link is included (B1.3) and that the recipient was checked against all existing do-not-contact lists (B3.2). Anything else (for example "approve all", "ok", a different hash, a missing token) is not an approval, and a stored approval without both attestations never counts (`APPROVAL_ATTESTATION_MISSING`).
4. **Recording:** the agent recomputes the hash from the stored draft, checks the statement matches, and writes one approval record `{send_key, recipient, draft_hash, stage, approved_by, approved_at, expires_at}` to the git-ignored `local/pilot-approvals.json`. Recommended: `expires_at` the same day.
5. **Before sending:** `preSendChecks` recomputes the hash from the stored draft **again**. Any change to recipient, subject or body gives `APPROVAL_DRAFT_CHANGED` or `APPROVAL_RECIPIENT_MISMATCH`; the old approval never carries over; the card is shown again.
6. **Revocation:** `REVOKE <send_key>` marks the approval revoked (`APPROVAL_REVOKED`).
7. **Send:** one email, durable `SEND_IN_PROGRESS` first, then read-back verification (recipient, actual From, subject, body, URL destinations) before `SENT`.
8. **No bulk approval:** no function accepts a list; approvals are per send key; stage caps (C1 5, C2 15 more) and `pilot.cN_authorised` apply; C3 has no code path.
9. **Review:** after C1 the pilot report (`docs/pilot-report-template.md`) is completed and the user decides on C2.

Suppression and sensitive-topic rules are checked in addition to approval; an approval never overrides them.
