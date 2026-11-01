# Pilot report template (C1 / C2)

Copy this file to `docs/pilot-report-c1.md` (or `-c2`) when a stage ends. **No customer name, address, transcript or Fathom URL goes into this report**: use call references (source rows) and send keys only. Delete this instruction line.

- Stage: C1 / C2        Dates (IST): ____ to ____        Prepared by: ____        Reviewed by: ____
- Authorisations: `pilot.cN_authorised` set by ____ on ____; allowlist created by ____ on ____ (count ____, cap 5 / 15)

## 1. Summary
Emails sent / approved / blocked / failed: ____ / ____ / ____ / ____. Outcome: PASS / FAIL / PAUSED. Recommendation: ____.

## 2. Per-email record (one row per send key)
| Call ref | Send key | Approver | Approved at | Draft hash | Result (SENT / BLOCKED / FAILED / RECONCILIATION_REQUIRED) | Read-back: recipient / From / subject / body / URLs | Reply or bounce? | Notes |
|---|---|---|---|---|---|---|---|---|

## 3. Acceptance criteria
Tick each criterion from `docs/pilot-acceptance-criteria.md` with the evidence location: C1-1 ... C1-9.

## 4. Verification detail
- Wrapper behaviour for a real link: opens? Redirect Notice shown? destination correct? expiry (`ust`) observed? ____
- Any URL mismatch or rejected redirect: ____
- Any differences between the stored draft and the delivered text: ____

## 5. Replies, opt-outs, bounces
Counts: replies ____, opt-outs ____ (suppressed on ____), complaints ____, bounces ____, auto-replies ____. Time to first review: ____. Actions taken: ____.

## 6. Incidents and near-misses
Blocked sends and why (reason codes), reconciliation cases, duplicate attempts prevented, tooling errors: ____

## 7. Open risks, owners and next actions
| Risk or action | Owner | Due | Status |
|---|---|---|---|

## 8. Decision
The user authorises / does not authorise the next stage on ____ (quote the chat message or decision-log entry).
