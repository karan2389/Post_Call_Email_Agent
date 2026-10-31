# tests/

See `docs/testing-strategy.md` for the full strategy.

| Folder | Contents | Network |
|---|---|---|
| `unit/` | Pure logic, contract and recovery-simulation tests using fakes | Never |
| `integration/` | Test spreadsheet / test mailbox with synthetic data (Phase 3+) | Opt-in |
| `evals/` | LLM evaluation case catalogue and (later) harness | Opt-in (Anthropic API) |
| `fixtures/` | Synthetic transcripts, metadata and adversarial drafts | — |

All data is synthetic. Real customer data must never be added here.
