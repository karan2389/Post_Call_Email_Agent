# Phase 2 — S-11 Correction and Regression Report

> **Superseded by docs/phase2-final-report.md** (final policy decisions, ownership expectations, call-date timelines and the last regression with three further runs). This report describes the two earlier rounds.

Date: 2026-10-31. Scope: synthetic data only. Nothing committed or pushed. Phase 3 not started.

## 0. Verdict

- The ownership defect (S-11) and the summary-grounding defect are fixed **in the tests**: in all three round-2 runs every completed action is credited to the party who performed it (customer-performed, support-performed and not-established cases all correct), no owner misattribution, no unsupported summary claim, no internal-information leak, no invented promise or timeline was found by the validators or the harness, and all 27 adversarial validations (9 drafts × 3 runs) were rejected.
- **The regression suite does not fully pass**, so **S-11 is not marked resolved.** Two failures remain: P2-10 exceeds the 250-word limit in all six runs (a policy conflict, S-6, worsened by the new rules), and one P2-03 email in round 2 contains "wanted this fixed", which is not in the analysis (borderline: the validator passed it; an unedited expectation flags it).
- Status recorded as **"fix verified in tests; closure awaiting your decisions on the exceptions in §6"** (decision log D-030).

## 1. Root cause

**S-11 (ownership).** `transcript-analysis` rule 7 fixed `owner: support` for every `completed` item, "support's explanations/completions", even when the customer performed the step under guidance. The later stages inherited that field, so a faithful email ("you added…") contradicted the analysis, and an email that followed the analysis ("we added…") was untrue. The validator's own rule 4 had no way to decide. P2-06 failed validation for this reason; several other emails passed only because their wording hid the problem.

**Summary grounding (P2-02 regression).** Two causes. (a) Analysis stage: an issue had only a short `title`; the customer's symptom ("site can't be reached") was not in the analysis, so a later stage could only get it from the transcript. (b) Summary stage: the skill said the transcript is not provided, but nothing said what to do when it is visible in the same session (OD-40 means it always is), and there was no grounding rule, no place to report a gap, and `call_purpose` had no cited source.

## 2. Exact skill changes

| Skill | Change |
|---|---|
| `transcript-analysis` | Rule 7: `owner` of a `completed` item is who **performed** the action (`customer`, `support`, `uncertain`); guidance is not performing; new item field `guided_by` (`support`/`none` for completed, `null` otherwise); new rules "Ownership of completed actions" (customer clicks/enters/saves/configures → customer; support does it itself → support; support only observing is not performing; two performers → two items; unestablished → `uncertain`, low confidence, never guess; neutral description) and "Completeness for later stages"; issues get `problem_statement` (symptom/error as said); `ownership_review_required`; a main-outcome `uncertain` completed item skips with the **existing** code `ANALYSIS_LOW_CONFIDENCE`; Example A and Edge Cases updated; round 2: `stated_timeline` copied exactly as spoken (no translation, gloss or annotation; "later" is not a timeline) |
| `customer-summary` | `completed` entries credit the item's owner ("you"/"we"; neutral for `uncertain`); grounding rule (every statement and the `call_purpose` traceable to cited items/issues, no inferred causes or outcomes, uncertainty preserved); `call_purpose_issue_ids`; `analysis_gaps` for omissions (reported, never filled from the transcript); round 2: merge only items with identical `stated_timeline`, `null` timeline means no time wording, unresolved/partially resolved issues stated as not yet resolved |
| `email-generation` | Resolved statements credit the performer named in the summary; opening sentence restates `call_purpose` only; example updated |
| `email-validation` | Rule 4 checks `completed` items against `owner` (guidance is not performance; `uncertain` must not be credited); opening purpose sentence maps to issues; details absent from the analysis are `UNSUPPORTED_CLAIM`; Example 4 |

Not changed: eligibility, delivery modes, sending behaviour, recording-link requirements, privacy and internal-information exclusions, unresolved-issue handling (round 2 restores its explicit statement), skip reasons (no new codes), issue codes (no new codes).

## 3. Version changes

| Skill | Before | After |
|---|---|---|
| transcript-analysis | 1.2.0 | **1.3.1** (1.3.0 schema/rules, 1.3.1 timeline wording) |
| customer-summary | 1.0.0 | **1.1.1** (1.1.0 ownership/grounding, 1.1.1 merge/timeline/unresolved wording) |
| email-generation | 1.1.0 | **1.2.0** |
| email-validation | 1.1.0 | **1.2.0** |

Round 1 ran on 1.3.0 / 1.1.0 / 1.2.0 / 1.2.0; round 2 on 1.3.1 / 1.1.1 / 1.2.0 / 1.2.0.

## 4. Test results

New coverage fixtures (added, not replacing any): **P2-12** (support performs one action, customer another) and **P2-13** (performer not established). `tests/fixtures/ownership-truth.json` (new) records who really performed each completed action. Existing expected.json files were **not edited** in this task.

**First test** (round 1, run 1, priority cases): P2-06, P2-09, P2-02, P2-01 — **4/4 pass**, independently validated: P2-06 PASS (the previous FAIL), P2-02 PASS (no unsupported claim), P2-09 no leak, P2-01 PASS.

**Full suite** — 11 original + 2 new fixtures + 9 adversarial drafts, three independent runs per round (each run: separate generation session; separate validation session). Results are stored apart from the originals (`tests/results/phase2` = original, `phase2-s11/run1..3` = round 1, `phase2-s11-r2/run1..3` = round 2).

