# Phase 2 Plan and Skill Review

Status: Phase 2 authorised by the user (2026-10-31). Scope: synthetic data and dry-run only. No Gmail, no spreadsheet access of any kind, no schedule, no new service. The architecture (D-026, D-029) is unchanged.

## 1. What exists (inspected before any work)

- Four skills, read in full: `transcript-analysis` 1.2.0, `customer-summary` 1.0.0, `email-generation` 1.1.0, `email-validation` 1.1.0. They are instructions that a Claude session follows; there is no application code. Policy values were planned in `config/email_policy.yaml` (did not exist).
- Rules: `docs/validation-rules.md` (deterministic checks §2, semantic §3), `docs/pipeline.md` (eligibility E1–E18), `docs/skip-reasons.md`, catalogue `tests/evals/README.md`.
- No test framework exists. Python on this machine is only the Windows Store stub; Node.js is installed. `tests/unit/` is reserved for helpers "only if OD-38 adopts them".

## 2. Plan (smallest change that satisfies Phase 2)

1. Synthetic fixtures `tests/fixtures/P2-01 … P2-11`: `metadata.json`, `transcript.txt`, `expected.json`. Expectations are written **before** any skill runs.
2. `config/email_policy.yaml` (planned Phase 2 file).
3. Run the four skills in the documented sequence: eligibility → analysis → summary → email → validation. Each case's stage outputs are stored under `tests/results/phase2/<case>/`. Skill runs are performed by Claude sessions that read only the skill file and the labelled inputs, not `expected.json`.
4. Semantic validation by a separate session that sees only the email, analysis, summary and policy (OD-40: independence).
5. Deterministic checks (`validation-rules.md` §2) and expectation comparison implemented as a **dependency-free Node script** `tests/unit/` — a test harness, not part of the runbook. Whether the scheduled runbook may use helper scripts remains **OD-38 (open, not decided here)**.
6. Adversarial drafts (`tests/fixtures/adversarial/`) that the checks and the validator must reject.
7. Report: `docs/phase2-report.md`; update `handoff.md`, `memory.md`, `ROADMAP.md`, `tests/README.md`, `config/README.md`.

Unchanged: skills, delivery modes, eligibility rules, the source/backup decision (D-029), all safety gates.

## 3. Skill review: issues found before running (documented, skills NOT edited)

| ID | Skill / rule | Issue | Proposed handling |
|---|---|---|---|
| S-1 | `email-generation`, `customer-summary`, `transcript-analysis` | Timelines such as "tonight", "tomorrow", "kal tak" are relative to the **call day**, but emails are sent the **next day** (previous-day processing, D-013). The email example even says "today's call" and "you'd do this tonight". Copying a relative word literally can be wrong when the email is read. No `call_date` is given to the generator | Test how the generator handles it. Proposed skill change (needs approval): pass `call_date`; require relative words to stay attributed to the call ("as you mentioned on the call") and never convert them to a calendar date not in the transcript |
| S-2 | `transcript-analysis` | No field marks staff-only remarks (internal ticket IDs, internal tool names, blame, plan labels) in the transcript. Exclusion relies on the summary/generation rules and the validator. The analysis rule "exclude small talk" does not name internal remarks | Test (P2-09). Proposed: add an explicit analysis rule "omit staff-only remarks from all fields" |
| S-3 | `customer-summary` | Instruction table says `discussed` items may be omitted "if not useful", while the edge-case table says an unresolved discussed issue must be shown honestly | Test (P2-03, P2-10). Proposed: state that `discussed` items of an unresolved issue are never omitted |
| S-4 | Validation | `email-validation` says deterministic checks are done "in code", but no code exists (D-026) | Phase 2 adds a test harness only. Runtime use is OD-38 |
| S-5 | `email-generation` | Hindi/Hinglish calls produce an English email (`policy.language` = en). OD-08 open | Follow current MVP policy; recorded as a limitation |
| S-6 | `email-generation` vs policy | `max_words` 250 and "never drop pending items" can conflict on long calls | Test (P2-10). Proposed policy decision (OD-09) if it conflicts |
| S-7 | `customer-summary` | "Do not mention internal team names": "technical team", "billing team", "product team" appear in transcripts. The skill does not say whether generic department names are allowed | Treat generic "our technical/billing team" as allowed (customer-facing wording used on the call); flag for confirmation |
| S-8 | `transcript-analysis` | Customer commitment vs courtesy: "I'll think about it", "I'll try it later" are not commitments. Rule 6 covers "I'll try that later" as `pending_customer_action`, which conflicts with the P2-10 expectation | Test (P2-10). Note the rule 51 vs Example B ("Got it" is acknowledgement) tension |
| S-9 | Skills overall | The pipeline stops on `skip: true`, but summary/generation have no input for `call_date` or the Meeting Notes (OD-30) | Recorded only |

