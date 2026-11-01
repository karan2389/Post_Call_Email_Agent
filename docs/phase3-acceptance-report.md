# Phase 3 — Controlled Dry Run and Acceptance Report

Date: 2026-11-01. Real data, no customer information recorded here (counts, row references, codes only). **Verdict: Phase 3 is PARTIALLY COMPLETE.** The pipeline works end to end and one validated draft is stored, but the completion criteria are not all met (section 4). Nothing was sent; Phase 4 has not started.

## 1. What was built and set up (Stages 1–2)

- **Helpers (OD-38 approved, D-039):** `src/p3.js` and `src/lib/{normalize,eligibility,destination,policy}.js`: date/time normalisation (`October 31, 2026` and `06:00 PM`/`8:30 AM` to `YYYY-MM-DD` / 24-hour `HH:MM`), fingerprint, SHA-256, eligibility E1–E18 in two steps, the 21-column row builder with the storage rules, the header check, and the idempotent write plan with collision handling. `tests/unit/phase3.test.js`: 19 synthetic test groups, all passed (one run).
- **Runbook:** a Phase 3 manual-run section in `workflows/daily-post-call-run.md`.
- **Decisions recorded:** D-039 (helpers, OD-11 sensitive topics = `REVIEW_REQUIRED`, security gates, setup). OD-04 (Fathom links viewable without login) confirmed by the user in chat.
- **Security gates:** the user confirmed in chat that the connector account is Viewer on the source (or an equivalent restriction exists) and that `Phase 3 Emails` is shared only with named support leads with link sharing off. **The agent cannot verify either**; both are recorded as user-confirmed.
- **Destination setup (done once):** destination re-read (empty); columns A, B, F, O, P, Q set to plain text; row 1 frozen; the 21 headers written to `Sheet1!A1:U1`; read-back exact (`check-headers` ok). `headers_verified: true`.

## 2. Dry-run results (Stage 3)

Target date 2026-10-31 (Asia/Kolkata), previous day only, cap three eligible calls. Source window read: 106 rows of column A (coverage check passed: earliest date 2026-10-22).

| Measure | Count |
|---|---|
| Source records for the target date | 6 |
| Preliminary-eligible (prelim) | 4 |
| Skipped before any transcript read (`CUSTOMER_NO_SHOW`, E2; also no recording URL) | 2 |
| Transcripts read | 4 (one cell each) |
| Empty transcripts, deferred (`MISSING_TRANSCRIPT`, E11) | 2 |
| Analysed | 2 |
| Skipped by the analysis (`ANALYSIS_LOW_CONFIDENCE`, transcript largely garbled) | 1 |
| Email generated, deterministic checks clean, independent validator PASS | 1 |
| Drafts stored (`PASSED` + `DRAFT_READY`) | **1** |
| Review-required (sensitive topic or ownership uncertainty) | 0 |
| Failed validation | 0 |
| Fingerprint collisions | 0 |
| Records missing a recording URL | 2 (the two no-shows) |
| Rows written to the draft sheet | 6 (1 draft, 3 skipped, 2 deferred); read back and matched |

Notes:
- The third eligible call was replaced by the next eligible record after the first one returned an empty transcript; two further empty transcripts then appeared. The two deferred rows will be picked up on a later run (source calls were made hours after the evening calls, before transcript automation had filled them, OD-33).
- The helper's preliminary check was given shortened `Meeting Notes` text (the agent had read the full notes and saw no cancel or no-show phrase beyond the two `customer not came` rows). Only column AB was read for transcripts; no other column.
- Customer names were title-cased for greetings per the OD-32 recommendation (still an open decision).
- Workers read transcripts themselves through read-only `get_values`, wrote a temporary file outside the repository and deleted it; no spill files remain.

