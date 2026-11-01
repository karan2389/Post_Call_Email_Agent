# Phase 4: Brevo transactional email provider (design and mocked implementation)

Status: **implemented and tested with mocked HTTP only (`src/lib/brevo.js`, `tests/unit/phase4-brevo.test.js`, D-060). No Brevo account was created, no credential exists, no real request was made, no email was sent.** Customer sending stays disabled (`delivery_mode: dry_run`, `customer_sending_authorised: false`, `email_provider.brevo.adapter_enabled: false`).

## 1. Why Brevo
The Gmail connector rewrites every URL in a message into a Google redirect with a 24-hour expiry, for plain text, HTML and drafts alike (D-057 to D-059). A recording link is core to the customer email, so the Gmail route cannot be used. The Gmail adapter code stays in the repository (`src/lib/gmail.js`) but disabled (`email_provider.gmail_adapter_enabled: false`).

## 2. API facts used (official docs read 2026-11-01; two list/get URLs given in the task returned 404, the correct pages were used)
| Fact | Source |
|---|---|
| `POST https://api.brevo.com/v3/smtp/email` (singular), header `api-key`; list and get endpoints are plural (`/v3/smtp/emails`) | developers.brevo.com/reference/send-transac-email |
| `sender` and `subject` required without a template; **`htmlContent` is required without a template** (textContent alone is not allowed) | same |
| `tags` (array of strings), `headers`, `params`, `replyTo`, `cc`, `bcc`, `attachment`, `scheduledAt`, `batchId`, `messageVersions` exist; no idempotency field is documented | same |
| **No per-request option to disable click tracking or link rewriting.** `removeTrackingPixel` (Enterprise) affects only the open pixel ("Click tracking is unchanged") | same |
| 201 body `{"messageId":"<...@...>"}` (with angle brackets); only 400 is documented as an error on the send page; `x-sib-ratelimit-limit/remaining/reset` headers and 429 are documented separately | same; developers.brevo.com/docs/limit-headers |
| `GET /v3/smtp/emails` needs at least one of `email`, `templateId`, `messageId`; `startDate` and `endDate` (max one month); items carry `date, email, messageId, subject, uuid, from, tags` and **no body** | developers.brevo.com/reference/get-transac-emails-list |
| `GET /v3/smtp/emails/{uuid}` returns `body`, `subject`, `email`, `date` and `events[]` ({name, time}; example names sent, delivered, opened); body retention not stated | developers.brevo.com/reference/get-transac-email-content |
| Webhook events: `request` (sent), `delivered`, `deferred`, `soft_bounce`, `hard_bounce`, `blocked`, `spam`, `invalid_email`, `opened`, `click`, `unsubscribed`, ...; webhook field `message-id` has **no** angle brackets | developers.brevo.com/docs/transactional-webhooks |
| Where tracking or link rewriting is controlled, and whether SPF/DKIM/DMARC are mandatory for transactional sending: **not stated** in the pages read | (open, see section 7) |

## 3. What the adapter does (`src/lib/brevo.js`)
- Builds the exact payload: `sender` (the approved address only), `to` (exactly one recipient), `subject` (stored text unchanged), `textContent` (stored body unchanged), `htmlContent` (a deterministic HTML twin of the plain text: HTML-escaped, newlines as `<br>`, **no anchors created**; explicit HTML is supported and sent unchanged), `tags` = [send key] (Brevo-side metadata, not part of the email, so the log can be matched later). No tracking, scheduling, template, cc/bcc, attachment or header fields.
- Fathom URLs are never altered: the request carries them exactly as stored (tested, including query strings and `&`).
- Refuses to make any request unless: `BREVO_API_KEY` is present and well formed; `BREVO_SENDER_EMAIL` equals the approved sender (`supportcore@flexifunnels.com`); `sender_verified_in_brevo` is true; `link_tracking_disabled_confirmed` is true; the API base is exactly `https://api.brevo.com/v3` (the key only ever goes to Brevo).
- Outcomes: 201/200 with a message ID -> confirmed (`id` = ID without angle brackets, raw value kept). **Definite (no message created):** 400, 401, 402, 403, 404, 405, 406, 409, 410, 413, 415, 422, 429 (429 records the reset hint; no retry). **Uncertain:** timeout, network error, 408, any 5xx, 2xx without a message ID, 202 (we never schedule), malformed body. **There is no automatic retry anywhere.**
- Errors never contain the API key or message content.

