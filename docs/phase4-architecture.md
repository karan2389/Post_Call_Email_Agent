# Phase 4: architecture (current state)

Status: sending logic implemented and tested **against mocks only**. No email has been sent. Customer sending is disabled (`delivery_mode: dry_run`, `gmail_enabled: false`, `customer_sending_authorised: false`).

```
Calls DONE (read only) -> eligibility -> analysis -> summary -> email -> independent validation
        -> Sheet1 (validated draft, guarded write) -> pre-send checks -> Send Log (SEND_IN_PROGRESS) -> Gmail send_message
        -> confirmed message ID -> Send Log (SENT)        timeout/unknown -> reconcile via Sent search -> SENT | RECONCILIATION_REQUIRED
```

Components (all pure code under `src/lib/`, no network): `guard.js` (spreadsheet write guard, D-048), `sendstate.js` (states, send key, draft hash, pre-send checks, reconciliation; D-049), `sendlog.js` (event log schema and fold; D-054), `gmail.js` (exact request and search builders), `sender.js` (reference orchestrator, tested with mocks). The Claude session performs the real connector calls; `node src/p3.js presend | send-request | search-query | reconcile | event-row | send-key` give it the same logic.

Rollout (user's staged plan): A dry run (done for drafts) -> B internal Gmail tests to `karan.s@flexifunnels.com` only (**needs the user's go-ahead for the first real test send**) -> C limited customer pilot (cohort and limits to be set by the user) -> D full automatic delivery (only after the user's explicit final authorisation). Scheduling: not investigated further yet; no scheduled task exists.

Honest limits: not exactly-once (docs/phase4-idempotency.md); the connector's behaviour on timeout and error is undocumented and untested live; the connector's sender identity is inferred until the first test send.

## Provider update (D-060)
**Current (D-066): Gmail is the sole provider.** The connector rewrites URLs (D-057 to D-059); the wrapper is accepted only when its destination equals the validated Fathom URL and the delivered message is verified on read-back (recipient, actual From, subject, body, URLs). No fallback; Brevo is retired (`src/lib/brevo.js` is kept as historical mocked-tested code). Details, approvals and migration: `docs/phase4-gmail-only.md`.
