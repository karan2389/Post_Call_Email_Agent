# Pilot acceptance criteria (C0, D-068)

A stage passes only if **every** criterion is met with evidence recorded in the pilot report. Nothing is counted as passed because a send succeeded.

## C0: pilot readiness (preparation only)
| # | Criterion | Evidence |
|---|---|---|
| C0-1 | Reply monitoring investigated, read-only; reply owner, response time and escalation named by the business | `docs/pilot-reply-monitoring.md`, named owner |
| C0-2 | Consent checklist items required for C1 confirmed in writing by the business | `docs/pilot-consent-checklist.md` dated lines |
| C0-3 | Approval workflow, selection rules and review card implemented and tested | `tests/unit/phase4-pilot.test.js`, `phase4-gmail-only.test.js` |
| C0-4 | Confidence source for stored drafts decided (blocker B4) | Decision in the decision log |
| C0-5 | All regression suites pass; all gates closed; git synchronised | Test output, config, `git status` |
| C0-6 | Open risks listed with owners | `docs/c0-readiness-report.md` |

## C1: five individually approved emails
| # | Criterion | Evidence |
|---|---|---|
| C1-1 | At most five emails, all from the user's allowlist, each from the candidate pool | Allowlist validation, Send Log |
| C1-2 | Each email has a stored approval bound to its exact recipient and draft hash; no approval reused after an edit | Approval records, pre-send results |
| C1-3 | Every send has `SEND_IN_PROGRESS` written and read back before sending | Send Log order |
| C1-4 | Every email is `SENT` only after read-back: recipient exact, From `supportcore@flexifunnels.com`, subject and body match, URL destinations equal the canonical Fathom URLs | Per-email verification result |
| C1-5 | Zero duplicates, zero wrong recipients, zero sends of sensitive, failed or unvalidated drafts | Send Log reconciliation |
| C1-6 | Zero unresolved `RECONCILIATION_REQUIRED`; no automatic retry occurred | Send Log |
| C1-7 | Replies and bounces checked by thread and sender within the agreed time; any opt-out suppressed the same day; no unresolved complaint | Reply report |
| C1-8 | Wrapper behaviour observed for at least one real link (opens, Redirect Notice, expiry) and recorded | Pilot report |
| C1-9 | The user reviews the report and authorises C2 in writing | Chat record |

## C2: up to fifteen more emails
Same criteria as C1, applied to each email, plus: the C1 review actions are closed; cumulative sends do not exceed 20; no customer complaint attributable to content or links; suppression list checked before every send.

## C3: capped automation (not designed)
Not authorised. Requires its own requirements, acceptance criteria, scheduling decision, failure reporting and the user's explicit final authorisation.

## Stop conditions (any stage)
A wrong-recipient send, URL mismatch, duplicate, failed read-back, unresolved reconciliation, complaint, two bounces, or a security finding stops the stage and returns it to the user.
