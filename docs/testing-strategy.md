# Testing Strategy

Status: **Approved design.** All test data is synthetic.

## 1. Layers

| Layer | Location | Network | When | Purpose |
|---|---|---|---|---|
| Unit | `tests/unit/` | None | Every change | Target-date calculation, call-date parsing, work-queue selection, eligibility (ELIGIBLE/DEFER/SKIP), Call ID, fingerprint, duplicates, state transitions, leases, retry policy, deterministic validation, skill loader, config |
| Contract | `tests/unit/` | None | Every change | Skill output JSON schemas; models parse example outputs from each SKILL.md |
| Recovery simulation | `tests/unit/` | None (fakes) | Every change | Crashes and partial failures at every state boundary; Gmail success + tracking failure |
| Evaluation | `tests/evals/` | Anthropic API | On demand / before skill or model changes | Quality and safety of the LLM pipeline against synthetic transcripts |
| Integration | `tests/integration/` | Test spreadsheet, test mailbox | Phase 3+ | Real Sheets/Gmail behaviour with synthetic data and allowlisted recipients |

Unit and contract tests must never call external services. Evaluation and integration tests are opt-in (e.g. a pytest marker) and never run against real customer data.

## 2. Fakes

- `FixedClock` — injectable "now" in any timezone; **no test may depend on the machine clock or the machine timezone**. Tests run under a non-IST process timezone (e.g. `TZ=UTC`, `TZ=America/New_York`) to prove the code ignores it.
- `FakeSourceSheet` (rows can change between simulated runs, e.g. a transcript appears), `FakeTrackingStore` (with injectable write failures)
- `FakeLlmClient` (returns recorded or scripted JSON per stage)
- `FakeGmail` (records sends; can succeed-then-lose-response; supports `rfc822msgid` search)

## 3. Evaluation suite

The case catalogue is in `tests/evals/README.md`. Each case has a synthetic fixture (transcript + metadata) and expected results:

- final `status` and `reason_code`;
- expected item categories (e.g. "item about DNS must be `pending_customer_action`");
- must-include and must-not-include assertions on the email;
- expected validation outcome, including **adversarial drafts** that the validator must reject.

Scoring:

- **Safety cases** (must skip, must reject an unsafe draft): 100% required. Any unsafe email passing is a release blocker.
- **Quality cases**: pass-rate threshold agreed with the support team in Phase 2.
- LLM outputs vary; each case runs N times (proposal: 3) and must pass every time for safety cases.

## 4. Recovery scenarios (must be covered)

1. Crash in `PROCESSING` → lease expiry → `PENDING` → processed once.
2. Crash in `VALIDATING` → same.
3. Write-ahead (`SENDING`) write fails → no send.
4. Gmail accepts, `SENT` write fails → next run reconciles → `SENT`, one email total.
5. Gmail response lost (timeout after acceptance) → reconcile finds it → `SENT`.
6. Gmail did not accept and search finds nothing → `SEND_UNCONFIRMED`, no resend.
7. Two overlapping runs → only one holds the lease; one email.
8. Same call pasted twice → `DUPLICATE_SOURCE_ROW`.
9. Source rows re-sorted between runs → no duplicates, no mis-association.
10. Retryable failure three times → `RETRY_LIMIT_EXCEEDED`.

## 5. Previous-day selection and deferral scenarios (must be covered)

Multi-run simulations with `FixedClock` and a mutable `FakeSourceSheet` (cases EV-49 … EV-67 in `tests/evals/README.md`):

1. Target date is yesterday in Asia/Kolkata, at every hour of the day, including runs between 00:00 and 05:30 IST when the UTC date differs.
2. Calls at 00:00:00 and 23:59:59 IST on the target date are included; today's and future calls are excluded.
3. Missing transcript → `PENDING` (`MISSING_TRANSCRIPT`) → transcript added → next run sends exactly one email.
4. Transcript never arrives → `SKIPPED` `MISSING_TRANSCRIPT` after `pending_until`.
5. Cancelled and no-show calls never produce an email.
6. One record raising an exception does not prevent the others from being sent.
7. Job run twice (and three times) on the same day → identical final state, one email per call.
8. Missed day → lookback (or manual `TARGET_DATE`) processes it once.
9. Date parsing: serial numbers, ISO strings, offsets, ambiguous `03/04/2026` text rejected.

## 6. Synthetic data rules

See `tests/fixtures/README.md`. Fake names, `@example.com` addresses, fake Fathom URLs on a clearly fake path, no real customer content, no real staff names unless approved.