**Idempotency (selection and duplicate planning, no appends):** the same six records planned against the stored sheet give `NOOP_ALREADY_PROCESSED` (stored draft), `NOOP_TERMINAL` (3 skipped) and `PROCESS_UPDATE` in place (2 deferred); no `PROCESS_NEW`, no duplicate row, no overwrite of the stored email body. Collision write behaviour was **not** exercised on real data (no collision occurred) and no synthetic collision test copy was created; it is covered only by the synthetic unit tests.

## 3. Quality review (Stage 3C)

- Drafts reviewed by a human against the actual transcript: **0.** Drafts approved by a human: **0.** I do not claim quality approval.
- Machine checks on the one stored draft: deterministic checks clean (URL equals the sheet value, greeting, signature, 234 words, encoding); independent validator (separate session) PASS with every statement mapped.
- Points for the human reviewer of the stored draft (source row 15451): the transcript captured only the support speaker, so customer-side actions rest on support's spoken confirmations; only the affiliate-link step is claimed as done; "This part is still open" appears twice; a support remark about helping with a Meta conversion API setup was judged ambiguous and left out (a follow-up may have been intended); the greeting name is title-cased.
- The skipped garbled call (row 15450): the analysis left `sensitive_topics` empty although a credentials mismatch was mentioned; a reviewer may disagree.
- No sensitive-topic case occurred, so the `REVIEW_REQUIRED` path was **not** exercised on real data.

## 4. Completion criteria

| Criterion | Status |
|---|---|
| Real source data processed successfully | Met (6 records, 4 transcripts read) |
| Drafts generated and validated | Met for 1 draft only |
| Approved drafts stored correctly | Met (read-back verified) |
| Source spreadsheet unchanged | No source write was issued (all source calls were reads); cannot be independently verified by the agent |
| No duplicate draft creation | Met in planning; not exercised with a second write run |
| Sensitive cases flagged correctly | **Not exercised** |
| Human review completed | **Not met** |
| No unresolved critical data-integrity or security issue | Open: the two security gates rest on user confirmation; sample size is one draft |

## 5. Security and operational confirmations

- Source: only `get_values` reads (including by the workers). Backup: not accessed. Gmail: not invoked; no email sent or drafted. No scheduled task created. Drafts written only to `Phase 3 Emails`.
- Customer data in the repository: none (a scan of tracked and untracked files for the real emails and recording tokens found nothing).
- `writes_enabled` was set to `true` only for this run and set back to `false` afterwards.
- Destination schema and formatting verified after the run.

## 6. Defects and risks found

1. Deterministic email checks are reused from the Phase 2 test harness (`tests/unit/checks.js`), not from a `src/` module; its recording-URL parsing is simpler than the production parser.
2. The four skills' latest refinements (customer-summary 1.3.0, email-generation 1.4.0, email-validation 1.4.0) were first executed here; one draft is not a regression test.
3. The call-day-evening transcripts are often empty when a run happens the next afternoon; transcript timing (OD-33) will affect throughput.
4. `min_transcript_chars: 600` is the OD-10 recommended value, proposed, not approved. OD-32 name handling is applied from its recommendation.
5. The connector account may still be an Editor on the source if the user's confirmation is inaccurate; only Google permissions enforce read-only.

## 7. To complete Phase 3

1. Human review of the stored draft (sheet row 3 of `Phase 3 Emails`, source row 15451) against its transcript, with your approve/correct decision.
2. A second controlled run (for example after the deferred transcripts arrive, or a different day) to obtain more drafts, a sensitive-topic case if one occurs, and a real second-run idempotency write test.
3. Optional synthetic collision test on a separate test copy of the draft sheet.
4. Your confirmation of OD-10 (minimum transcript length) and OD-32 (name handling), or changes.

---

## 8. Second controlled dry run, 30 October 2026 calls (email-generation 1.5.0) — added 2026-11-01

This is another controlled dry run, **not production authorisation**. Phase 3 is still not fully accepted. Nothing was sent. Section 1–7 above (first run) are unchanged.

