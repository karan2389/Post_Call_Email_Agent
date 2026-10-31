# Testing Strategy

Status: **Revised for the scheduled-task architecture (D-026).** All test data is synthetic. Business-rule scenarios (EV-01 … EV-103 in `tests/evals/README.md`, plus EV-104 … EV-113 for scheduled execution) are unchanged. What changes is **how** they are executed: there is no Python application with in-memory fakes, so scenarios run through the actual runbook against a **test copy** of the spreadsheet and a test mailbox.

## 1. Layers

| Layer | What | Where it runs | When |
|---|---|---|---|
| Connector & environment validation | R-01 … R-13 (`scheduled-execution.md` §4) | Scheduled task + interactive Claude Code, read-only first | Phase 1 |
| Skill scenario tests | Analysis, summary, generation and validation on synthetic transcripts (incl. Hindi, multi-segment, adversarial drafts) | Interactive or scheduled session, `dry_run`; results recorded in `outputs/` (git-ignored, synthetic only) | Phase 2, and before any skill change |
| Workflow scenario tests | Eligibility, duplicates, Call ID writes, state transitions, deferral, recovery, multi-run behaviour | Scheduled or manual runs against a **test copy** of the spreadsheet populated from `tests/fixtures/` | Phase 3 |
| Gmail tests | Drafts / internal sends, uncertain-send confirmation and human review, unattended send behaviour | Test mailbox, `test` mode, allowlisted internal recipients only | Phase 4 |
| Shadow review | Real records, drafts only, human review | Real sheet, `shadow` mode | Phase 5 |
| Helper unit tests (only if OD-38 adopts helpers) | Date maths, URL parsing, signatures/hashes, UUID format | Local, no network | Phase 1 |

No layer may use real customer data except shadow review, which writes only to approved locations.

## 2. Test doubles in the new architecture

The in-memory fakes of the original design (`FixedClock`, `FakeSourceSheet`, `FakeGmail`, …) belonged to the Python runtime and moved to `future-alternatives.md`. Their purposes are covered as follows:

| Former fake | Replacement |
|---|---|
| `FixedClock` | `target_date_override` in `config/run-settings.yaml`, plus fixtures dated relative to it. Date edge cases (00:00–05:30 IST) are checked with the helper tests (if any) and by inspecting `RUN_STARTED` run_date/target_date |
| `FakeSourceSheet` (records writes) | Test copy of the spreadsheet. After each run, compare the copy with its pre-run snapshot: **any change outside empty AD cells and the logs worksheets fails the test** |
| `FakeTrackingStore` with write failures | Interrupt runs deliberately (stop the session mid-record) and edit log rows by hand to simulate partial writes |
| `FakeGmail` with lost responses | Test mailbox: send, then delete the `SENT` log update by hand; the next run must reconcile without resending |
| `FakeLlmClient` | Not needed; skill scenarios use the real model with synthetic transcripts |

## 3. Scenario scoring

Each case has a synthetic fixture (row values + transcript) and expected results: final `status` and `reason_code`, expected item categories, must/must-not include assertions, and validation outcomes including **adversarial drafts**.

- **Safety cases:** 100% required; any unsafe email passing is a go-live blocker.
- **Quality cases:** pass-rate threshold agreed with the support team in Phase 2.
- Model outputs vary; safety cases run 3 times and must pass every time.
- Usage cost of each scenario run is noted (R-09).

## 4. Recovery scenarios (must be covered, Phase 3–4)

1. Session stops in `PROCESSING` → lease expiry → `PENDING` → processed once.
2. Session stops in `VALIDATING` → same.
3. Write-ahead (`SENDING`) write fails → no send.
4. Gmail accepts, `SENT` write fails or the session ends → next run reconciles → `SENT`, one email total.
5. Send result unknown → reconciliation finds it → `SENT`.
6. Gmail did not accept and the search finds nothing → `SEND_UNCONFIRMED`, no resend.
7. Two overlapping runs → run lock stops the second; one email.
8. Same call pasted twice → `DUPLICATE_SOURCE_ROW`.
9. Source rows re-sorted between runs → no duplicates, no mis-association.
10. Retryable failure three times → `RETRY_LIMIT_EXCEEDED`.
11. Required connector missing at PREFLIGHT → `CONNECTOR_UNAVAILABLE`, nothing touched.
12. Claude usage limit reached mid-run → remaining records untouched; next run continues.

## 5. Previous-day selection and deferral (EV-49 … EV-67)

1. Target date is yesterday in Asia/Kolkata, including runs between 00:00 and 05:30 IST.
2. Calls at 00:00 and 23:59 IST on the target date are included; today's and future calls are excluded.
3. Missing transcript → `PENDING` → transcript added → next run sends exactly one email.
4. Transcript never arrives → `SKIPPED` `MISSING_TRANSCRIPT` after `pending_until`.
5. Cancelled and no-show calls never produce an email.
6. One failing record does not prevent the others.
7. Run twice (and three times) on the same day → identical final state.
8. Missed day → lookback (or `target_date_override`) processes it once.
9. Date parsing: the connector's formatted values (`October 30, 2026`, `7:00 PM`) parse exactly; anything else → `MISSING_CALL_DATETIME`.

## 6. Source-sheet safety, recordings and transition (EV-68 … EV-103)

1. **Recording URLs:** one, two, three or more; duplicates within a cell; the same URL across rows; malformed tokens; order preserved; always one email per call.
2. **Call ID in AD:** only empty AD cells written; pre/post-write checks; row shifts; copied IDs; invalid IDs never overwritten; cleared IDs restored only on a unique match; header guard.
3. **Write boundary:** snapshot comparison of the test copy (§2). This replaces the former code write guard test (EV-91).
4. **Delivery modes:** `dry_run`, `test`, `shadow`, `live`; go-live cut-over; `Recording Sent` checked at eligibility and pre-send.
5. **Transcript automation:** `AI Summary` ignored; transcript changed between generation and send triggers regeneration.
6. **Hindi / mixed-language transcripts** (EV-28 and new Hindi fixtures): analysis works; email follows OD-08.

## 7. Synthetic data rules

See `tests/fixtures/README.md`. Fake names, `@example.com` addresses, fake Fathom URLs on a clearly fake path, no real customer content, no real staff names unless approved.
