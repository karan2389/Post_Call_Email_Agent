# Phase 4: Gmail integration (facts and limits)

Status: **investigation only; no email has been sent and no mailbox content has been read beyond one metadata lookup.** Nothing here is marked as tested unless stated.

## 1. Connector (desktop session, tool schemas inspected 2026-11-01)

| Capability | Evidence | Tested live |
|---|---|---|
| Send plain text to a recipient with subject and body | `send_message`: `to`, `subject`, `body` (plain text), optional `cc`/`bcc`, `htmlBody`, `attachments`, `replyThreadId`, `includeSignature`, `draftId` | No |
| Message ID after sending | `send_message` returns a Message with `id`, `threadId`, `labelIds` | No |
| Create a draft, send an existing draft | `create_draft`, `send_message` with `draftId` | No |
| Find a sent message later | `search_threads` (`in:sent`, `to:`, `subject:`, `after:`/`before:`, `rfc822msgid:`), `get_thread`, `get_message` (plain-text body) | Search: yes, one read-only metadata call |
| Custom headers or an idempotency key on send | **None in the schema** | n/a |
| Documented timeout or error behaviour | **None documented** | No |
| Scheduled or cloud availability | Not tested; Gmail is attached to this desktop session only | No |

## 2. Account identity

The most recent message in `in:sent` was sent by `supportcore@flexifunnels.com` (metadata only; recipient not recorded). So the Gmail connector appears to be authorised as that mailbox. That is an **inference**, not a confirmation, and it differs from the Sheets connector account (`karan.s@flexifunnels.com`). The Sent folder holds about a dozen threads, so a reconciliation search is cheap. Customers would see `supportcore@flexifunnels.com` as the sender: **the user approved `supportcore@flexifunnels.com` as the customer-facing sender on 2026-11-01 (D-053)**. That approves the sender identity only: it does not enable sending, and that the connector is really authorised as this mailbox is still an inference until the first approved internal test send shows the From address.

## 3. Consequences for the design

- No idempotency key: duplicate prevention depends on writing the durable attempt record (state `SEND_IN_PROGRESS`, send key, draft hash, start time) **before** calling `send_message`, and on reconciliation after any uncertainty (`src/lib/sendstate.js`, D-049). A crash between the send and our record is detected by reconciliation, not prevented. This is **not** exactly-once.
- Reconciliation can only search by recipient, subject, time and body. Exactly one matching message with the same body hash proves SENT; zero, several, or an unverifiable body stay `RECONCILIATION_REQUIRED` for a human. A missing message is not proof that nothing was sent (indexing delay).
- A reply, forward, label or trash tool exists in the same connector. Only `send_message`, `search_threads`, `get_message` and `get_thread` are in scope; the others are not to be used.
- Internal testing (Stage B) uses only explicitly approved internal recipients; test mode refuses any other address.

## 4. Approved settings (D-053, 2026-11-01)

- Customer-facing sender for all automated post-call follow-up emails: `supportcore@flexifunnels.com` (approved by the user).
- Internal test recipient (Stage B only): `karan.s@flexifunnels.com` (approved by the user). Test mode refuses every other address.
- Not yet authorised: any internal test send (needs the user's go-ahead in chat), customer sending, scheduling. `config/run-settings.yaml` `gmail:` block holds these values; `delivery_mode` is `dry_run` and `gmail_enabled` is `false`.

## 5. Identity check before the first test send (2026-11-01, read-only)

The connector has **no profile or identity tool**, so an exact "profile lookup" is not possible. Converging read-only metadata evidence was used instead: all 11 messages in `in:sent` have the sender `supportcore@flexifunnels.com` (one distinct sender); `deliveredto:supportcore@flexifunnels.com` matches 172 threads; `deliveredto:karan.s@flexifunnels.com` matches none (so the approved test recipient is a different mailbox from the sending mailbox). This supports, but is not a direct statement by the connector of, the identity `supportcore@flexifunnels.com`; the first sent test message will show the From address. **No email has been sent yet.** The test send is on hold because a prerequisite is missing: there is no stored, validated draft addressed to the approved internal recipient (see D-055 and `handoff.md`).