### 8.1 Email-generation skill changes
Version **1.4.0 → 1.5.0** (D-041), after an independent comparison of the first real draft (source row 15451) with its transcript. Findings: the draft called three things "still open" that the transcript shows were done during the call (page publishing, the thank-you page, connecting the form to it), understated a completed sub-domain change, omitted the customer-owned step of buying a custom domain, and misused "This part is still open" on explanation-only bullets. The main cause is **upstream**: guided on-screen actions were classified `explained` instead of `completed` by transcript-analysis and customer-summary on a garbled transcript; that was **not changed** (not requested) and is recommended for a separate decision. The email-generation changes: four distinct statement kinds (completed / explained / customer still to do / status unclear); "still open" wording only for pending or unresolved summary entries, once per email, never on guidance-only bullets; no contradictions between sections; one action and outcome per bullet; concrete wording and no unsupported promises of help; customer-owned follow-ups under the customer next steps; optional `review_flags: ["STATUS_UNCLEAR"]` (the session then stores `REVIEW_REQUIRED` / `ANALYSIS_LOW_CONFIDENCE` with no email text); headings updated ("What we completed during the call", "What we discussed / went through", "What you need to do next"). Ownership, recording, UTF-8, length, sensitive-topic and validation rules are unchanged.

### 8.2 Checks run (results)
- Skill consistency script: **11/11 PASS** (version 1.5.0, valid output-schema JSON with `review_flags`, example email found, no "still open" misuse in the example, the new rules present, UTF-8/ownership/recording rules kept).
- The skill's example email through the deterministic checks (`tests/unit/checks.js`): **0 issues** (161 words).
- `node tests/unit/phase3.test.js`: **19 groups passed** before the run and **20 groups passed** after one small fix found by the run (see 8.7).
- No end-to-end regression and no adversarial re-run (not requested). The email-validation skill is unchanged (1.4.0).

### 8.3 Source records for 2026-10-30 and eligibility
| Measure | Count |
|---|---|
| Source records for 30 October (source rows 15441–15449) | **9** |
| Skipped, customer no-show (E2) | 2 |
| Skipped, call cancelled (E1) | 2 |
| Preliminary-eligible | 5 |
| Processed in this run (cap three, earliest call time first) | 3 |
| Eligible but not processed because of the cap (source rows 15443, 15445) | 2 (no destination row; still pending) |
| Deferred | 0 (all three transcripts were present) |

Only the three processed records had their transcript cell read. No record from another date was processed.

### 8.4 Processing results
| Measure | Count |
|---|---|
| Transcripts read and analysed | 3 |
| Emails generated | 3 |
| Passed the deterministic checks and the independent validator (PASS) | **2** (source rows 15448 and 15442) |
| Flagged for human review (`review_flags: STATUS_UNCLEAR`; stored `REVIEW_REQUIRED`, no email text) | **1** (source row 15447; garbled transcript, no outcome or follow-up establishable) |
| Failed validation | 0 |
| Sensitive-topic cases | 0 (the sensitive-topic review path was again **not exercised**) |

### 8.5 Destination storage and read-back
Headers were re-read before writing (intact). The plan returned `PROCESS_NEW` for all seven fingerprinted records. **7 rows written** to sheet rows 8–14 of `Phase 3 Emails`: 2 `DRAFT_READY` (word counts 215 and 322, the latter in the permitted 251–350 band), 1 `REVIEW_REQUIRED`, 4 `SKIPPED` (2 no-show, 2 cancelled). Read-back of rows 1–16: every written cell matched the intended values; the six rows stored by the first run (including the earlier draft body) were **unchanged**. `writes_enabled` was set to `true` for the run and **set back to `false`**.

### 8.6 Idempotency
The same selection planned against the stored sheet (13 stored records from both dry runs): **0 `PROCESS_NEW`**, stored drafts `NOOP_ALREADY_PROCESSED`, skipped rows `NOOP_TERMINAL`, the two deferred 31 October rows `PROCESS_UPDATE` in place (no new rows), and the review row `NOOP_REVIEW_PENDING` (after the fix below). No email body was overwritten and no second write run was made (planning only).

