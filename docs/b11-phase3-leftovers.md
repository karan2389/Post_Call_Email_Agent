# B11: Phase 3 leftovers (D-071, 2026-11-02)

Status of each item. Only two bounded, read-only cell reads of the source sheet were made (the Transcript cells of two rows, plus their date and time to confirm the rows). Nothing was written, no transcript content was read, no gate changed.

| Item | Result | Status |
|---|---|---|
| Transcripts for source rows 15453 and 15454 | Both `Calls DONE` cells in column AB are **still empty**. The calls are dated 31 Oct 2026 (8:45 PM and 9:45 PM IST), about 28 hours old at the check. They are inside the 7-day follow-up window (until 7 Nov 2026). They stay deferred and excluded from the pilot pool (`DEFERRED_CALL`). | **Waiting on the transcript automation** (owner and schedule still unknown, OD-33) |
| OD-10 eligibility | Confirmed by the user: all calls in `Calls DONE` are support calls (analysis skips non-support); 40-character transcript floor (D-044); 7-day follow-up age; opt-out through the suppression list, no sheet column | **Resolved (D-071)** |
| OD-32 greeting name | Adopted by the user and built as `greetingName()` in `src/lib/normalize.js`, tested (`tests/unit/phase3-greeting.test.js`, 7 groups). The validator harness (`tests/unit/checks.js`) now uses the same helper instead of a private copy; the Phase 2 and focused regressions are unchanged | **Resolved (D-071)** |
| Sensitive-topic path on real data | The user chose **not** to read extra transcripts: the path is verified the first time a real call is flagged in normal runs or pool building. Until then it is proven only on the synthetic case F8 and the unit tests | **Open, accepted** |

## What remains for the two deferred calls
1. Re-check the two Transcript cells on each working day with the same bounded read (cells AB15453 and AB15454, nothing else).
2. When a transcript arrives, process it as one controlled Phase 3 run: read that single transcript, analyse, generate, validate, store the draft through the write guard, and create its confidence record (`docs/confidence-artifact.md`). This reads customer data and writes to the destination, so it needs the user's explicit authorisation at that time.
3. If a transcript has not arrived by 7 Nov 2026, the call ages out. Propose a skip with a recorded reason; a new reason code must first be added to `docs/skip-reasons.md` and agreed.
4. Whatever happens, 15453 and 15454 remain excluded from the C1 pool (they are not part of the pilot).

## Notes
- The OD-32 helper returns an invalid result for a missing, lone-initial, digit-bearing or email-like name. The orchestrating run must route that call to review, never guess a greeting. The helper's output is not yet wired into the runbook prompt (`workflows/phase3-record-worker.md` still receives `greeting_name` from the session); wiring it is a small follow-up that changes a runbook and is left for the user's review.
- Remaining Phase 3 risks that are not B11: the source read-only and destination sharing settings are user-confirmed only; the retention period is undecided (consent checklist item 13).
