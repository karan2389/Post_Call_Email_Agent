# Post-call follow-up emails: confirmations needed before the pilot (B1-B3, B9)

For: the business owner, legal or the data-protection lead, and the support lead. Prepared 2026-11-02. This brief contains no customer data and is not legal advice. Answers are recorded in `docs/business-confirmations-record.md` (dated, with the person's name). **Nothing is sent to any customer until these are answered and the pilot is separately authorised.**

## What the agent does
After a support call, the agent reads the call's transcript and writes one short follow-up email to the customer. A person approves **each** pilot email individually before it is sent. In the pilot: at most 5 emails first (C1), then up to 15 more (C2).

**What the email contains:** a greeting by first name; a short recap of what was discussed and done; any next steps either side agreed; the Fathom recording link(s) for that call; a sign-off by the support agent's first name. **It contains no offers, upsell, promotion or attachments.**

**How it is sent:** from `supportcore@flexifunnels.com` through Gmail, one email per call, one recipient. Replies arrive in that mailbox.

**Three facts the business should know (all observed in tests):**
1. **Links are wrapped by Google.** Gmail rewrites each link into a `google.com/url?...` address that first shows a "Redirect Notice" page and carries an expiry of about 24 hours; what happens to an old link after that is **not verified**. The destination is checked to equal the original Fathom link.
2. **There is no unsubscribe link or header.** The Gmail connector cannot add one. Opting out would be by replying.
3. **The Fathom links open without logging in** (confirmed earlier by the user): anyone who has the link can watch the whole recording.

## B1. Legal basis and consent
Questions for the business owner and legal:
1. Is a follow-up after a support call a **service message** (recap of help the customer asked for), or does any part count as marketing? We believe the content is service-only; please confirm.
2. In which countries do customers live, and which rules apply there (for example India DPDP, EU or UK GDPR and ePrivacy, US CAN-SPAM, Canada CASL)?
3. Are customers told on the call that it is **recorded**, and does the privacy notice cover recording and sharing a recording link by email?
4. Do any customers need to be **excluded** because of their country, contract or terms?
5. Is there a frequency limit (suggestion: one email per call, at most one per customer per week)?

*Suggested position, for legal to confirm or change:* treat the email as a service follow-up, send only to customers whose call took place with their knowledge of recording, apply the frequency limit, and exclude any group legal names.

## B2. Reply ownership for `supportcore@flexifunnels.com`
Observation: the mailbox currently has **131 unread** of 178 inbox messages, almost all automatic notifications; nothing shows that anyone triages it.
Questions for the support lead:
1. **Who** owns replies during the pilot (name and a backup)? Who answers a customer who replies?
2. **When** are replies checked (suggestion: every working day by 12:00 and before any weekend)? What is the **response target** (suggestion: one working day)?
3. Who decides to **pause** the pilot, and who is told the same day of a complaint, a legal or data-protection request, or a bounce?
4. Where does an urgent customer issue go if it arrives as a reply?
5. May the agent read the mailbox read-only (by thread and sender, never replying, labelling or deleting) to list replies for the owner?

*Suggested position:* one named owner and one backup, a daily check, the agent lists replies and bounces read-only, and only a person ever replies.

## B3. Opt-out and suppression
Questions for the business owner and support lead:
1. **How** does a customer opt out of these follow-ups (suggestion: reply "stop" or similar)? Who processes it, within how long (suggestion: same working day)?
2. Which **existing opt-out or do-not-contact lists** exist (CRM, newsletter tool, billing)? Who owns each, and may the pilot recipients be checked against them before every send?
3. Should the email carry a **one-line opt-out sentence** and a company identity or address line? (A wording change goes through the writing rules, not code.)
4. Who owns the **suppression list** the agent checks before every send (it is a local file; an opted-out address or domain is never contacted)?
5. How long are opt-outs kept (suggestion: permanently)?

*Suggested position:* opt-out by reply, processed the same working day by the reply owner, a one-line opt-out sentence added if legal agrees, and a check against existing do-not-contact lists before the pilot starts.

## B9. Fathom links and data retention
Questions for the support lead and the data-protection lead:
1. The links open without login. Is that **acceptable** for recordings sent to customers? Could a recording contain **other people's data** (other customers, screen shares)? Can sharing be restricted to named people or password-protected without breaking the customer's access?
2. What is the **retention period** for the agent's data: drafts and Send Log (in the destination sheet), approvals, suppression list, confidence records (local), and transcripts read during processing? Who may see them?
3. Where may these live (the destination sheet is shared with named support leads only; the local files stay on one machine)?

*Suggested position:* keep links as they are only if the business accepts that anyone with the link can watch; otherwise restrict sharing before the pilot. Keep Send Log and approvals for a period the data-protection lead sets (suggestion: no longer than needed for the audit, for example 12 months).

## What happens next
- Please answer each numbered question (a short "agree / change to ..." is enough) and name the owners. I will record them with date and name.
- C1 needs B1, B2, B3 and B9 answered, plus a named approver for every email (B5) and the user's written authorisation.
- Unanswered items stay blocking. Nothing in this brief changes any gate.
