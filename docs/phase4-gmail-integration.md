# Phase 4: Gmail integration (facts and limits)

> **Superseded for customer email (D-060):** the Gmail connector rewrites every URL, so the Gmail adapter is kept but disabled. See `docs/phase4-brevo-integration.md`. This page is the evidence record of the Gmail investigation.

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

## 7. Link-rewriting investigation (2026-11-01, D-058): 2 of the 3 authorised synthetic test sends used

Authorised by the user: at most 3 marked internal test emails to `karan.s@flexifunnels.com`, synthetic drafts and harmless `example.*` URLs only, separate `test_` send keys, no customer data. Each send followed the sender sequence: sender verified (all recent Sent messages from `supportcore@flexifunnels.com`), recipient exactly `karan.s@flexifunnels.com`, guard allowed, `SEND_IN_PROGRESS` row read back before the call, `SENT` row after, gate closed after each. The three keys are distinct and none is a customer send key. **One authorised send was not used.**

| | Test 1 (`p4-linktest-1`, msg `1a1972cdff75c989`) | Test 2 (`p4-linktest-2`, msg `1a1972ec1e455b23`) |
|---|---|---|
| Input | plain `body` only: raw URL with query, `<angle>` URL, scheme-less `example.com/...`, labelled URL | `htmlBody` with an anchor (non-URL text), an anchor whose text is the URL, a bare URL in the HTML, plus a plain alternative |
| Delivered `text/plain` | all 4 wrapped | all 3 wrapped |
| Delivered `text/html` (an HTML part appeared although none was supplied) | all 4 wrapped | all 3 `href`s wrapped; anchor text unchanged; the bare URL was auto-linked and wrapped |
| Other | the scheme-less URL got `http://` added | |

**Form of the rewrite:** `https://www.google.com/url?q=<original>&source=gmail&ust=<time>&sa=E`. `ust` is the send time plus 24 hours.

**Where it happens:** in the connector's send path, before Gmail stores the message. The stored message already carries the wrapped links and shows `Received: by gmailapi.google.com with HTTPREST`, and the plain `body` field behaved the same as `htmlBody`. Gmail's own API does not normally do this, so this is an inference; the connector's internals are not visible. **No input form tested avoids it.**

**Redirect behaviour (verified, built-in browser, test 1 angle URL):** the wrapped link opens a Google "Redirect Notice" page ("the page you were on is trying to send you to ..."), not a direct redirect. One click on its signed `google.com/goto` link reached the original destination (`https://example.org/p4-linktest-1/angle`, page loaded). So the original destination stays reachable **now**, behind an extra confirmation page. **Not verified:** what the link does after the `ust` time (test 1 links: after 2026-11-02 12:54 UTC; test 2: after 13:56 UTC). A link to a call recording must keep working for days, so this must be checked before any decision to accept wrapped links.

**Other observation:** the metadata view of Sent shows the recipient as `karans@...` while the raw `To:` header is `karan.s@...`; this is display normalisation, and recipients should be checked in the raw header.

**Not tested (no authorisation or sends left to spare):** the draft route (`create_draft`, read the draft back, then send it by `draftId`), other connector tools, URLs inside preformatted HTML, any sending mechanism outside this connector.

### Recommended fix path (nothing implemented; customer sending stays blocked)
1. **Keep customer sending blocked** (`customer_sending_authorised: false`). Wrapped, expiring, interstitial links break the "delivered equals validated" rule and risk dead recording links.
2. **Safest next test (needs the user's approval):** create one synthetic draft, read it back without sending (a draft is not an email), and only if its links are original, send it by `draftId` as the remaining test send, verify the raw message, delete the synthetic draft. If the draft already shows wrapping, nothing is sent and the draft route is ruled out.
3. **If the draft route also wraps:** the options are a different sending mechanism outside this connector (this needs credentials, which the project forbids creating without a separate decision), or accepting wrapped links with documented mitigations (not recommended). Either needs the user's decision.
4. Whichever route is chosen, add a deterministic post-send check that the delivered body, with a known wrapper removed, equals the validated body (`unwrapGoogleLinks` already supports reconciliation) and that every Fathom URL in the delivered message is the original or a verified redirect to it.

## 8. Draft-route test (2026-11-01, D-059): rewriting happens when the message is built, not when it is transmitted

Authorised by the user: exactly one synthetic draft in `supportcore@flexifunnels.com`, read back as raw MIME; send it by draft ID only if every URL was unchanged; otherwise send nothing; delete the draft and verify. Sender verified before the operation (recent Sent messages all from `supportcore@flexifunnels.com`); baseline `list_drafts` was empty; unique test key `test_8bc737792fc20fdfec6b5e5c` (no customer key); recipient `karan.s@flexifunnels.com`; only `example.org` URLs.

| Item | Observed |
|---|---|
| Draft created | draft ID `r5004069450795491372`, message ID `1a19736db9095ca8` (one creation only) |
| Raw MIME read back from the draft (`get_draft` RAW) | `From: Support team flexifunnels <supportcore@flexifunnels.com>`, `To: karan.s@flexifunnels.com`, `multipart/alternative` |
| `text/plain` URLs (3) | all 3 already wrapped as `google.com/url?q=<original>&source=gmail&ust=<time>&sa=E` |
| `text/html` links (3) | all 3 `href`s wrapped; the two raw `example.org` URLs that remain in the HTML are only visible anchor text |
| Send | **none** (the URLs were already rewritten, as the authorisation required) |
| Cleanup | draft deleted; `list_drafts` empty again (matches the baseline); Sent still contains exactly the 3 earlier messages |
| Send Log | no rows written for this test (no send happened); the write gate stayed closed |

**Conclusion.** The rewriting is applied when the connector builds the message (`create_draft` and `send_message` both do it), **not** during transmission. So sending a draft by ID cannot avoid it: the draft already contains the wrapped links. Across the three link tests, none of these inputs delivers original URLs through this connector: plain `body`, `htmlBody` with anchors, bare and scheme-less URLs, angle-bracket URLs, and the draft route. All three authorised test sends/tests are now used up.

**What this leaves (decisions for the user; nothing is implemented):**
1. **Check expiry first (no new send needed):** open a wrapped link after its `ust` time. The test-3 draft was deleted, but the test-1 and test-2 links from sent messages remain; test-1 links expire after 2026-11-02 12:54 UTC, test-2 links after 13:56 UTC. If an expired link still reaches its destination (even behind a Redirect Notice page), accepting wrapped links with documented limits becomes a real option; if it dead-ends, it is not acceptable for recording links.
2. **A different sending mechanism outside this connector** (for example a direct Gmail API or SMTP route) would deliver the original URLs, but it needs credentials, which the project does not allow creating or configuring without a separate explicit decision (CLAUDE.md section 4).
3. **Accepting wrapped links** changes the validated text on delivery; if chosen, the validator and the post-send check must be updated to accept the known wrapper, and the user must accept the Redirect Notice page and the 24-hour expiry risk.
Customer sending stays blocked until the user decides.
