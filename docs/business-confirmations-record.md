# Business confirmations record (B1-B3, B9)

One dated line per confirmation. The agent records only what the approval document says and never fills a line on anyone's behalf. Questions: `docs/business-confirmation-brief.md`. Wider checklist: `docs/pilot-consent-checklist.md`.

Status words: **CONFIRMED** (a clear answer that settles the question), **CONDITION** (answered, with a stated condition that is still to be met), **OPEN** (not answered, or the document makes it a future task).

## Source document (recorded 2026-11-02; this version replaces an earlier draft that contained "NA" answers)
- **Approver:** Saurabh Bhatnagar, Business Owner. **Date on the document:** 2 Nov 2026.
- **Evidence location:** `https://screenrec.com/share/jRobpSDzn5` (given with the approval; the agent has not opened it and cannot verify it).
- **Scope stated in the document:** it confirms only the decisions completed in it and **does not authorise customer email sending, scheduled execution, or C1, C2 or C3 activation.** The user's own written authorisation is still required for each.

## B1. Legal basis and consent
| # | Question | Answer (from the document) | Status |
|---|---|---|---|
| B1.1 | Service message, content stays service-only | Purpose: service-related post-call follow-up only; promotional content strictly prohibited | **CONFIRMED** |
| B1.1a | Legal basis | Existing customer or support relationship and the applicable service-communication basis, **subject to legal validation for each jurisdiction** | **CONDITION** (legal validation pending) |
| B1.2 | Customer countries and applicable rules | All countries with active customers must be documented; **Legal must map the applicable requirements before customer sending is enabled** | **OPEN** (task for Legal; blocks C1) |
| B1.3 | Recording notice and permission to share links | Notice must be given before recording; **the applicable recording permission or consent must be verified before a recording link is included** | **OPEN** (how it is verified per call is not defined; blocks C1) |
| B1.4 | Customer exclusions | No-shows, cancelled calls, opted-out customers, invalid recipients, and calls flagged for sensitive-topic review are excluded or routed to human review | **CONFIRMED** (matches the skip, suppression, validation and sensitive-topic rules already built) |
| B1.5 | Frequency limit | Maximum one automated follow-up per call; no repeated automated reminders unless separately approved | **CONFIRMED** (per call only; no per-customer weekly cap was set) |

