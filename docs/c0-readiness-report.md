# C0 pilot readiness report (2026-11-02, D-068)

**Verdict: NOT READY for C1.** C0 preparation is complete on the engineering side; the blockers below are business confirmations and decisions. The customer pilot is not activated; every gate is closed.

## 1. What was done (preparation only)
| Area | Result | Where |
|---|---|---|
| Reply monitoring | Read-only investigation done; replies are readable through the Gmail connector; identification by thread and sender; opt-out and complaint handling designed | `docs/pilot-reply-monitoring.md` |
| Consent and communication | Checklist of 14 business confirmations, all open; no customer selected | `docs/pilot-consent-checklist.md` |
| Approval workflow | Review card with all required fields; approval bound to send key, recipient and draft hash; no bulk approval; tested | `docs/pilot-approval-and-selection.md`, `src/lib/pilot.js`, `src/lib/approval.js` |
| C1 selection | Deterministic candidate-pool rules and allowlist validation (max 5), 15453 and 15454 excluded; allowlist not created | same, `tests/unit/phase4-pilot.test.js` |
| Suppression | `RECIPIENT_SUPPRESSED` check in `preSendChecks` (address or domain), tested | `src/lib/sendstate.js` |
| Scheduling | Task Scheduler compared; not viable with current connectors; nothing created | `docs/pilot-scheduling-comparison.md` |
| Documents | Requirements, acceptance criteria, go-live checklist, report template | `docs/pilot-*.md`, `docs/go-live-checklist.md` |
| URL verification | D-067 wrapper validation preserved and documented in requirements R12 to R15 | `docs/pilot-requirements.md` |

No email, internal test, draft, sheet write, customer-record change, scheduled task, gate change or schema change occurred. All regression suites pass.

