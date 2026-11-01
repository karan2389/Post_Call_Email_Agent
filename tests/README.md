# tests/

See `docs/testing-strategy.md` for the full strategy (revised for the scheduled-task architecture, D-026).

| Folder | Contents | Runs against |
|---|---|---|
| `evals/` | Scenario catalogue EV-01 … EV-103: business-rule, skill, workflow, recovery and safety cases | Synthetic fixtures; test copy of the spreadsheet; test mailbox |
| `fixtures/` | Synthetic source rows, transcripts (incl. Hindi and multi-segment), adversarial drafts | — |
| `integration/` | Reserved: checklists and recorded results of workflow scenario runs on the test copy (Phase 4); synthetic data only | Test copy / test mailbox |
| `unit/` | Phase 2 test harness (`checks.js`, `run-phase2.js`): eligibility subset, deterministic email checks, structural checks of stage outputs, expectation comparison. Run `node tests/unit/run-phase2.js`. It is a test harness only; use of helpers in the runbook remains OD-38 | Local, no network |
| `results/` | Stage outputs and validation verdicts: `phase2/` original run (skills 1.2.0 era), `phase2-proposed/` earlier S-11 patch experiment, `phase2-s11/run1..3` round 1 and `phase2-s11-r2/run1..3` round 2 of the S-11 regression, `phase2-final/run1..3` and `phase2-final/individual` the final regression (call-date, length and intent policies). Each has a `test-results.json`; check a set with `PHASE2_RESULTS=<folder> PHASE2_ADV_BASE=phase2 node tests/unit/run-phase2.js` (original set: `PHASE2_OWNER_RULE=legacy`) | Synthetic only |

All data is synthetic. Real customer data must never be added here.