### 8.7 Defects and limitations found
1. **Transcript hash cannot be made byte-exact in this architecture.** The session must copy the transcript from the connector result into a file by retyping it; one worker reported its copy was an abbreviated paraphrase (so its hash was wrong), another could not verify byte equality. For this run **no transcript hash was stored**, and the notes say so. The hashes stored by the first run (rows for source rows 15450 and 15451) are **also unverified**. A reliable hash needs a transfer that does not pass through the model (for example a tool result spilled to a file).
2. **Review rows without a draft were not handled by the planner:** the `REVIEW_REQUIRED` row of source row 15447 returned `REPORT_ONLY` on the rerun plan. Fixed with a new action `NOOP_REVIEW_PENDING` in `src/lib/destination.js` and a unit test (20 groups pass).
3. The validator for source row 15448 was given condensed evidence quotes (Hindi passages shortened); it judges against the analysis only.
4. Low-confidence analysis items (garbled Hindi) can still reach a validated draft: row 15448 states two product claims (an email list cannot be uploaded directly; no client limit) from low-confidence evidence. There is no rule that holds back such items; the notes column flags them for the human reviewer. Recommended decision: a rule for low-confidence items.
5. Ownership of the Meta setup steps in row 15442 rests on partly garbled speaker labels (medium confidence); flagged in the notes.
6. The upstream classification gap from 8.1 (guided on-screen actions classed `explained`) remains.
7. Names: `p singh` was greeted as "P Singh" per OD-32 (still open); `min_transcript_chars: 600` remains proposed (OD-10).

### 8.8 What still needs human review
- The two new drafts (sheet rows 11 and 13: source rows 15448 and 15442) and the earlier draft (sheet row 3, source row 15451, stored under skill 1.4.0 and not regenerated).
- The review-required record (sheet row 10, source row 15447): check the recording for a promised WhatsApp message or community link and decide whether an email is appropriate.
- Your decisions on the upstream classification gap, low-confidence items, OD-10 and OD-32.
- A real second write run and a sensitive-topic case remain unexercised. Phase 3 is not fully accepted.

---

## 9. Skill optimisation and full-coverage dry run, 30 and 31 October 2026 (D-043, D-044, D-045) — added 2026-11-01

Another controlled dry run, **not production authorisation**. Phase 3 is not fully accepted. Nothing was sent. **No data was written to the destination spreadsheet in this run** (section 9.7).

### 9.A Skill optimisation
**Weaknesses found (actual causes of poor coverage):** (1) analysis rule "cannot classify main outcomes with at least medium confidence" produced `ANALYSIS_LOW_CONFIDENCE` skips, so a garbled call (source row 15450) got no email; (2) `ownership_review_required` and the email-generation `STATUS_UNCLEAR` flag routed imperfect calls to `REVIEW_REQUIRED` with no email text; (3) `min_transcript_chars: 600` and the `TRANSCRIPT_INCOMPLETE`/`NOT_A_SUPPORT_CALL` skips rejected usable calls (short, truncated, sales/onboarding); (4) uncertain-owner completed items were forced to `confidence: low`, which the summary then dropped, losing clearly observed results; (5) no rule held low-confidence items back from emails (two claims from garbled evidence reached a validated draft in the previous run); (6) guided on-screen steps were classified `explained` (fixed in 1.5.0, still understated on garbled calls); (7) transcript hashes were taken from a retyped copy; (8) no neutral fallback, no `generation_mode`, and no statement-level handling of Hindi/Hinglish or unreliable speaker labels.