## 2. Outstanding blockers
| ID | Blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| B1 | Legal basis and consent for post-call follow-ups confirmed (checklist 1, 2, 3, 5, 8) | Business owner + legal | C1 | Open |
| B2 | Named reply owner, response time, escalation; confirm how `supportcore@` is monitored today (131 unread, no evidence of triage) | Support lead | C1 | Open |
| B3 | Opt-out and suppression process, list ownership, cross-check with existing opt-out lists; decide whether the email needs an opt-out sentence (text change goes through the skills) | Business owner | C1 | Open |
| B4 | Source of `overall_confidence` for stored drafts. **Decided and implemented 2026-11-02 (D-070, `docs/confidence-artifact.md`):** a git-ignored local record per draft, bound to the exact call, send key, draft hash, transcript hash and skill versions, with the level derived as min(declared, computed from evidence counts) and fail-closed verification. **Remaining:** no record exists yet; the 7 stored drafts have none and need their transcripts re-analysed (customer data, needs the user's explicit authorisation) | User + agent | C1 | Design DONE; records for the stored drafts OPEN |
| B5 | Named approver per email; the user chooses the allowlist from the pool (not created) | User | C1 | Open |
| B6 | Gmail wrapper behaviour for a customer: opens, Redirect Notice, expiry (`ust` of the D-067 message is about 2026-11-02 19:40 UTC) | User (open the link before and after) | C1 acceptance | Open, risk accepted in principle |
| B7 | `.env` was readable and modifiable by any local account (inherited ACL), and held a Brevo key that is no longer needed. **Resolved locally 2026-11-02 (D-069):** `.env` ACL restricted to the owner, Administrators and SYSTEM, and the Brevo key removed from `.env`. **Still open for the user: revoke the key manually in Brevo** (the agent must not access the Brevo account) | User | Security | **CLOSED**: local part done (D-069); the user confirmed in chat on 2026-11-02 that the key was revoked in Brevo (user-confirmed, not independently verifiable by the agent) |
| B8 | Scheduling: Task Scheduler cannot reach the connectors; desktop task unattended access untested; run time, failure watcher, approval to create a dry-run-only task | User | Before any automation, not C1 | Open |
| B9 | Fathom link sharing setting (public with the link?) and retention period | Support lead / DPO | C1 | Open |
| B10 | Authorisations to set `gmail_adapter_enabled`, `customer_sending_authorised`, `pilot.c1_authorised`, `delivery_mode: live` for C1 | User | C1 | Closed on purpose |
| B11 | Phase 3 leftovers (D-071, `docs/b11-phase3-leftovers.md`). **OD-10 resolved** (confirmed by the user) and **OD-32 resolved** (helper built and tested). **15453 and 15454:** transcripts still empty on 2026-11-02 (31 Oct calls, window until 7 Nov); they stay deferred and out of the pool; processing them needs your authorisation when the transcripts arrive. **Sensitive-topic path on real data:** you chose to wait for a natural case, so it stays unproven on real data (open, accepted). Still user-confirmed only: source read-only and destination sharing | User + agent | Go-live | Partly resolved; transcripts and real sensitive case open |
| B12 | The real customer send path has only been exercised by an internal test; first live use is C1 itself | Agent | C1 | Accepted, mitigated by individual approval |

## 2a. B1-B3 and B9: brief prepared (2026-11-02, D-072)
These are confirmations only people can give. A forwardable brief with specific questions, suggested positions and what the agent does is in `docs/business-confirmation-brief.md`; the dated record to fill is `docs/business-confirmations-record.md` (all 18 lines NOT CONFIRMED). The brief states three facts the business must know: Gmail wraps links with an expiring Redirect Notice, there is no unsubscribe link, and the Fathom links open without login. Nothing is answered, assumed or sent; the blockers stay open until the lines are filled.

### 2b. Business owner approval reported (2026-11-02, D-073)
The user reported that the business owner approved all the blockers. Recorded as **reported only**: no names, answers or evidence were supplied, so B1, B2, B3 and B9 stay open at line level (`docs/business-confirmations-record.md`) until the specifics are recorded. It does not cover B5, B6 (observation) or B8 (needs the user's own approval).

## 3. Other risks (no blocker)
- Gmail wrapper links expire (about 24 hours) and customers see a Redirect Notice page; accepted by the user, unverified.
- No idempotency key: sending is not exactly-once; reconciliation and human review cover it.
- A search display showed a different form of a recipient address than `get_message`; verification uses `get_message` only.
- `local/` approval and suppression files hold customer addresses and need care.

## 3a. B7 resolution evidence (2026-11-02, D-069)
- **Active runtime dependency on Brevo: none.** `sender.js`, `provider.js`, `gmail.js`, `urlcheck.js`, `approval.js`, `pilot.js`, `sendstate.js`, `sendlog.js` and `p3.js` never read the environment or `.env` and never reference Brevo (a test enforces this). Only the retired `src/lib/brevo.js`, `src/lib/env.js` and `src/brevo-check.js` and their tests reference the Brevo variables; `brevo-check --live` is refused (`PROVIDER_RETIRED`).
- **Before:** `.env` ACL = Administrators (F), SYSTEM (F), **Users (RX)**, **Authenticated Users (M)**, all inherited from `C:\`. Saved for rollback outside the repository.
- **After (`.env` only; the repository and parent folder were not touched):** `KARAN\karan` (M), Administrators (F), SYSTEM (F); inheritance disabled; no Users or Authenticated Users entry. Owner `KARAN\karan`; the current user can still open and read the file (checked by length, not content).
- **Brevo key:** the `BREVO_API_KEY` line was removed from the local `.env` (one assignment line, verified by variable names only). The two non-secret sender values remain and can be deleted. The `api_key_provisioned` flag is now false.
- **Secret scan before removal (booleans only):** the key appears in 0 of 938 working-tree files, 0 of 34 commits (3.6 MB of history), 0 of 458 session scratch files and 0 of 327 Claude transcript files. `.env` is ignored, untracked and unstaged; `.env.example` has no assignments (placeholders are commented out).
- **Revocation:** the user confirmed on 2026-11-02 that the key was revoked manually in Brevo. The agent cannot verify this (it never accesses the Brevo account and no key remains locally).

## 4. Gates (all closed, verified in config)
`delivery_mode: dry_run`, `customer_sending_authorised: false`, `internal_tests_authorised: false`, `gmail_adapter_enabled: false`, `pilot.c1/c2/c3_authorised: false`, `writes_enabled: false`, `scheduled_execution: false`, no scheduled task.

## 5. Next steps (each needs the user)
1. Resolve B1 to B3, B5 and B9 with the named business people; record dated confirmations.
2. Decide B4 (confidence source).
3. B7 is closed (`.env` secured, key removed, revocation confirmed by the user).
4. Optionally authorise a dry-run-only scheduling test (B8).
5. When ready, authorise C1 in writing: the agent will then build the pool read-only, present the pool, and wait for the allowlist and per-email approvals. **No C1 step happens before that.**
