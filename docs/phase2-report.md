# Phase 2 Completion Report — Transcript Processing and Email Generation

Date: 2026-10-31. Scope: synthetic data, dry run only. Status: **NOT complete. One scenario fails semantic validation (P2-06, skill defect S-11) and a proposed fix is only partly confirmed.** Awaiting your review. Nothing was committed or pushed.

> **Update:** this report describes the first run. The S-11 correction that followed changed the four skills (new versions) and added regression results; see `docs/phase2-s11-report.md` and D-030. Statements below that "the skills are unchanged" refer to the time of this first run.

## 0. Verdict in four lines

- 11 synthetic fixtures and 9 adversarial drafts were run through eligibility → analysis → summary → email → validation. Harness result: **19 of 20 pass**.
- 8 emails were generated. **7 passed** both the deterministic checks and an independent semantic validation. **1 failed** (P2-06, `OWNER_MISATTRIBUTED`). That failure was not hidden or revised away.
- All 9 adversarial drafts (status upgrade, invented timeline, owner swap, internal leak, missing/segment-mislabelled recording, off-topic/invented promise, omitted pending action, placeholder/contact/banned phrase/signature, wrong language) were rejected.
- A proposed skill patch for the P2-06 defect was tested on copies only: it fixed P2-06 and P2-09, but P2-02 then failed validation and P2-01 diverged from its expectation. The fix is **not** proven; the skills in `skills/` are unchanged.

## 1. Files created

| Path | Purpose |
|---|---|
| `docs/phase2-plan.md` | Short plan and skill review (S-1 … S-15) |
| `docs/phase2-report.md` | This report |
| `config/email_policy.yaml` | Email policy shared by generation, validation and the checks (limits are proposals, OD-09) |
| `tests/fixtures/P2-01 … P2-11/` | `metadata.json`, `transcript.txt`, `expected.json` per scenario (synthetic; expectations written before any skill ran) |
| `tests/fixtures/adversarial/ADV-01 … ADV-09.json` | Deliberately flawed drafts with expected codes |
| `tests/results/phase2/<case>/` | Stage outputs: `analysis.json`, `summary.json`, `email.json`, `email.txt`, `validation.json` |
| `tests/results/phase2/adversarial/ADV-xx.validation.json` | Semantic validator verdicts on the flawed drafts |
| `tests/results/phase2/test-results.json` | Harness output |
| `tests/results/phase2-proposed/{P2-06,P2-01,P2-02,P2-09}/` | Outputs of the S-11 patch experiment (patched skill copies, not the repository skills) |
| `tests/unit/checks.js`, `tests/unit/run-phase2.js` | Dependency-free Node test harness: eligibility E1/E2/E5–E9/E11/E16, deterministic checks (validation-rules §2), structural checks of analysis and summary, expectation comparison |

Run: `node tests/unit/run-phase2.js` (exit code 1 on any failure).

## 2. Files modified

None of the four skills, no workflow, no delivery or eligibility rule. Existing documentation updated to record this phase: `handoff.md`, `memory.md`, `ROADMAP.md`, `tests/README.md`, `config/README.md`, `tests/fixtures/README.md`. (Files modified earlier in the session by the D-029 task are listed in `handoff.md`; they are also uncommitted.)

## 3. Skills used

`transcript-analysis` 1.2.0, `customer-summary` 1.0.0, `email-generation` 1.1.0, `email-validation` 1.1.0, read in full and followed as written. Each stage was run by a fresh Claude session that saw only the skill and the labelled inputs (not `expected.json`). Semantic validation was run by **separate** sessions that saw only the email, analysis, summary, policy and recording count (OD-40 independence). Patched copies were used only for the S-11 experiment.

## 4. Scenario results

| # | Scenario | Eligibility | Analysis | Email | Validation | Harness |
|---|---|---|---|---|---|---|
| P2-01 | Normal, resolved | ELIGIBLE | 3 items, positive | generated, 129 w | PASS | PASS |
| P2-02 | Complex troubleshooting | ELIGIBLE | 4 items | generated, 141 w | PASS | PASS (expectation revised, §6) |
| P2-03 | Unresolved at end | ELIGIBLE | 1 issue unresolved, no timeline, frustrated | generated, 151 w | PASS | PASS |
| P2-04 | Hindi (Devanagari) | ELIGIBLE | `hi`, quotes in Hindi | English email, 134 w | PASS | PASS |
| P2-05 | Hinglish | ELIGIBLE | `mixed`, 4 items | English email, 167 w | PASS | PASS |
| P2-06 | Two recording segments | ELIGIBLE | one call, timestamp restart not "incomplete" | one email, Part 1/Part 2 in order, 173 w | **FAIL** `OWNER_MISATTRIBUTED` ×2 | **FAIL** (see S-11) |
| P2-07 | Ambiguous context | ELIGIBLE | skip `ANALYSIS_LOW_CONFIDENCE` | none (correct) | n/a | PASS |
| P2-08 | No-show | SKIP `CUSTOMER_NO_SHOW` (E2) | safeguard run: skip `CUSTOMER_NO_SHOW` | none | n/a | PASS |
| P2-09 | Internal-only information | ELIGIBLE | no staff-only remark in any field | generated, 111 w, no leak | PASS | PASS |
| P2-10 | Long, 6 issues | ELIGIBLE | 11 items, 8 issues | generated, 250 w (at the limit) | PASS | PASS (expectation revised, §6) |
| P2-11 | Cancelled (added) | SKIP `CALL_CANCELLED` (E1) | not run | none | n/a | PASS |
| ADV-01 … 09 | Flawed drafts | n/a | n/a | n/a | all rejected | 9/9 PASS |