**Files changed:** `skills/transcript-analysis/SKILL.md` (1.6.0), `skills/customer-summary/SKILL.md` (1.4.0), `skills/email-generation/SKILL.md` (1.6.0), `skills/email-validation/SKILL.md` (1.5.0); `src/lib/policy.js`, `src/lib/destination.js`, `src/lib/transcript.js` (new), `src/p3.js`; `config/email_policy.yaml` (`min_words` 80 to 50, `fallback_min_words` 30), `config/run-settings.yaml` (`min_transcript_chars: 40` as a floor); `tests/unit/checks.js`, `tests/unit/phase3.test.js`, `tests/unit/run-p3-focused.js` (new); `tests/fixtures/p3/` (8 synthetic cases plus expected outcomes written before the runs); `workflows/phase3-record-worker.md` and `workflows/phase3-validator.md` (new), `workflows/daily-post-call-run.md`; `docs/validation-rules.md`, `docs/skip-reasons.md`, `docs/decisions/decision-log.md`.

**Improvements:** quality never causes a skip; statement-level confidence with only medium/high items stated; `transcript_quality`, `generation_mode` (full / conservative / neutral_fallback), `analysis_notes`; skips only for genuine no-show, nothing substantive, internal calls, ambiguous recipient and policy-required sensitive topics (OD-11 unchanged); Hindi/Hinglish/mixed, garbled and mislabelled transcripts handled by context interpretation; uncertain-owner results stated neutrally (confidence judged on the result); a **neutral fallback email** (thank-you, invitation to reply, recording link, no content claims); no credentials or unsupported legal/financial/security statements; a partially resolved issue is always stated as not fully settled; contradiction, invented-technical-content and sensitive-information checks in the validator (new code `SENSITIVE_INFO_INCLUDED`, `email_class`); no padding to reach a minimum length; a date the call itself states may be repeated; status words once per unresolved issue.

### 9.A.1 Focused tests (synthetic) and results
Cases (8 new plus the existing long multi-issue fixture P2-10): F1 clear English with guided completed steps; F2 Hindi-English mixed with completed steps and a relative timeline; F3 partly garbled; F4 substantially garbled (neutral fallback); F5 short; F6 unreliable speaker labels; F7 credentials read aloud; F8 refund dispute (sensitive topic); P2-10 long, multi-issue. Method: separate worker sessions generated analysis, summary and email; separate validator sessions judged them; expectations were written before the runs; scoring by `tests/unit/run-p3-focused.js` (deterministic checks plus expectations).
- Iteration: the first pass exposed rule conflicts (uncertain-owner result dropped, fallback subject, padding to the minimum, status words once per email, quoted dates). The rules were fixed and **F3, F4, F5, F6 and P2-10 were re-run** (F1, F2, F7, F8 were not).
- Final scoring: **9/9 cases pass**; validators: **PASS for all eight emails** (F1 full, F2 full, F3 conservative, F4 neutral fallback, F5 full, F6 full with neutral ownership, F7 full with no credentials, P2-10 full); F8 correctly stopped at `REVIEW_REQUIRED` (`SENSITIVE_TOPIC_REQUIRES_HUMAN`) with no email.
- **Disclosed correction:** the F7 expectation originally forbade the bare words "password" and "OTP"; the email legitimately says the customer reset their password. I narrowed it to the two credential values after seeing the result (`_revisions` in `expected.json`). The credentials were never reproduced.
- Unit tests: `node tests/unit/phase3.test.js` **23 groups pass**.
- Limits: workers handled several cases sequentially in one session; one worker saw the `scenario` description field; passing synthetic cases does not prove every transcript.

### 9.B 30 October results (source rows 15441–15449)
| Measure | Count |
|---|---|
| Total source records | 9 |
| Confirmed cancellations (E1) | 2 |
| Confirmed no-shows (E2) | 2 |
| Eligible calls | 5 |
| Eligible calls with an available transcript | 5 |
| Transcripts retrieved / analysed | 5 / 5 |
| Emails generated | 5 (all `conservative`) |
| Emails passing validation | 5 (one, source row 15443, after one regeneration) |
| Drafts stored in the destination by this run | 0 (storage blocked, 9.7) |
| Transcripts inaccessible | 0 |
| Processing failures | 0 |

