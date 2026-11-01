# Phase 2 — Final Policy Implementation and Regression Report

Date: 2026-11-01 (work done 2026-10-31 to 2026-11-01). Synthetic data only. Nothing committed or pushed. Phase 3 not started. Awaiting your review.

## 0. Verdict

> **Update 2026-11-01 (later, D-033):** the P2-03 expectation was narrowed on your approval and an explicit UTF-8 instruction was added to email-generation; customer-facing wording was refined. No regression runs were performed for those changes (§11).
>
> **Update 2026-11-01:** S-11 CLOSED by user decision (2026-11-01). The one failed run (P2-10, run 1: broken UTF-8 subject from the generating session's file write) is accepted as a one-off generation-session fault, not a content or ownership error. Still open and NOT decided by this closure: approval to narrow the P2-03 expectation (`must_not_include: fixed`, unchanged), and the encoding risk (the deterministic encoding check now blocks such an email; no encoding instruction was added to the skills).


- The four decisions are implemented. The ownership, grounding, intent, privacy, recording, skip, language, length and timeline checks all pass in **two of three** full runs (25/25, 25/25) and in the two individual runs (P2-03, P2-10).
- **Full run 1 has one failure: P2-10 (24/25).** Its generated email has a broken en dash in the subject ("â€“"), a text-encoding fault in the generating session's file write, not a content error. The validator flagged it informally; the harness did not check for it until I added a deterministic encoding check (an addition that exposed this failure; I did not hide it).
- **I am therefore NOT marking S-11 resolved.** Your own criterion "all expected fixtures pass consistently" has one exception. Everything specific to S-11 (ownership, grounding, no fabricated intent, no invented promise or timeline) holds in every run. Recommendation in §8.

## 1. Decisions implemented

| # | Decision | Implementation |
|---|---|---|
| 1 | Length: preferred ≤250 words; 251–350 permitted when necessary; >350 human review; never omit unresolved issues, important completed actions or pending actions to meet the limit; remove repetition/filler first | `config/email_policy.yaml` (`preferred_max_words` 250, `permitted_max_words` 350, `human_review_above_words` 350, `length_rules`); one policy file read by the generator skill, the validator skill and the deterministic checks; words = whitespace-separated tokens of the body excluding the signature (greeting, labels, list markers, URLs count); new skip code `LENGTH_REVIEW_REQUIRED` (`docs/skip-reasons.md`); deterministic codes `LENGTH_REVIEW_REQUIRED`, `LENGTH_STATUS_MISMATCH`; generator sets `length_status`; new validator code `KEY_OUTCOME_OMITTED` (an unresolved issue not stated as unresolved, or an important completed action missing) |
| 2 | P2-03 "wanted this fixed" | §2 |
| 3 | Ownership expectations | The completed-item owner in `expected.json` of P2-01, 02, 04, 05, 06, 09, 10 changed from `support` to `customer` from transcript evidence only; byte-for-byte originals kept in `tests/fixtures/_history/2026-10-31-before-ownership-update/` and each fixture's `expectation_revisions` (original, revised, reason, transcript quotes); `ownership-truth.json` now has verbatim `evidence` lines for every entry and the harness audits on every run that each line occurs verbatim in its synthetic transcript (audit passes) |
| 4 | Relative timelines against the call date | `call_date` passed into the pipeline (runbook, analysis input and output, summary, policy); analysis `timeline_reference` (`call_relative`/`fixed`); summary writes a call-anchored `timeline` and keeps the verbatim `timeline_source`; bare today/tonight/tomorrow/yesterday banned in the email (deterministic `RELATIVE_TIME_UNANCHORED`); no calendar dates; customer timing stays the customer's ("you planned to…"), never a support commitment |

## 2. Decision 2 — "wanted this fixed" (P2-03)

I read the synthetic transcript, the analysis, the summary and the email of the flagged run (round 2, run 3).

- **Transcript evidence for the customer's hope for a resolution:** `[00:03:48] Meera Testwala: Fine. I just hope it gets sorted out.` and `[00:03:05] … I need something concrete.` (plus `[00:00:12] … this is the third time I'm raising it.`).
- **In the analysis of that run:** none. The issue's `problem_statement` and every item lacked any statement of a hoped-for outcome (no "want", "hope", "sorted", "need").
- **Finding:** the customer's hope **is supported by the transcript** but was **not carried into the analysis**; the summary stage added "and you wanted this fixed" on its own. That violates the grounding rule even though the sentiment is true. The proper fix is in the analysis stage (an analysis omission), not in the summary.
- **What I did:** (a) added to the analysis skill (1.4.0) that `problem_statement` records the outcome the customer asked or hoped for **only if said**; (b) added to the validator skill (1.3.0) rule 5a: any statement about what the customer wanted, hoped, asked, expected or felt must be supported by the analysis, else `UNSUPPORTED_CLAIM`; (c) added a deterministic backstop for fabricated intent (`UNSUPPORTED_CUSTOMER_INTENT`) and a regression draft **ADV-10** (invented dissatisfaction and a wish to switch plans), which every validator and the harness rejected in all three runs.
- **The expectation was NOT changed.** `tests/fixtures/P2-03/expected.json` still has `must_not_include: "fixed"` (verified byte-identical to the preserved original). Because the claim is supported by the transcript, the branch "supported" applies: the pattern `fixed` is broader than its intent (catching "we fixed it"). **Approval requested** before narrowing it (suggested: `we (have )?fixed|has been fixed|was fixed`). In all final runs P2-03 emails say "you hope it gets sorted out" (no "fixed") and pass.

## 3. Skill versions

| Skill | Before this task | Now | Final-round changes |
|---|---|---|---|
| transcript-analysis | 1.3.1 | **1.4.0** | `call_date` in and out, `timeline_reference`, no calendar dates, `problem_statement` records a stated hoped-for outcome |
| customer-summary | 1.1.1 | **1.2.0** | call-anchored `timeline` + `timeline_source`; mapping of relative words; customer-intent statements must come from the analysis |
| email-generation | 1.2.0 | **1.3.0** | length policy 250/350/review with `length_status`; no bare relative-time words; customer timing never a commitment; example no longer says "today's call" |
| email-validation | 1.2.0 | **1.3.0** | same length policy; `KEY_OUTCOME_OMITTED`; customer-intent check (5a); relative timelines against `call_date` (5b) |

Unchanged: eligibility, delivery modes, sending behaviour, recording-link rules, privacy exclusions, existing skip reasons (one added, `LENGTH_REVIEW_REQUIRED`), the owner model of 1.3.x.

## 4. Test results

Setup: 13 synthetic fixtures (P2-01 … P2-13; P2-11 stops at eligibility), 12 adversarial drafts (the original 9 plus ADV-10 fabricated intent, ADV-11 unanchored "tomorrow" and customer step turned into ours, ADV-12 unresolved issue left unstated), each full run generated by one session and validated by a separate session; expectations as above; all earlier results preserved (`tests/results/phase2`, `phase2-proposed`, `phase2-s11`, `phase2-s11-r2`); new results in `tests/results/phase2-final/`.

**Individual runs (separate sessions, generation and validation):** P2-03 PASS (172 words, within preferred, "you hope it gets sorted out", unresolved stated, no timeline); P2-10 PASS (339 words, above preferred but permitted, every unresolved issue and pending action kept).

| Case | Run 1 | Run 2 | Run 3 | Individual |
|---|---|---|---|---|
| ADV-01 … ADV-12 (each) | PASS | PASS | PASS | n/a |
| P2-01 | PASS (147 w) | PASS (128 w) | PASS (143 w) | n/a |
| P2-02 | PASS (206 w) | PASS (180 w) | PASS (212 w) | n/a |
| P2-03 | PASS (172 w) | PASS (163 w) | PASS (158 w) | PASS (172 w) |
| P2-04 | PASS (145 w) | PASS (141 w) | PASS (146 w) | n/a |
| P2-05 | PASS (209 w) | PASS (236 w) | PASS (221 w) | n/a |
| P2-06 | PASS (227 w) | PASS (206 w) | PASS (215 w) | n/a |
| P2-07 skip | PASS | PASS | PASS | n/a |
| P2-08 no-show | PASS | PASS | PASS | n/a |
| P2-09 | PASS (157 w) | PASS (136 w) | PASS (141 w) | n/a |
| P2-10 | **FAIL** (346 w; broken UTF-8 in the subject) | PASS (335 w) | PASS (350 w) | PASS (339 w) |
| P2-11 cancelled | PASS | PASS | PASS | n/a |
| P2-12 support-performed | PASS (140 w) | PASS (105 w) | PASS (102 w) | n/a |
| P2-13 uncertain performer | PASS | PASS | PASS | n/a |
| **Passed** | **24/25** | **25/25** | **25/25** | **2/2** |

Skips stayed correct in every run (P2-07 `ANALYSIS_LOW_CONFIDENCE` or `TRANSCRIPT_INCOMPLETE`, P2-08 `CUSTOMER_NO_SHOW`, P2-11 `CALL_CANCELLED`, P2-13 `ANALYSIS_LOW_CONFIDENCE` with `ownership_review_required`). The 27 real emails of the three runs (9 per run) received 0 semantic validator issues; every one of the 36 adversarial validations (12 × 3) failed as it should, each with at least the expected code.

## 5. Required checks

| Check | Result |
|---|---|
| Correct ownership | Pass in all runs: customer-performed steps credited "you … following our guidance", support-performed (P2-12) "we", uncertain (P2-13) skipped; ownership-truth audit and truth checks pass |
| Summary grounding | Pass in all runs (validators and harness grounding checks); no `analysis_gaps` needed to rescue a claim |
| No fabricated customer intent | Pass; ADV-10 rejected 3/3; P2-03 now grounded in the analysis |
| No invented commitments or timelines | Pass; no calendar dates; no bare relative words; ADV-02, ADV-11 rejected |
| No internal-information leakage | Pass (P2-09 in all three runs; ADV-04 rejected 3/3) |
| Unresolved and pending actions | Pass; ADV-07, ADV-12 rejected; validators flagged `KEY_OUTCOME_OMITTED` in drafts that left issues unstated |
| Recording links | Pass: one URL, or Part 1/Part 2 in order (P2-06); ADV-05 rejected |
| Length policy | Pass: no email above 350; P2-10 between 335 and 350 words in all valid runs; run 3 sits exactly at 350 |
| Language and skips | Pass (English emails for Hindi/Hinglish calls; correct skip codes) |
| **Encoding** | **Fail once**: run 1, P2-10, subject contained "â€“" (see §6) |

## 6. Remaining failure and open issues

1. **P2-10, run 1: broken UTF-8 in the subject** (`FORMAT_INVALID`: "â€“" instead of "–"). The generating session wrote its file with the wrong encoding. The email text itself is correct and the validator passed its meaning. Real-world relevance: any session or helper that writes subject or body with the wrong encoding would send a garbled subject. The new deterministic check catches it and the email would be blocked.
2. **P2-10 is at the edge of the permitted band.** 335–350 words is allowed by policy, but run 3 is exactly 350. A slightly longer call would need human review (`LENGTH_REVIEW_REQUIRED`), which is the intended behaviour.
3. **Validator ambiguities** (reported by the validators, none changed the outcome): how explicit "not yet resolved" must be (all validators accepted a clearly conveyed pending action as sufficient); "You wanted …" restatements of a reported problem (accepted; only unsupported wishes such as "unhappy / switch plan / urgently / wanted this fixed" are rejected); passive completion wording that credits nobody (not flagged); imperative phrasing of a customer's own deadline ("Get your developer to add the records by Friday") instead of "You mentioned…" (accepted; the policy prefers the latter); "by Friday" is ambiguous because the call date, 2026-10-30, is itself a Friday (kept as said, no date invented).
4. **Generator ambiguities** (reported by the generation sessions): "unresolved issue vs every item exactly once" pushes generators to add a `discussed` item to carry the "not yet resolved" statement; support-raised advice has no natural issue status (`informational` used); `guided_by: "none"` as a string vs `null`; the mapping table lacks "kal tak" and "after the call" (generators paraphrased consistently); generic department names ("billing team", "technical team") are handled inconsistently; the P2-07 skip code varies between `ANALYSIS_LOW_CONFIDENCE` and `TRANSCRIPT_INCOMPLETE` (both allowed).
5. **Hindi/Hinglish relative words** ("कल", "kal", "aaj") are not caught by the English deterministic check; the policy requires English emails, and a Devanagari character in an English email is already a deterministic failure, but romanised Hindi time words would not be.
6. **P2-03 expectation:** still waiting for your approval to narrow `must_not_include: fixed` (§2).

## 7. Changes to tests and harness (disclosure)

New this task: fixtures `_history/`, `ADV-10 … ADV-12`, truth `evidence` lines and audit; harness: new policy keys, length classification, `LENGTH_STATUS_*`, `RELATIVE_TIME_UNANCHORED`, `UNSUPPORTED_CUSTOMER_INTENT`, `call_date`/`timeline_reference` checks, summary timeline checks, encoding check (added after the run 1 validator mentioned the broken subject), `legacy` mode that now judges the original results against the preserved original expectations. **Corrections I made to my own test definitions after seeing results:** (a) the P2-12 support entry in `ownership-truth.json` was widened to also match "turned it on" because the analysis wording differed from my pattern while the analysis owner (support) was correct (recorded in the file's `revisions`); (b) ADV-12's `expected_codes` was corrected before any run (the draft is long enough that no length code applies). One accident: running the legacy check overwrote `tests/results/phase2/test-results.json` with a result measured against the new expectations; I fixed legacy mode and regenerated it, and it again shows the original 19/20. No original per-case result file was altered. No existing expectation was changed except the seven approved ownership updates; P2-03's is untouched.

## 8. Can S-11 be marked resolved?

Not yet, by your own rule. The substantive defect (ownership by performer) and its companion (summary grounding, fabricated intent) are fixed and held in all runs. One run produced an email with a broken subject encoding for P2-10. Recommended next step, your decision: either (a) accept that failure as a one-off generation-session fault and close S-11, or (b) keep it open and require three further clean P2-10 runs after adding a one-line encoding instruction to the generation skill, plus your decision on narrowing the P2-03 expectation. I recommend (b), because a garbled subject would reach a customer.

## 9. Files

**Created:** `config/email_policy.yaml`, `docs/phase2-final-report.md`, `docs/phase2-s11-report.md`, `docs/phase2-plan.md`, `docs/phase2-report.md`, `docs/backup-recovery.md`, `tests/fixtures/P2-01 … P2-13/`, `tests/fixtures/_history/`, `tests/fixtures/adversarial/` (ADV-01 … ADV-12), `tests/fixtures/ownership-truth.json`, `tests/unit/checks.js`, `tests/unit/run-phase2.js`, `tests/results/**`.
**Modified (uncommitted):** the four skills; `docs/validation-rules.md`, `docs/skip-reasons.md`, `docs/decisions/decision-log.md` (D-030, D-031), `docs/open-decisions.md`, `docs/skills-runtime.md`, `docs/data-model.md`, `workflows/daily-post-call-run.md`, and the earlier D-029 documentation set (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `config/*`, `docs/architecture.md`, `docs/call-id-strategy.md`, `docs/scheduled-execution.md`, `docs/source-sheet-profile.md`, `handoff.md`, `memory.md`, `tests/README.md`, `tests/fixtures/README.md`).

## 11. Final changes, 2026-11-01 (D-033) — NOT regression-tested

**No new regression runs were performed.** By your decision the existing testing is sufficient. No test suite, individual fixture, synthetic generation, validator session or harness command was executed for these changes, and no Google Sheets, Gmail or real transcript was accessed. All earlier results under `tests/results/` are untouched. The changes below are therefore unverified by tests; they are instruction and expectation edits only.

| # | Change | Where |
|---|---|---|
| 1 | **UTF-8 protection.** email-generation instruction 13: save every written file as UTF-8, never the platform default; preserve en/em dashes, apostrophes and Unicode including Devanagari/Hinglish; re-read the saved subject and body. The deterministic encoding check (no mojibake "â€", "Ã"+continuation, no U+FFFD) already existed in `tests/unit/checks.js` (under `FORMAT_INVALID`, added after P2-10 run 1); it is now also documented in `docs/validation-rules.md` §2 and named in email-validation. The harness code was not changed. | `skills/email-generation/SKILL.md`, `skills/email-validation/SKILL.md`, `docs/validation-rules.md` |
| 2 | **P2-03 expectation.** `must_not_include` `"fixed"` replaced by `"we (have )?fixed|has been fixed|was fixed"`, with an `expectation_revisions` entry (reason and transcript quote). The original is preserved byte-for-byte in `tests/fixtures/_history/2026-10-31-before-ownership-update/P2-03.expected.json` (verified identical before editing). Unsupported claims about resolution stay rejected by the semantic validator (rules 3, 5a), by the other `must_not_include` entries ("resolved the", etc.) and by the `UNSUPPORTED_CUSTOMER_INTENT` check. P2-03 was not run again. | `tests/fixtures/P2-03/expected.json` |
| 3 | **Email language.** Natural opening paragraph; friendlier headings given as guidance, not a fixed template (e.g. "What's now working", "What we went through", "What you can do next"; the old labels remain acceptable; a "done" label only for resolved content); less repeated phrasing ("Following our guidance" at most once or twice); unresolved issues stated once, clearly, with only the facts the analysis gives; natural relative-timeline wording ("that evening" instead of "that evening, the evening of our call"); concise wording without dropping any fact. The validator was told to judge meaning, not labels. | the three skills |

Unchanged: eligibility, ownership attribution, Call ID, duplicate prevention, recording URL handling and segments, privacy exclusions, delivery modes, length policy, skip and failure codes, relative-timeline interpretation, the output schemas and `sections_included` values.

**Skill versions:** transcript-analysis 1.4.0 (unchanged), customer-summary 1.2.0 → **1.3.0**, email-generation 1.3.0 → **1.4.0**, email-validation 1.3.0 → **1.4.0** (`skill_versions` examples updated in `docs/data-model.md` and `docs/skills-runtime.md`).

**Known risks of untested changes:** the new headings and phrasing could change generated emails and fail a fixture expectation that was written for the old wording (none of the current expectations match on headings, apart from a P2-01 note that mentions "What we'll do next", which is unchanged); the UTF-8 instruction may not stop a platform write fault, which is why the deterministic check stays the safeguard. Re-test before any use beyond Phase 2.

## 12. Safety

Synthetic data only; no Gmail, no Google Sheets, no real transcripts, no spreadsheet write, no scheduled routine, no customer-facing email, no Phase 3, nothing committed or pushed. A scan found no real address, share token or secret (the only hits are reserved `@example.com` addresses and a generic `name@domain.com` in an existing doc). The generation and validation sessions were told not to read expectations and to use local files only; their tool logs were not audited line by line.
