# What is needed to activate the C1 pilot

For review by the Business Owner (and Legal and the Support Team Lead where marked), then to be returned to the project owner. Prepared 2026-11-02. It contains no customer data and is not legal advice. **C1 = at most five customer emails, each approved individually by a named person before it is sent. Nothing is sent, scheduled or enabled by this document.** C2, C3 and any scheduled run are out of scope and need their own approval.

**Where things stand:** the Business Owner's approval of 2 Nov 2026 settled most business rules (`docs/business-confirmations-record.md`). Five items it left open still block C1, and several inputs and authorisations below are missing. Please answer in the "Your answer" lines.

---

## Part A. Needed from the Business Owner, Legal and the Support Team Lead

**A1. Legal validation for one jurisdiction first** *(Business Owner agrees scope; Legal validates)*
Your approval says Legal maps every country with active customers before customer sending. To let C1 start sooner, may C1 use customers from **one validated jurisdiction only**, with every other country excluded until Legal covers it? See `docs/legal-brief-c1-jurisdiction.md`.
- Agree to the narrower scope for C1 (yes / no): ______
- Jurisdiction chosen: ______   Validated by (Legal, name): ______   Date: ______   Written statement or link: ______
- Any condition Legal adds (for example a required sentence or address line): ______

**A2. Recording permission before a link is included** *(Business Owner)*
The agent cannot see whether a recording was made with notice or permission. For C1 each approver will state, per email, that the recording permission was verified before the link goes out.
- Does this per-email attestation satisfy your condition (yes / no, or what else is needed): ______
- Who may make this attestation (names): ______   How it is verified for a call (one sentence): ______

**A3. Existing do-not-contact lists** *(Business Owner and Support Team Lead)*
Your approval says all existing lists must be reconciled before pilot activation. For C1 each approver will state, per recipient, that the address was checked against all of them.
- List every existing company-level and customer-level suppression or do-not-contact list (name, system, owner): ______
- Does checking each C1 recipient against all of them satisfy "reconciled before pilot activation" (yes / no): ______

**A4. Named people** *(Support Team Lead)*
Your approval names teams and roles. Please give the people:
- Approver for each pilot email, and a backup (names and contacts): ______
- Support Team Lead / Head of Support (name): ______   Who checks replies twice each business day (names): ______
- Who may pause the pilot (names for the Business Owner and Support Team Lead): ______

**A5. Mailbox access and automatic suppression** *(Business Owner)*
"Immediate suppression when identified by the agent" needs the agent to read replies in `supportcore@flexifunnels.com`.
- Permit the agent to read the mailbox **read-only**, by thread and sender, to list replies, bounces and opt-outs; it never replies, labels or deletes (yes / no): ______
- Permit the agent to add an address to the suppression list as soon as it identifies an opt-out reply, before a person confirms (yes / no): ______   How a wrong suppression is undone and by whom: ______

**A6. Storage and retention** *(Business Owner / Support Team Lead)*
- Name as approved storage: the project's local `local/` folder on the project owner's machine (approvals, suppression list, confidence records) and the local Claude session logs (yes / no): ______
- Customer transcript content from earlier Phase 3 sessions sits in local session logs; your 30-day rule makes it due from about 30 Nov 2026. Who owns the cleanup (name): ______
- Who purges destination-sheet drafts older than 90 days and Send Log rows older than 12 months (name, and may the agent do it as a guarded write): ______

**A7. Email wording** *(Business Owner, with Legal if needed)*
- Confirm the approved opt-out sentence goes in **every** email as its own paragraph just before the sign-off, with nothing else added: ______
- Company identity or address line required (yes / no, wording): ______

**A8. Link behaviour accepted by the business** *(Business Owner)*
Gmail rewrites links to a Google address that shows a "Redirect Notice" page and carries an expiry of about 24 hours; behaviour after that is not verified.
- Accepted for C1 (yes / no): ______   If a customer reports a dead link, who handles it: ______

**A9. Pilot rules** *(Business Owner)*
- Agree: at most 5 emails; pause on any complaint, a wrong-recipient send, a URL mismatch, or two bounces; approvals expire the same day (yes / no, or changes): ______

---

## Part B. Needed from the project owner (Karan): separate written authorisations
Each is a distinct authorisation; none is implied by the others or by the owner's approval.
1. **Skill change:** allow me to add the approved opt-out sentence to `email-generation`, make `email-validation` enforce it (present once, exact), bump the skill versions, update the tests and re-run every regression suite. No customer data is read.
2. **Chosen calls:** name up to five calls (source rows) from the validated jurisdiction. Authorise me to read each transcript **one at a time**, analyse it, write its validated draft to the destination sheet through the write guard (the write gate open only for that write), and create its confidence record. This reads customer data and writes to the destination.
3. **Allowlist:** after I show the candidate pool, choose up to five send keys. I never create the allowlist.
4. **Mailbox permission** (same as A5) for read-only reply checks.
5. **Gates for the C1 window only:** authorise setting `gmail_adapter_enabled`, `customer_sending_authorised`, `pilot.c1_authorised` to true and `delivery_mode` to `live` for the supervised sends, with every gate closed again afterwards.
6. **The wrapped-link check (B6):** open one wrapped link from the earlier test email before and after about 2026-11-02 19:40 UTC and report what you see.

## Part C. What I will do once the inputs are back (in this order)
1. Record every answer above in `docs/business-confirmations-record.md` with name, date and evidence, and re-assess the blockers.
2. Implement the opt-out sentence in the skills, run the regressions, and show you the before and after.
3. Build the candidate pool read-only from the stored drafts and the confidence records, apply the exclusions (including the deferred calls 15453 and 15454), and show it to you.
4. After your allowlist: show each email as a review card (customer, recipient, call reference, subject, complete body, Fathom URL, validation, confidence, sensitivity, send key, draft hash).
5. For each email the named approver replies with `APPROVE C1 <send_key> <draft_hash> RECORDING_PERMISSION_VERIFIED DNC_LISTS_CHECKED`; I record it, recheck the hash, write the durable `SEND_IN_PROGRESS` row, send once, read the message back (recipient, actual From, subject, body, link destinations), and mark it sent only if all match. No retry; anything uncertain goes to a person.
6. Check replies and bounces read-only twice each business day, apply opt-outs, and pause on any stop condition.
7. After the fifth email, close the gates and write the pilot report (`docs/pilot-report-template.md`) for your decision on C2.

## Part D. Stays closed whatever you answer
Customer sending beyond the five approved emails, C2 and C3, scheduled or unattended runs, any provider other than Gmail, and any change to the source spreadsheet or the 21-column draft schema.

## Sign-off
Business Owner: ____________________   Date: ____________
Legal (for A1): ____________________   Date: ____________
Support Team Lead (for A3, A4, A6): ____________________   Date: ____________