### 9.C 31 October results (source rows 15450–15455)
| Measure | Count |
|---|---|
| Total source records | 6 |
| Confirmed cancellations | 0 |
| Confirmed no-shows | 2 |
| Eligible calls | 4 |
| Eligible calls with an available transcript | 2 |
| Transcripts retrieved / analysed | 2 / 2 |
| Emails generated | 2 (15450 `neutral_fallback`, 15451 `conservative`) |
| Emails passing validation | 2 (15451 after one regeneration) |
| Drafts stored by this run | 0 (storage blocked) |
| Transcripts genuinely inaccessible | **2** (source rows 15453 and 15454: the Transcript cell is still empty, `MISSING_TRANSCRIPT`; reported separately, not analysed) |
| Processing failures | 0 |

### 9.D Combined coverage
`Draft Coverage = generated drafts / eligible calls with an available transcript = 7 / 7 = 100%` (target met). Of all 9 eligible calls: 7 / 9 = 77.8% (the other 2 have no transcript yet). Modes: 6 `conservative`, 1 `neutral_fallback`. Independent validation: 7 of 7 PASS in the end; **two failed first** (`KEY_OUTCOME_OMITTED` for source rows 15443 and 15451: a partially resolved issue was not stated as not fully settled), cause fixed in customer-summary 1.4.0, both regenerated once and then passed. Every eligible call with an available transcript has an explicit outcome (generated and validated). The drafts are in a temporary folder outside the repository; they are **not** in the destination.

### 9.E Data integrity
- **Transcript hash (D-043):** the exact cell value was recovered byte for byte from each worker's recorded tool result and hashed (`hash_verified: true` for all 7 transcripts; the 2 empty cells give the empty-string hash and are not stored). The hashes the first run stored for source rows 15450 and 15451 **equal the exact hashes** (confirmed); the retyped hashes reported for rows 15447 and 15448 earlier were wrong (27,084 vs 27,083 characters; 6,742 vs 13,778), which is why the new design exists.
- **Destination read-back:** no write this run; the existing 13 data rows were re-read and are unchanged (the earlier read-back of both prior runs matched).
- **Duplicate detection / idempotency (planning only, no second write):** all 15 source records planned against the stored sheet: 3 stored drafts (15442, 15448, 15451) `NOOP_ALREADY_PROCESSED` (never overwritten, even though new drafts exist), 6 terminal skips `NOOP_TERMINAL`, 2 new rows planned (`PROCESS_NEW`: 15443, 15445), 2 rows stored under the retired quality skip would be updated in place (`PROCESS_UPDATE`: 15447 and 15450, no stored body), 2 deferred rows would update only when a transcript arrives (15453, 15454). No duplicate rows, no overwrite planned.

### 9.7 Destination security gate: storage blocked
You reported that `Phase 3 Emails` was made accessible to everyone with Editor rights. I cannot read sharing settings or the connector account's access through the Sheets connector, and I did not use your personal browser to look. The gate is therefore **unresolved**, so I wrote nothing to the destination (`writes_enabled` stayed `false`) and kept the drafts in a temporary folder outside the repository. The source's read-only state for the connector account is likewise unverifiable by me. **Important:** the sheet already holds 13 rows of real customer data from the two earlier runs (names, emails, recording links, and 3 stored drafts); if it is broadly shared, that exposure already exists and the sheet's sharing should be restricted now.

### 9.F Remaining limitations
- Destination sharing and source read-only access are unverified (blocker for any storage).
- Two eligible transcripts (15453, 15454) are not yet available.
- On garbled calls the pipeline is conservative: it omits unreadable steps, so some real work is understated (for example source row 15451 now states only two completed steps and "some parts could not be confirmed"). It never calls them open or done.
- The unreadable passages may hold commitments (a possible WhatsApp share, a possible support ticket); they are noted in `caveats`/`analysis_notes` for a reviewer to check against the recording.
- Hash recovery depends on the harness log format; validation is LLM-based; real-data results are one run; drafts still need human review before any use.
- OD-10/OD-32 remain open (the 600-character minimum was replaced by a floor of 40; names are title-cased per the OD-32 recommendation).