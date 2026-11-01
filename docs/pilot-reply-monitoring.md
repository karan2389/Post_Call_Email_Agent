# Pilot reply monitoring (C0, D-068)

Read-only investigation of `supportcore@flexifunnels.com` through the connected Gmail connector on 2026-11-02. Only `list_labels`, `search_threads` (ids and metadata) and `get_message` on our own test message were used. No message body of any other mail was read, nothing was sent, labelled, drafted or replied to.

## 1. What the connector can see
| Question | Finding |
|---|---|
| Are replies accessible? | Yes. The connector reads the whole `supportcore@` mailbox (inbox, sent, labels, threads, message bodies and, with `get_message` format RAW, headers). It also exposes write tools (reply, label, trash, spam, forward); **none may be used for monitoring** during C1. |
| Mailbox state (counts only) | Inbox 178 messages / 171 threads, **131 unread (124 threads)**, almost all in the Updates category (171 messages); Primary 4, Promotions 3. Sent: 16 messages / 15 threads, all our own tests. Drafts 0, Spam 0, Trash 0, no user labels. No bounce or undeliverable threads. |
| Is the mailbox actively triaged? | **Unknown.** 131 unread suggests it is not read item by item, or is read elsewhere. The connector cannot show filters, forwarding or who has delegate access. The business must confirm who monitors it today. |
| Display quirk | `search_threads` showed one recipient as `karans@…` while `get_message` showed the exact `karan.s@…`. Recipient verification must use `get_message`, never a search result display. |

## 2. How customer replies are identified (deterministic, not by eye)
1. **By thread:** every send records the Gmail thread ID in the Send Log. A reply to our email lands in the same thread. A thread is a reply when it holds a message whose sender is not `supportcore@flexifunnels.com`.
2. **By sender:** for each recipient we sent to, search `from:<recipient> after:<send date>` (small N: at most 5 in C1, 20 in C2).
3. **Bounces:** `from:(mailer-daemon OR postmaster)` and `subject:(undelivered OR "delivery status")`, matched to the recipient address.
4. **Automatic replies:** out-of-office and auto-responses are recognised from raw headers (`Auto-Submitted`, `X-Autoreply`, `Precedence`) with `get_message` RAW, and are not treated as complaints.
5. Because the inbox is noisy (171 threads), eyeballing is not acceptable; only the three queries above count.

## 3. Monitoring during C1 (proposed; needs the owner named by the business)
- **Cadence:** after each approved send, a read-only check the same day and the next business morning; a full check before the C1 review. No scheduled task is created.
- **Output:** a list of `{send_key, thread_id, kind, received_at}` only. Reply text is read by the named human reviewer, not copied into the repository or logs.
- **Classification (human decides, the agent proposes):** `COMPLAINT`, `OPT_OUT`, `QUESTION`, `AUTO_REPLY`, `BOUNCE`.
- **Responding:** only a person replies, from the mailbox. The agent never replies, labels or deletes during C1.

## 4. Complaint or "no further contact"
| Event | Action |
|---|---|
| Opt-out request ("stop", "unsubscribe", "remove me", "do not contact") | Add the address to the **suppression list** the same day after a human confirms. The list is a git-ignored local file (`local/suppression.json`); it is checked in `preSendChecks` (`RECIPIENT_SUPPRESSED`) before any log row or send, for exact addresses and whole domains. A person confirms the opt-out to the customer. |
| Complaint (anger, legal threat, data-protection request, spam report) | **Pause the pilot** (no further sends until the owner reviews), notify the owner the same day, record a reason code, never reply automatically. A legal or data-protection request goes to the business owner. |
| Bounce | Pause that recipient, mark `SEND_OUTCOME` as undelivered in the report, do not retry automatically. Two bounces pause the pilot. |
| Question or support request | Hand to support through the normal channel; not a pause trigger. |

## 5. Open items
- The business names the reply owner, the response time and the escalation path (blocker B2).
- Whether the email should carry an opt-out sentence is a business decision (the Gmail connector cannot add an unsubscribe header). Any change to the email text goes through the skills, not code.
- The suppression list needs an owner and must be cross-checked against the company's existing opt-out lists (consent checklist, item 5).
- A successful send is not proof of delivery; replies and bounces are the only delivery signals available.
