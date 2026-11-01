# Phase 4 — Gmail-only architecture (D-066)

**Decision (user, 2026-11-02):** the native Gmail connector is the **only** email provider. The user accepts Gmail's URL rewriting provided the original Fathom destination remains accessible and the delivered email is verified. Supersedes D-060 (Brevo as planned provider). Nothing was sent, drafted, written to a sheet or scheduled in this migration; every gate is closed.

## 1. Audit result (verified against the repository, 2026-11-02)
- `src/lib/gmail.js`: pure request, search and candidate builders for the connector tools `send_message`, `search_threads`, `get_message`. Kept.
- `src/lib/sender.js`: provider-neutral (`deps.mail`), durable `SEND_IN_PROGRESS` row before any send, reconciliation, no retry. It had **no provider policy, no approval check, no From check, no URL verification and no read-back after sending**, and `runBatch` used a fixed log snapshot (the same call twice in one batch would have been sent twice). All fixed below.
- `src/lib/brevo.js`, `src/brevo-check.js`, `src/lib/env.js`: Brevo adapter, check and `.env` loader (mocked tests plus the real runs of D-062 to D-064). Retained, not selectable.
- Send Log (19 columns, append-only), state machine (12 states), 21-column draft schema: unchanged. The two columns named "Gmail …" now hold the Gmail message ID again.
- No approval mechanism existed in code; the pilot design (C0–C3) was a plan only.
- Config: `email_provider.active` was `brevo`; it is now `gmail`.

## 2. What changed
| Area | Change |
|---|---|
| Provider selection | `src/lib/provider.js`: `selectProvider` accepts only `gmail` (missing, `brevo`, lists, anything else throws); `allow_fallback: true` throws; `gmailReadiness` has no Brevo gates; `sendContext` applies `provider_policy: gmail_only`, the approved sender, read-back and per-email approval. |
| No fallback | The sender blocks any provider whose `name` is not `gmail` when the policy is set (`PROVIDER_NOT_ALLOWED:<name>`) before any log row; nothing ever tries a second provider. |
| Config | `email_provider.active: gmail`, `allow_fallback: false`, `gmail_adapter_enabled: false` (still closed), Brevo block marked RETIRED, new `pilot` block (`c1/c2/c3_authorised: false`). `node src/brevo-check.js --live` returns `PROVIDER_RETIRED`. |
| URL verification | `src/lib/urlcheck.js` (section 3). |
| Delivery verification | After a connector send, the message is read back and must match recipient, **actual From** (`supportcore@flexifunnels.com`), subject, body and URL destinations before `SENT`. Anything else: `SEND_OUTCOME_UNKNOWN` then reconciliation then `RECONCILIATION_REQUIRED`; never a resend. A message ID alone is not proof. Reconciliation candidates carry `from`; a missing or different From is `FROM_NOT_VERIFIED` / `FROM_MISMATCH`. |
| Batch duplicates | `runBatch` re-reads the log before every item. |
| Approvals | `src/lib/approval.js` (section 4). |

## 3. URL handling
- **Canonical URLs** are those in the validated stored draft. They are never rewritten, re-stored or re-hashed; the draft hash is unchanged by wrapping.
- **Delivered representation** may be plain or the observed wrapper `https://www.google.com/url?q=<original>&source=gmail&ust=<µs>&sa=E` (also percent-encoded `q`, and `&amp;` separators). Recognised only in that exact shape.
- **Rejected:** missing or non-numeric `ust`, other `source`, `http` scheme, non-`www` or other Google hosts, extra parameters, undecodable or empty `q`, non-http(s) destinations, nested wrappers, any other Google-redirect-looking URL.
- **Verification:** every URL in the delivered body must resolve (plain, or wrapper destination) to the canonical URL at the same position, by **exact string equality**; counts must match. The verdict reports per URL: canonical, delivered, representation and `canonical_match`, kept apart.
- **Expiry:** `ust` is reported as `wrapper_expires_at`, not trusted. Whether a wrapped link still works after that time is **unverified** (first test links expire 2026-11-02 12:45 UTC; checking one afterwards is optional). A verified destination is evidence at the time of reading only.
- **Reconciliation:** body hashes are compared after unwrapping valid wrappers only; a mismatched or malformed wrapper cannot reconcile.
- **Open limitation (accepted by the user):** customers see Google's Redirect Notice page, and links may stop working after the wrapper expires. This is a customer-experience risk, not a data-integrity risk.
- Helper commands: `node src/p3.js verify-urls` (stdin `{delivered, canonical[]}`), `node src/p3.js provider`.

## 4. Approvals (pilot stages C1 and C2)
- An approval = `{send_key, recipient, draft_hash, stage, approved_by, approved_at, expires_at?, revoked}`, bound to the **exact recipient and draft hash** (recipient + subject + body). Editing the draft, changing the recipient or using another call's approval fails (`APPROVAL_DRAFT_CHANGED`, `APPROVAL_RECIPIENT_MISMATCH`, `APPROVAL_REQUIRED`); a newer approval for the same send key supersedes older ones.
- Also refused: revoked, expired, test keys, a stage that is not authorised (`pilot.c1_authorised` / `c2_authorised`), a stage at its cap (C1 5, C2 15 more). C3 (capped automation) has no code path; it needs its own design and authorisation.
- Approvals are checked in `preSendChecks` for `live` sends, before any log row or send. Test sends need none.
- Approvals contain customer addresses, so they live in git-ignored `local/pilot-approvals.json` and are never committed or logged.
- Sensitive-topic review, validation, recipient checks and the pre-send checks are unchanged; an approval never overrides them.

## 5. Brevo migration
| Component | State |
|---|---|
| `src/lib/brevo.js` and tests (`phase4-brevo.test.js`, `phase4-env.test.js`) | Retained, mocked, not selectable. Delete only after the Gmail pilot is verified. |
| `src/brevo-check.js`, `src/lib/env.js` | Retained; `--live` refused (`PROVIDER_RETIRED`). |
| `config` Brevo block | Kept, marked RETIRED; flags unchanged as history. |
| `.env` with `BREVO_*` and `.env.example` | **Not touched.** Brevo code still references these names; remove the secrets only after the migration is verified. Never exposed or committed. |
| Brevo account | Not changed by the agent; the user can revoke the API key when ready. |
| Docs | `phase4-brevo-integration.md` is historical. |

## 6. Rollout (unchanged, all closed)
C0 pre-pilot readiness; C1 five individually approved customer emails; C2 up to fifteen more after the C1 review; C3 optional capped automation (separate approval). Gates still closed: `gmail_adapter_enabled`, `customer_sending_authorised`, `internal_tests_authorised`, `pilot.*`, `delivery_mode: dry_run`, `writes_enabled`, no scheduled task.

## 7. Remaining risks
Gmail wrapper expiry and the Redirect Notice experience; no provider idempotency key (not exactly-once); the sensitive-topic path is untested on real data; the connector's `get_message` From and body representation was only observed on internal tests; approvals live in a local file; sharing and source read-only are user-confirmed only; the first real Gmail verification of the read-back path needs an authorised internal test.

## 8. First real Gmail-only test (2026-11-02, D-067)
One synthetic internal email, read back and verified: From `supportcore@flexifunnels.com`, recipient exact, both Fathom-style URLs wrapped by Gmail and verified against the canonical URLs, result SENT (Send Log rows 17-19). Wrapper expiry (`ust` about 24 h after sending) and the Redirect Notice experience remain unverified and accepted.