## 4. Sender integration (provider-neutral, safeguards unchanged)
`src/lib/sender.js` now takes `deps.mail` (alias `deps.gmail`). A provider that is not ready blocks the send **before** any log row is written. Everything else is unchanged: ten pre-send checks, durable `SEND_IN_PROGRESS` row first, only a definite rejection is `SEND_FAILED`, uncertain outcomes are reconciled and never retried, `RECONCILIATION_REQUIRED` for a human, test sends use their own `test_` key and marked text, unique customer send keys, OD-11 sensitive-topic restriction, the 21-column draft schema and the 19-column append-only Send Log untouched. The Send Log columns `Gmail Message ID` and `Gmail Thread ID` hold the provider message ID (Brevo: message ID, no thread); the reason code reads `PROVIDER_CONFIRMED:brevo`. Renaming those headers to `Provider Message ID` and `Provider Thread ID` is a one-cell guarded sheet write that needs the user's approval and is **not** done.

Reconciliation with Brevo: search `GET /smtp/emails` by recipient and a date window around the attempt, read each candidate by `uuid` (the list has no body), convert the stored HTML back to text with the inverse of the twin, and apply the existing rule (one match with an equal body hash = `SENT`; none, several, a different body, or an unverifiable body = `RECONCILIATION_REQUIRED`). **Not verified live:** that Brevo returns our HTML unchanged and that the body is retained long enough; if not, reconciliation fails safe to a human.

## 5. Configuration and secrets
`.env.example` lists `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` with empty values. Real values go in environment variables or an ignored `.env` file; `.gitignore` ignores `.env`, `.env.*` and `*.env` and keeps the example. `config/run-settings.yaml` holds only flags (`email_provider` block), never a secret. The agent must never ask for or print a key.

## 6. Account setup still required (user actions; none has been done)
1. Create or choose the Brevo account and confirm its plan allows transactional sending and the expected volume.
2. Authenticate the sending domain `flexifunnels.com` in Brevo (Senders, Domains and dedicated IPs): add the DNS records Brevo displays (DKIM, Brevo code, DMARC as Brevo shows them; also check the existing SPF record for the domain) and confirm "authenticated" in Brevo. Then set `domain_authenticated_in_brevo: true`.
3. Add and verify the sender `supportcore@flexifunnels.com` in Brevo (verification code or domain authentication). Then set `sender_verified_in_brevo: true`.
4. In the Brevo account settings, turn off click tracking (and open tracking) for transactional email. **Where this setting lives is not stated in the API docs, so confirm it in the Brevo interface.** Do not set `link_tracking_disabled_confirmed: true` until the controlled test below shows original Fathom URLs in the raw delivered message.
5. Create a v3 API key in Brevo (SMTP and API) and store it only as `BREVO_API_KEY` on the machine that runs the agent; set `BREVO_SENDER_EMAIL=supportcore@flexifunnels.com` and `BREVO_SENDER_NAME`. Consider restricting the key to authorised IP addresses in Brevo's security settings. Then `api_key_provisioned: true`.
6. Decide how delivery status is tracked (section 7). The project has no deployed backend (D-026), so a webhook receiver does not exist.
7. Approve the controlled test in chat (section 7). `adapter_enabled`, `delivery_mode` and `customer_sending_authorised` change only on explicit approval.

## 7. Delivery verification design for a future controlled test (not run)
An API success response is **not** proof of delivery: `201` means Brevo accepted the request. A controlled test, to an approved internal recipient only, with a synthetic marked message, must establish all of the following and record the evidence:
1. **Raw delivered MIME:** read the received message's raw source (Gmail "Show original" text, or `get_message` RAW if the test recipient is a mailbox the Gmail connector can read; the connector is authorised as `supportcore@flexifunnels.com`, so a test to that mailbox, if the user approves it as an additional internal recipient, allows a read-only check; otherwise the user pastes the "Show original" text).
2. **Plain-text and HTML parts:** both present; text equals the stored body exactly (compare with the body hash); the HTML decodes to the same text.
3. **Original Fathom URLs:** every URL in both parts equals the stored URL byte for byte; none is wrapped (no `google.com/url`, no Brevo tracking host, no `sendibt`-style redirect). Any difference means `link_tracking_disabled_confirmed` stays false.
4. **Sender identity:** the `From` header is exactly `supportcore@flexifunnels.com` (with the configured name), and authentication results in the headers show SPF/DKIM/DMARC pass for `flexifunnels.com`.
5. **Recipient identity:** the `To` header is exactly the approved internal address, with no cc/bcc.
6. **Brevo message ID:** the API `messageId` equals the `Message-ID` header (modulo angle brackets) and the ID stored in the Send Log; the tag on the Brevo record equals the test key.
7. **Delivered or bounced status:** poll `GET /smtp/emails/{uuid}` and read `events[]` for `delivered` (and bounce, blocked, spam or deferred events); record the final status in a new Send Log event or a separate delivery-status record. Brevo webhooks (`delivered`, `hard_bounce`, `soft_bounce`, `blocked`, `spam`, `invalid_email`, `deferred`) are an alternative only if the user approves a receiver; they report `message-id` without angle brackets, which must be normalised before matching.
Exactly-once delivery is **not** guaranteed here either: Brevo has no documented idempotency key, so duplicate prevention rests on the durable attempt row, the stable send key and reconciliation (`docs/phase4-idempotency.md`).

