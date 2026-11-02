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

### 2b. Business owner approval received and recorded (2026-11-02, D-074; supersedes the "reported only" note of D-073)
Saurabh Bhatnagar, Business Owner, approved proceeding on 2 Nov 2026 with a completed document (evidence link supplied, not opened by the agent; it replaces an earlier draft that contained "NA" answers). Line by line (`docs/business-confirmations-record.md`):
- **Confirmed:** service-only content, promotion prohibited (B1.1); exclusions rule (B1.4); one automated follow-up per call (B1.5); reply owner Support Team Flexifunnels, backup Support Core, twice-daily checks, one-business-day response, escalation to the Support Team Lead / Head of Support, pause authority the Business Owner and Support Team Lead, all replies handled by a human (B2.1 to B2.4, at team and role level, no individuals named); opt-out by reply, processed within one business day with immediate suppression when the agent identifies it, suppression-list owner the Support Team Lead (B3.1, B3.4); **approved opt-out wording** (B3.3); unauthenticated links approved conditionally, only links relevant to the receiving customer (B9.1); retention periods (drafts 90 days after the call, Send Log 12 months, approvals 12 months, transcripts 30 days after processing, confidence records 90 days) (B9.2); storage and access (B9.3).
- **Open, blocking C1:** Legal's validation and jurisdiction mapping before customer sending (B1.1a, B1.2); verifying recording notice and permission before a recording link is included, with no defined per-call mechanism (B1.3); reconciling all existing do-not-contact lists before pilot activation (B3.2); the user's permission for read-only mailbox access, which "immediate suppression when identified by the agent" also needs (B2.5).
- **Scope:** the document **does not authorise customer sending, scheduled execution or C1 to C3.** B5 (named approvers) was not provided.

### 2c. What the approval requires from engineering (not yet done, nothing authorised)
1. **Opt-out sentence.** The approved wording must appear in every customer email. That is a change to the writing and validation rules: `email-generation` adds the exact sentence once before the sign-off, `email-validation` checks it is present, exact and unchanged; a skill version bump, the regression suites and the focused cases re-run; the expected word counts change; the 7 stored drafts do not contain it, so they would be regenerated and re-validated (their draft hashes, confidence records and any approvals change). Needs the user's go-ahead because it changes the skills.
2. **Recording permission before a link (B1.3).** There is no signal in the sheet that a recording was made with notice or permission. A rule is needed (for example a per-jurisdiction business confirmation, or a source field) before a recording link may be included; until then this blocks C1.
3. **Agent-side opt-out detection and suppression (B3.1a, B2.5).** Needs read-only mailbox permission and the user's authorisation to create suppression entries; today the agent creates none.
4. **Retention enforcement (B9.2).** No purge exists: drafts and Send Log rows in the destination sheet (calls from 30 Oct reach 90 days on 28 Jan 2027), approval and confidence records in the local folder, and **customer transcript content that earlier Phase 3 sessions pulled into local Claude session logs and tool-result files (30 days after processing, so from about 30 Nov 2026)**. Needs an owner, a procedure and the user's decision; deleting destination rows is a guarded write.
5. **Storage wording (B9.3).** "Other explicitly approved storage" does not name the local `local/` folder (approvals, suppression list, confidence records) or the Claude session logs; the owner or user should name them as approved.
7. **Done without further authorisation (D-075):** per-email attestations. Every approval must now carry the approver's statement that recording permission was verified (B1.3) and that the recipient was checked against all do-not-contact lists (B3.2); an approval without both never counts. This applies the two owner conditions per pilot recipient; whether it satisfies "all lists reconciled before pilot activation" (B3.2) and "verify permission before including a link" (B1.3) is for the Business Owner to confirm. A one-jurisdiction brief for Legal is in `docs/legal-brief-c1-jurisdiction.md`.
6. **Per-customer frequency.** The owner set one email per call and no weekly cap; a customer with several calls can receive several emails. Recorded, not a blocker.

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
