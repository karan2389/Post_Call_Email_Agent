# src/

**No application code, and none is planned for the primary architecture (D-026).** The daily workflow runs as a Claude Code scheduled task following `workflows/daily-post-call-run.md`, with native Google connectors. There is no Python backend.

This folder is **reserved** for one possible use only:

- **Deterministic helpers** (OD-38): small scripts the scheduled session could run for steps the model must not do "in its head", namely Asia/Kolkata date maths, recording-URL parsing, row signatures / SHA-256 hashes, and UUID generation. They would not be a deployed backend and would hold no credentials. Whether the scheduled environment can run them is risk R-11. Nothing is written until OD-38 is decided in Phase 1.

The original Python package layout is preserved in `docs/future-alternatives.md` §1.


## Phase 3 helpers (OD-38 approved, D-039)

Small, dependency-free Node scripts for deterministic work the model should not do by hand: `src/p3.js` (CLI), `src/lib/normalize.js` (date, time, email, recording URLs, fingerprint, SHA-256, Asia/Kolkata dates), `src/lib/eligibility.js` (E1–E18 in two steps, transcript read only after the preliminary checks), `src/lib/destination.js` (21-column schema, storage rules, header check, idempotent write plan, collision handling) and `src/lib/policy.js` (sensitive-topic review). No network, no credentials, no files written, no spreadsheet access: the session reads and writes through the native connector and uses these helpers only on stdin/stdout. Tests: `node tests/unit/phase3.test.js` (synthetic data only). They are not a backend and are not a runbook for scheduled runs.