Deterministic checks (recording URLs present once, in order, `Part n` labels; name; subject; length; placeholders; banned phrases; contacts; links; signature; format; pending-item cross-reference; time words): no deterministic issue on any of the 8 real emails. The harness raised the expected deterministic codes on ADV-02, ADV-05, ADV-07, ADV-08.

What the passing cases demonstrate: statuses preserved (explained ≠ completed); pending items kept with the right owner and no invented timeline; unresolved issue stated honestly with the customer's frustration acknowledged once; staff-only remarks, tracker ID, engineer name and internal tool name absent from analysis, summary and email; the promised tax guide has no invented link; the unavailable quiz generator is not promised; one email for two recordings; Hindi and Hinglish handled with an English email.

## 5. Findings (documented in `docs/phase2-plan.md` §3 and §3a)

**S-11 (defect, blocking P2-06).** `transcript-analysis` rule 7 sets `owner: support` for every `completed` item, even when the customer performed the step. A faithful email says "you added…" and the validator rightly flags it; an email that follows the analysis says "we added…", which is untrue. Several passing emails hide this by wording ("we switched on…", "we removed the old records…" for steps the customer carried out).

**S-11 experiment.** Patch (on copies): the owner of a `completed` item is whoever performed it; summary, generation and validation credit "you"/"we" by that owner. Results on the four re-run cases: P2-06 PASS, P2-09 PASS; **P2-02 FAIL** (`UNSUPPORTED_CLAIM`: the summary added the "site can't be reached" detail, which is not in the analysis, a separate summary-stage slip); **P2-01** diverged (the explained sender-name item was merged into the customer's pending step, so one expectation was not met). The patch removes the ownership defect but does not by itself make the pipeline stable.

**Other findings:** S-10 relative timelines re-anchored ("the morning after our call") and accepted by the validator; S-12 word-count convention unspecified (P2-10 sits at exactly 250 including labels, URLs and list markers); S-13 borderline sensitive topics unflagged while OD-11 is undecided; S-14 inconsistent handling of generic department names and spoken tool names; S-15 unspecified details (issue granularity, language label for Romanised Hindi, generic speaker labels, courtesy statements such as "I'll try it later"); plus S-1 … S-9 identified before running.

## 6. Expectation revisions (transparency)

Three expectations were changed after the first run, each recorded in the fixture's `expectation_revisions` with original value and reason: P2-02 (literal "tomorrow morning" → "morning"), P2-06 (issue count 2–3 → 2–5), P2-10 (coupon item `explained`, export item `pending_customer_action`, which is what rule 7 literally says). The P2-06 semantic failure was **not** revised away. These revisions were made with hindsight; a reviewer may want to confirm them.

## 7. Limitations

- Each stage ran **once** per case. The skills' own criterion "faithful drafts return PASS consistently across repeated runs" is untested, and the patch experiment shows run-to-run variation.
- The generating and validating sessions are the same model family. The validator is independent of the generator's context but not of its blind spots.
- Analysis quality is checked by the harness (verbatim evidence, categories, owners, timelines, summary placement) and by expectations, not by a human reading every transcript.
- Not covered: prompt injection (EV-29), sensitive-topic policy, truncated and 50,000-character transcripts, three or more segments, Meeting Notes as extra context (OD-30), real-data quirks (names in capitals, whitespace-only cells), usage per call (R-09), and the scheduled/cloud run itself.
- The harness's time-word check is a heuristic; the real runbook still has no deterministic engine (OD-38).
- Email language is English by policy (OD-08), including for Hindi calls; the quality of that email for a Hindi-speaking customer is a business decision, not tested.

## 8. Business-rule conflicts and unresolved issues

1. S-11 owner of `completed` items (needs a decision and a patch of up to four skills, then repeated-run tests).
2. S-1/S-10 relative timelines vs next-day sending (needs `call_date` input and a policy decision).
3. `max_words` 250 vs "never drop pending items" (S-6/S-12, OD-09): P2-10 only just fits.
4. OD-08 (language), OD-09 (format/length/signature), OD-11 (sensitive topics), OD-38 (helpers), OD-40 (validator independence) remain open. No delivery or eligibility business rule was changed.
5. The deterministic checks exist only in the test harness. Whether the runbook may use a helper script is OD-38 and was **not** decided.

## 9. Safety restrictions

Respected, per the evidence available: no Gmail tool, send or draft; no Google Sheets access of any kind in this phase; no real transcript or customer data (all names, `@example.com` addresses, fake Fathom URLs `EXAMPLE-…`; a scan found no other address or share token); nothing written to the original or backup spreadsheet, columns `Transcript`/`AI Summary`/AD untouched; no scheduled routine created or enabled and the existing disabled routine was not touched; no tracking worksheet; no new API, paid service or backend (the harness is a local, dependency-free Node script); the four skills and the delivery/eligibility rules are unchanged; internal columns in `P2-09/metadata.json` were never given to any skill. The sub-sessions that ran the stages had general tool access; their reports state they used only local file reads and writes, and I did not audit their tool logs line by line.

## 10. Recommendation for the next step

Do **not** start Phase 3 yet. In order: (1) decide S-11 and approve a patch of the skills (version bumps), then re-run all fixtures at least three times each and require stable PASS; (2) decide S-1 (`call_date`, relative-time wording), S-6/S-12 (word-count convention and limit), S-14 and the open ODs above; (3) add the uncovered scenarios (injection, sensitive topic, truncated transcript, three segments); (4) only then proceed to Phase 3 (test copy of the spreadsheet), which needs your explicit approval.