## B2. Reply ownership
| # | Question | Answer | Status |
|---|---|---|---|
| B2.1 | Reply owner and backup | Primary "Support Team Flexifunnels"; backup "Support Core" (a team and a mailbox or team name, not named individuals) | **CONFIRMED** at team level; no individual is named |
| B2.2 | Check times and response target | Monitoring twice every business day; response within one business day | **CONFIRMED** |
| B2.3 | Escalation and pause authority | Escalation: Support Team Lead / Head of Support. Pilot pause: Business Owner and Support Team Lead | **CONFIRMED** (by role; names not recorded) |
| B2.4 | Reply handling | All customer replies reviewed and handled by a human | **CONFIRMED** |
| B2.5 | Agent may read the mailbox read-only to list replies | Not addressed | **OPEN** (needs the user's explicit permission; also needed for B3 "immediate suppression when identified by the agent") |

## B3. Opt-out and suppression
| # | Question | Answer | Status |
|---|---|---|---|
| B3.1 | Opt-out method | The customer replies asking for no further automated post-call follow-ups | **CONFIRMED** |
| B3.1a | Processing owner and deadline | Support Team Flexifunnels; backup Support Core; within one business day; **immediate suppression when identified by the agent** | **CONFIRMED** (agent-side identification and suppression need B2.5 and the user's authorisation) |
| B3.2 | Existing do-not-contact lists | All existing company-level and applicable customer-level suppression lists **must be reconciled before pilot activation** | **OPEN** (which lists, who reconciles, how; blocks C1) |
| B3.3 | Opt-out wording | Approved wording: "If you prefer not to receive further automated post-call follow-up emails, please reply to this email and let us know." | **CONFIRMED** (requires an email wording change, see the C0 report) |
| B3.4 | Suppression-list owner and retention | Owner: Support Team Lead. Retention: as long as needed to honour the request, subject to retention and legal requirements | **CONFIRMED** |

## B9. Fathom links and retention
| # | Question | Answer | Status |
|---|---|---|---|
| B9.1 | Unauthenticated recording links | "Yes, conditionally approved"; privacy restrictions: Yes; **only links relevant to the customer receiving the email are shared** | **CONFIRMED** with that condition (the earlier ambiguity is resolved by the explicit condition) |
| B9.2 | Retention | Drafts 90 days after the call; Send Log 12 months after sending; approval records 12 months after approval; transcripts 30 days after processing; confidence records 90 days after the call | **CONFIRMED** (no purge mechanism exists yet, see the C0 report) |
| B9.3 | Storage and access | Phase 3 Emails and other explicitly approved, access-restricted project storage; named, authorised CSC support personnel only; no public spreadsheet access or unrestricted sharing | **CONFIRMED** (the local folder and Claude session logs are not explicitly named as approved storage) |

## C1 activation answers (recorded 2026-11-02, from the returned `docs/c1-activation-requirements.md`)
Returned by the project owner in chat as the filled form. **The sign-off block (Business Owner, Legal, Support Team Lead) was not returned signed, and no Legal name, date or written statement was supplied.** Answers are recorded as given.
| # | Answer | Status |
|---|---|---|
| A1 | Agrees to the narrower scope: **India only**; every other jurisdiction excluded until Legal completes its review. No Legal validator, date or statement given | **CONDITION**: scope agreed; Legal validation for India not evidenced (B1.1a, B1.2 still open) |
| A2 | Per-email attestation satisfies the condition. Attester: the named approver for that email, who must have access to the recording and can verify notice and permission against company recording policy | **CONFIRMED** |
| A3 | Per-recipient check satisfies "reconciled": yes. **The lists themselves are "not yet established"** | **OPEN**: the approver cannot attest against lists nobody has named |
| A4 | Names given: Karan, Jai, Yogesh. Approver: Yogesh. Support Team Lead: Jai. Reply checker: Karan. Who may pause: blank. "Karan and Jai" is not tied to a role; no backup approver; no contacts | **PARTIAL**: approver, lead and reply checker named; pause names and backup missing |
| A5 | Mailbox read-only: yes. Agent may suppress on identifying an opt-out before a person confirms: yes. Undo: Support Team Lead or an authorised backup after review; the agent never removes an entry itself | **CONFIRMED** |
| A6 | `local/` and Claude session logs named as approved storage: yes. Cleanup owner: Karan, with Support Team Lead oversight. Destination and Send Log purge: Karan; whether the agent may do it as a guarded write was not stated | **CONFIRMED** (agent purge permission not given) |
| A7 | Opt-out sentence in every email, no company or address line. **Wording given differs by one word from B3.3 ("simply reply" here, "please reply" in B3.3)** | **CONFIRMED** pending the wording choice below |
| A8 | "YES" appears on the line that asks who handles dead links; acceptance is read as yes, **the handler is not named** | **PARTIAL** |
| A9 | Agrees; **"at most 10 emails"**. The document and the code cap C1 at 5 | **CONFLICT**: C1 stays 5 unless the owner confirms in writing that C1 is 10 (code cap, tests and docs would change) |

**Resolved by the project owner in chat, 2026-11-02:** C1 cap is **5** (not 10); opt-out wording is **"simply reply"** (A7 text), which supersedes the "please reply" wording of B3.3. Implemented as email-generation 1.7.0 and email-validation 1.6.0 (D-076). The Business Owner has not separately confirmed either point in writing.

**Authorisations from the project owner (Part B table):** skill change YES; read chosen call transcripts YES; write validated drafts YES; create confidence records YES; build candidate pool YES (read-only); create allowlist **No** (the user chooses); read-only mailbox YES, separately granted; live Gmail sending YES; enable C1 gates YES; scheduled execution not yet. **No call was named**, so no transcript has been read, and the gates stay closed until the blockers above are met.

## Effect on C1 (rule: B1, B2, B3 and B9 confirmed)
- **Settled:** B1.1, B1.4, B1.5, all of B2 except B2.5, B3.1, B3.3, B3.4, all of B9.
- **Still blocking C1:** B1.1a and B1.2 (Legal's jurisdiction mapping and validation), B1.3 (recording notice and permission verification), B3.2 (do-not-contact reconciliation), B2.5 (mailbox read access).
- **Engineering follow-ups from the approval:** the opt-out sentence must be added to the email (writing and validation rules, regression, regeneration of drafts); retention enforcement; explicit approval of local storage (see the C0 report).
- **Not provided:** B5, the named approver for each pilot email.
