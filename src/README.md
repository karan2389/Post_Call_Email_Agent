# src/

**No application code, and none is planned for the primary architecture (D-026).** The daily workflow runs as a Claude Code scheduled task following `workflows/daily-post-call-run.md`, with native Google connectors. There is no Python backend.

This folder is **reserved** for one possible use only:

- **Deterministic helpers** (OD-38): small scripts the scheduled session could run for steps the model must not do "in its head", namely Asia/Kolkata date maths, recording-URL parsing, row signatures / SHA-256 hashes, and UUID generation. They would not be a deployed backend and would hold no credentials. Whether the scheduled environment can run them is risk R-11. Nothing is written until OD-38 is decided in Phase 1.

The original Python package layout is preserved in `docs/future-alternatives.md` §1.
