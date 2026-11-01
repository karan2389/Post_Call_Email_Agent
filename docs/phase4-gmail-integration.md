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

## 6. First internal test send (2026-11-01, D-056, D-057)

Authorised by the user: use the stored draft in `Sheet1` row 2 (source row 15450, a validated neutral-fallback draft) for one internal test, to `karan.s@flexifunnels.com` only, in explicit test mode (marked subject and body, own `test_` send key, so the real send of that call stays unsent). Sequence followed: pre-send checks passed (code), Send Log rows `STORED -> READY_TO_SEND` and `READY_TO_SEND -> SEND_IN_PROGRESS` written and read back **before** the Gmail call, one `send_message` call, `SENT` row written after the connector returned a message ID. No timeout, no reconciliation. Exactly one new message appeared in Sent.

| Item | Observed |
|---|---|
| Message ID / thread ID | `1a19724b2d3e0e9a` / `1a19724b2d3e0e9a` |
| Actual From | `Support team flexifunnels <supportcore@flexifunnels.com>` (display name set by the mailbox, not by us) |
| To | `karan.s@flexifunnels.com` only; no cc or bcc; label `SENT` |
| Subject | `INTERNAL TEST - Follow-up on your FlexiFunnels support call` |
| MIME | `multipart/alternative` with `text/plain` and `text/html` parts, although only a plain `body` was supplied |
| Final Send Log state | `SENT` (3 events, one send key) |

**Finding, blocks customer sending until resolved (D-057).** The Fathom link in the stored draft arrived in the `text/plain` part (and the HTML part) as `https://www.google.com/url?q=<original link>&source=gmail&ust=<timestamp>&sa=E`, a Google redirect with an expiry parameter, not the original URL. So **the delivered text is not identical to the validated draft**, and the validation rule that every Fathom URL appears exactly as parsed (`FATHOM_URL_MISMATCH`, `UNAPPROVED_LINK`) is not met by what the customer would receive. Not yet known: whether the connector or Gmail's send path does this, whether the link still works after the `ust` time, and whether any way of sending (for example an `htmlBody` anchor or the draft route) avoids it. Finding out needs further test sends, which were not authorised. Reconciliation now compares bodies with this wrapping removed (`unwrapGoogleLinks`, tested), so a wrapped delivery is still recognised as ours, while any other text change is still a mismatch. A customer send must not happen before this is understood and the delivered link is verified to equal the validated one.

Other facts confirmed by this send: the connector is authorised as `supportcore@flexifunnels.com` (the From address is now observed, not inferred); `send_message` returns `id` and `threadId`; `get_message` (PLAIN_TEXT and RAW) can read a sent message back, so reconciliation by search plus body check is feasible.
