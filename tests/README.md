# tests/

See `docs/testing-strategy.md` for the full strategy (revised for the scheduled-task architecture, D-026).

| Folder | Contents | Runs against |
|---|---|---|
| `evals/` | Scenario catalogue EV-01 … EV-103: business-rule, skill, workflow, recovery and safety cases | Synthetic fixtures; test copy of the spreadsheet; test mailbox |
| `fixtures/` | Synthetic source rows, transcripts (incl. Hindi and multi-segment), adversarial drafts | — |
| `integration/` | Reserved: checklists and recorded results of workflow scenario runs on the test copy (Phase 3–4); synthetic data only | Test copy / test mailbox |
| `unit/` | Reserved: tests for deterministic helpers, **only if** OD-38 adopts helpers. No application unit tests exist in this architecture | Local, no network |

All data is synthetic. Real customer data must never be added here.