### 3a. Issues found while running (first run, 2026-10-31)

| ID | Skill / rule | Finding | Evidence |
|---|---|---|---|
| S-10 | `customer-summary`, `email-generation` | The generator re-anchored relative timelines to the call ("the morning after our call", "that night, the night of our call", "by the day after our call") while analysis kept the verbatim words. The independent validator accepted these as the same meaning. This is a judgement the skills do not authorise or forbid ("never add or shorten a timeline") | P2-02, P2-04, P2-05 |
| **S-11** | `transcript-analysis` rule 7 vs `email-validation` rule 4 | **Defect.** Rule 7 fixes `owner` to `support` for every `completed` item, even when the **customer** performed the action (clicked, pasted, saved) under guidance. A faithful email then says "you added…", which the validator flags `OWNER_MISATTRIBUTED`; an email that follows the analysis literally says "we added…", which is untrue. Result: P2-06 FAILS validation in the first run. Other cases hide the problem by wording ("we switched on…", "we removed the old records…" for steps the customer carried out) | P2-06 (FAIL); P2-01, P2-02 wording |
| S-12 | `email-generation` rule 11 | The skill does not say whether greeting, labels, list markers and URLs count toward `min_words`/`max_words`. P2-10 is exactly 250 words by the generator's count (about 242 without URLs) | P2-10 |
| S-13 | `transcript-analysis` rule 9 / OD-11 | Borderline sensitive topics (missed leads for three days, wrong GST company name, a customer who "lost students' trust") were not flagged. With the sensitive-topic policy unset, the right answer is unknowable | P2-03, P2-05, P2-09 |
| S-14 | `customer-summary` / `email-generation` | Handling of generic department names ("billing team", "technical team", "product team") and of internal tool names said aloud to the customer is inconsistent between cases (kept in P2-03, P2-10; dropped in P2-05, P2-09) | P2-03, P2-05, P2-09, P2-10 |
| S-15 | `transcript-analysis` | Unspecified: `issues` granularity, `language` for Romanised Hindi, whether generic "Speaker 1/2" labels count as labelled, what `issues`/`items` hold on a skip, sentiment when the call starts frustrated and ends positive, whether a courtesy such as "I'll try it later" is a pending customer action (rule 7 yes, Example B tension) | P2-02, P2-05, P2-07, P2-10 |

**Final update (2026-11-01, D-031, `docs/phase2-final-report.md`):** S-1 (relative timelines), S-6/S-12 (length policy and word-count convention) and the P2-03 intent wording are addressed by policy and skill changes and regression-tested; S-11 was closed by user decision on 2026-11-01 (D-032) despite one failed run (broken UTF-8 subject in P2-10, run 1, accepted as a one-off).`n`n**Update (S-11 correction task, `docs/phase2-s11-report.md`, D-030):** a corrected version of the fix below (different wording, plus summary grounding) was applied to the skills and regression-tested over two rounds of three runs. Status: fix verified in tests, S-11 **not closed** (P2-10 length, one borderline P2-03 email, expectation approvals pending). The paragraph below describes the earlier experiment only.

**Proposed fix for S-11 (earlier experiment; not what was finally applied):** in `transcript-analysis` rule 7 the owner of a `completed` item is whoever performed the action (`customer` or `support`); `customer-summary`, `email-generation` and `email-validation` credit "you" or "we" by that owner. The proposal was tested on patched **copies** of the skills (outside the repository) for P2-06, P2-01, P2-02 and P2-09; results are in `tests/results/phase2-proposed/` and `docs/phase2-report.md`. The real skill files and their versions are unchanged.

No skill file is modified in this phase unless a failing test proves a defect, and then only after the change is documented here.