| Case | Original | R1 run 1 | R1 run 2 | R1 run 3 | R2 run 1 | R2 run 2 | R2 run 3 |
|---|---|---|---|---|---|---|---|
| ADV-01 … ADV-09 (each) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-01 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-02 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-03 | PASS | PASS | FAIL | FAIL | PASS | PASS | FAIL |
| P2-04 | PASS | FAIL | PASS | PASS | PASS | PASS | PASS |
| P2-05 | PASS | FAIL | PASS | PASS | PASS | PASS | PASS |
| P2-06 | **FAIL** | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-07 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-08 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-09 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-10 | PASS | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| P2-11 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-12 | n/a | PASS | PASS | PASS | PASS | PASS | PASS |
| P2-13 | n/a | PASS | PASS | PASS | PASS | PASS | PASS |
| **Passed** | 19/20 | 19/22 | 20/22 | 20/22 | **21/22** | **21/22** | **20/22** |

Skip cases stayed correctly skipped in every run (P2-07 skipped with `ANALYSIS_LOW_CONFIDENCE` or `TRANSCRIPT_INCOMPLETE`, both allowed; P2-08 `CUSTOMER_NO_SHOW`; P2-11 `CALL_CANCELLED` at eligibility; P2-13 skipped with `ANALYSIS_LOW_CONFIDENCE` and `ownership_review_required: true` in all six runs). P2-12 credited support ("we") for the support-performed step and the customer ("you") for the customer-performed step in all six runs.

**Round 1 failures and what they led to:** P2-03 (runs 2, 3): the email no longer said the issue was unresolved (the grounding rule had made the summary drop it) → round 2 rule "unresolved issues stay visible". P2-04/05 (run 1): the analysis `stated_timeline` was glossed ("कल सुबह (the morning after the call)"), breaking the verbatim rule → round 2 clarification. P2-10: merged summary entries gave one timeline to items with different timelines ("by Friday" attached to a step that had none) → round 2 merge rule.

## 5. Remaining failures

1. **P2-10 length, all six runs** (round 2: 353 / 386 / 413 words by the harness count; limit 250). Cause: `max_words` 250 vs "never drop pending items" with eight topics (S-6, OD-09). The original run only fit at exactly 250 by compressing; the stricter grounding/unresolved rules make the emails longer. I did not drop items or change the limit. Needs your decision (for example: allow omitting `explained` items first, raise the limit for long calls, or split into two emails).
2. **P2-03, round 2 run 3**: the opening says the customer "wanted this fixed". The analysis does not say that. The validator passed it as a trivial restatement; the unedited expectation `must_not_include: fixed` flags it. The expectation pattern is broader than its intent (it should catch "we fixed"); I did not change it. Request: approve narrowing it, or decide that restated desires must be grounded.
3. **Expectation conflicts, not edited, approval requested:** `expected.json` for P2-01, P2-02, P2-04, P2-05, P2-06, P2-09 and P2-10 name `support` as the owner of completed items. Under the corrected rule those items are customer-performed (evidence: `ownership-truth.json`, with transcript quotes). The harness reports them as conflicts and judges ownership against the truth file instead. These expectations encode the S-11 defect and should be updated once you approve.

## 6. Other observations (open, not fixed)

- **S-1 relative timelines are still undecided.** Summaries and emails paraphrase "kal tak", "tonight", "tomorrow morning" into "by the day after our call", "the night of our call" etc.; validators accepted this. Because the email is sent the next day, a literal "tomorrow" would mislead. Needs a policy and a `call_date` input.
- Validators repeatedly noted borderline passes: opening sentences saying the customer "wanted" something that the `problem_statement` does not literally say (P2-03, P2-05, P2-09), "eight topics" (P2-10), and passive phrasing that credits nobody (flagged only in drafts).
- Heuristic (non-failing) warnings: transcript words in summaries but not in the analysis (`because`, `confirm`, `please`, `layout`, `invoice`), and the repeated word "this this week" in P2-06 (from the "you mentioned you would do this" + "this week" pattern).
- Round 1 runs produced `guided_by: "none"` as a string for support-performed items; accepted by the checks, a strict schema validator would want a consistent value.
- Run-to-run variation remains (for example P2-07 skip code, issue splits), as expected from model sessions.

## 7. Changes made to tests during this task (disclosure)

New: fixtures P2-12, P2-13; `ownership-truth.json`. Harness (`tests/unit`): ownership-truth check, summary grounding/credit check, owner rule for the new schema, expectation-conflict reporting, issue-status matching broadened to problem statement and item text, Hindi/Hinglish time-word translation map for the time-word heuristic, `legacy` mode that re-checks the original results, a readability warning, partial-results file. The P2-12 truth entry was revised twice after round 1 (first exclusion too broad; then pattern changed) because the analysis owner was right in all three round-1 runs and the test pattern was wrong. The original results summary `tests/results/phase2/test-results.json` was regenerated by the legacy mode (same 19/20 content); original result folders are untouched.

## 8. Can S-11 genuinely be marked resolved?

**Not yet.** The ownership defect is demonstrably fixed on every case the suite covers (customer-performed, support-performed, uncertain), and summary grounding held in three independent round-2 runs. But your acceptance criterion "all expected eligible emails must pass validation" is not met because of P2-10 (policy conflict, not ownership) and one borderline P2-03 email. Recommended: approve (1) a length policy for long calls, (2) the narrowed P2-03 expectation and the owner-expectation updates, then re-run P2-10, P2-03 and the full suite once; close S-11 only after a clean pass.

## 9. Safety

No Gmail, no Google Sheets, no real customer data or transcripts, no scheduled routine, no new service; only synthetic fixtures and local files; no commit or push. Generation and validation ran in separate sessions that were told not to read expected outcomes; their reports state local file access only (their tool logs were not audited line by line).