## 8. Unresolved technical risks
- Brevo's click/link tracking behaviour for transactional email is not documented in the pages read; it may rewrite URLs (the same failure as Gmail) until it is turned off and proven off by a raw delivered message.
- Whether Brevo keeps and returns our HTML body unchanged (reconciliation depends on it); body retention is not documented.
- No documented idempotency key: a crash between Brevo accepting the request and our `SENT` row is detected by reconciliation, not prevented.
- A single recipient mailbox for raw-MIME inspection must be agreed (section 7, item 1).
- Domain authentication (SPF, DKIM, DMARC) and sender verification are account actions the agent cannot perform or verify; the flags are user-confirmed unless API-evidenced.
- HTTP behaviour for 401/403/404/405/406/422 and 5xx is not documented on the send page; the adapter classifies by HTTP semantics and treats everything not provably a rejection as uncertain.
- Webhooks need a public receiver; none exists. Polling is the proposed method.
- The Send Log header names still say "Gmail" (cosmetic; rename needs approval).
## 9. `.env` loader and read-only connectivity check (D-061, mocked only)
- `src/lib/env.js` loads only `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` from the ignored root `.env` (a non-empty real environment variable wins). It never prints a value and never writes to `process.env`; problems are reported as codes, variable names and line numbers.
- `node src/brevo-check.js` is an offline report (booleans and codes; no request). `node src/brevo-check.js --live` makes exactly one `GET /v3/account` and only when `brevo.connectivity_check_authorised: true`, `.env` is ignored and untracked by Git, and fetch is available. The result is a code (`CONNECTED`, `AUTHENTICATION_FAILED`, `RATE_LIMITED`, `HTTP_n`, `TIMEOUT`, `NETWORK_ERROR`); no account data is kept.
- The check proves the key is accepted from this machine. It does **not** prove sender verification, domain authentication, or that click tracking is off; those flags stay false until evidenced. The first real request needs the user's separate authorisation (the gate is false).

## 10. First real test result (2026-11-01, D-062)
One synthetic internal email (`p4-brevotest-1`) was sent with a plain-text and an HTML part. Plain text: all URLs exactly preserved. HTML: anchors rewritten to `sendibt3.com/tr/cl/...` click-tracking links, open-tracking pixels added, plain-text URLs in HTML untouched, `List-Unsubscribe` headers added. Authentication: DKIM and SPF pass on Brevo's domains only, DMARC fail for `flexifunnels.com` (p=NONE). Consequence: tracking is on despite the account settings the user believed were off, so `link_tracking_disabled_confirmed` stays false. Next: turn click and open tracking off in Brevo (transactional settings; Brevo support if the toggle is missing), then repeat ONE test using the production HTML twin with a Fathom-style URL, and compare the raw message again. DNS records for `flexifunnels.com` are needed before any customer sending.

## 11. Tracking opt-out field (D-063, mocked only)
Every request now carries `contactPixelTrackingConsent: false` on the single recipient (requires the account setting in Settings > Contacts > Per-contact pixel tracking consent). It is an attempt to stop the click rewriting, open pixel and tracked unsubscribe link seen in D-062 and is unproven until a second raw message confirms it.


## 12. Second real test result (2026-11-02, D-064)
Production-style HTML twin with the opt-out field: Fathom-style URLs preserved exactly in text and HTML (only & entity-escaped in HTML); no anchors, so no click wrapping; open pixels and a tracked one-click `List-Unsubscribe` header still added; DMARC still fails (Brevo-domain DKIM/SPF only). Open items: decision on the tracking flag, pixel and unsubscribe header (ask Brevo support), DNS for flexifunnels.com.


## 13. Tracking flag decision (D-065)
Flags set from evidence: `sender_verified_in_brevo`, `link_tracking_disabled_confirmed` (meaning: original URLs preserved, open pixel accepted), `api_key_provisioned`. The adapter now refuses HTML anchors. Open risks: tracked one-click `List-Unsubscribe` header; DMARC fail until the domain is authenticated. Customer sending remains blocked by `delivery_mode: dry_run` and `customer_sending_authorised: false`.

