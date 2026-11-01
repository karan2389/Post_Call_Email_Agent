# handoff.md

_Last updated: 2026-10-31 â€” Phase 1 partly done (read-only). Awaiting review. Nothing from Tasks 6â€“8 is committed._

## B11 worked: OD-10 and OD-32 resolved, deferred transcripts still empty (2026-11-02, D-071)
Two bounded read-only cell reads of the source (AB15453, AB15454 plus their date/time): both transcripts still empty (31 Oct calls, 7-day window to 7 Nov); no content read, nothing written. You confirmed OD-10 (all calls treated as support calls, 40-char floor, 7 days, opt-out via suppression list) and adopted OD-32, now `greetingName()` in `src/lib/normalize.js` (`tests/unit/phase3-greeting.test.js` 7/7; `tests/unit/checks.js` uses it; Phase 2 25/25 and focused 9/9 unchanged; p3 command `greeting-name`). You chose to wait for a natural sensitive-topic case, so that path stays unproven on real data. `docs/b11-phase3-leftovers.md`. Not wired yet: the runbook prompt (`workflows/phase3-record-worker.md`) still gets `greeting_name` from the session. Next by your order: B1-B3 and B9 (business confirmations), B5, B6, B8.

## B4 designed and implemented: verified local confidence record (2026-11-02, D-070)
`src/lib/confidence.js` (+ `tests/unit/phase4-confidence.test.js` 8/8 and pilot 12/12, mutation-checked): confidence = min(model declaration, computed from evidence counts); record bound to call, send key, draft hash, transcript hash and skill versions, sealed, hashes and counts only (no transcript text), 14-day expiry, fail closed on any defect; pool and review card read it only through `resolveConfidence`; p3 commands `confidence-record` and `confidence-check`; design in `docs/confidence-artifact.md`. No record exists yet; the 7 stored drafts need re-analysis of their transcripts (customer data, needs your explicit authorisation) before they can enter a C1 pool. No gate, sheet, email or schedule changed. Next blockers by your order: B11 (Phase 3 leftovers), B1-B3 and B9 (business), B5, B6, B8.

## B7 resolved locally: `.env` ACL restricted, Brevo key removed (2026-11-02, D-069)
Gmail is the sole active provider and has no Brevo dependency (only the retired brevo.js, env.js, brevo-check.js and their tests reference the variables). `.env` ACL is now KARAN\karan (M), Administrators (F), SYSTEM (F), inheritance disabled, `.env` only; the `BREVO_API_KEY` line was removed (two non-secret sender values remain); `.env.example` has commented placeholders only; `api_key_provisioned` false. Secret scan: key in 0 working-tree files, 0 commits, 0 scratch files, 0 transcripts. **The user confirmed the key was revoked in Brevo (2026-11-02), so B7 is closed.** Remaining C0 blockers: B1-B6, B8-B12 (`docs/c0-readiness-report.md`).

## C0 pilot readiness prepared: NOT READY for C1 (2026-11-02, D-068)
Preparation only. Read-only reply-monitoring investigation, consent checklist, approval workflow and review card, deterministic C1 candidate-pool rules and allowlist validation (not created), suppression check, scheduling comparison (Task Scheduler cannot reach the connectors: `claude mcp list` shows none; nothing created), requirements, acceptance criteria, go-live checklist, report template, C0 readiness report (`docs/c0-readiness-report.md`, blockers B1-B12 with owners). New code: `src/lib/pilot.js`, suppression in `preSendChecks`; `tests/unit/phase4-pilot.test.js` 11/11 (mutation-checked). No email, internal test, draft, sheet write, schedule or gate change. **Finding to act on:** `.env` is readable by all local accounts (inherited ACL); revoke the Brevo key and remove it, or restrict the ACL. **Needs you:** business confirmations (consent, reply owner, opt-out process, approver), confidence-source decision, then authorise C1 explicitly.

## First Gmail-only internal test passed (2026-11-02, D-067)
One synthetic internal email sent and read back: From supportcore@, recipient exact, both Fathom-style URLs wrapped by Gmail and verified against the canonical URLs, SENT (Send Log rows 17-19). Config unchanged (all gates false). Open: wrapper expiry (about 2026-11-02 19:40 UTC for this message) and Redirect Notice experience; pilot C0-C3 closed; scheduling not decided.

## Gmail is now the sole provider; Brevo retired (2026-11-02, D-066)
Implemented and tested with mocks only: `src/lib/provider.js` (Gmail only, no fallback), `src/lib/urlcheck.js` (strict Google-wrapper verification against the validated Fathom URLs), read-back verification before SENT (recipient, actual From, subject, body, URLs), `src/lib/approval.js` (approvals bound to send key + recipient + draft hash; C1 5, C2 15), runBatch duplicate fix. Config: `active: gmail`, `allow_fallback: false`, `gmail_adapter_enabled: false`, `pilot.*: false`. Brevo code and `BREVO_*` secrets kept (not exposed) until migration is verified. Nothing sent, drafted, written to a sheet or scheduled. Doc: `docs/phase4-gmail-only.md`. **Needs you:** authorise a controlled Gmail internal test (to verify the read-back path and the wrapper on a real message), then C0 items for the pilot (DNS no longer needed for Gmail; consent decision; reply monitoring). Nothing starts without explicit authorisation.

## Tracking flag set; adapter refuses anchors (2026-11-02, D-065) [Brevo, retired by D-066]
link_tracking_disabled_confirmed, sender_verified_in_brevo, api_key_provisioned now true (evidence in D-062/D-064). Provider readiness empty; customer sending still blocked (dry_run, customer_sending_authorised false, no schedule). Open: tracked List-Unsubscribe header (ask Brevo support), DNS for flexifunnels.com (DMARC fail), pilot design, scheduling.

## Second Brevo test: links preserved, pixel and unsubscribe header remain (2026-11-02, D-064)
Production-style email keeps Fathom URLs exactly in text and HTML (no anchors). Open pixel and tracked List-Unsubscribe still added; DMARC fails until DNS. Tracking flag still false pending your decision. Suggested: refuse anchors in the adapter; ask Brevo support about pixel/unsubscribe.

## Brevo tracking opt-out added, mocked only (2026-11-02, D-063)
Adapter sends `contactPixelTrackingConsent:false` per recipient; Brevo per-contact consent is on in the account. Suites pass (brevo 26/26). **Needs you:** confirm the Brevo setting was saved, then approve ONE repeat internal test; the tracking flag stays false until its raw message is clean.

## First real Brevo test done: tracking is ON, flag stays false (2026-11-01, D-062)
One synthetic internal email sent via Brevo (Send Log rows 11-13 SENT). Raw message: text part URLs intact; HTML anchors rewritten to sendibt3 click links; open pixel added; DMARC fail for flexifunnels.com (Brevo-domain DKIM/SPF pass). **Needs you:** turn click and open tracking off in Brevo, DNS records for the domain; then approve one repeat test.

## Brevo .env loader + read-only connectivity check built, mocked only (2026-11-01, D-061)
New: `src/lib/env.js`, `src/brevo-check.js`, `checkConnectivity()` in the adapter, `tests/unit/phase4-env.test.js` (15 groups), `approved_sender_name` and gate `connectivity_check_authorised: false`. No real request was made; all other flags unchanged. **Needs you:** authorise the first real read-only request (set the gate true, run `node src/brevo-check.js --live`); Brevo account actions (sender, domain, tracking) still open.

## Brevo adapter built, mocked only (2026-11-01, D-060)
New: `src/lib/brevo.js`, `tests/unit/phase4-brevo.test.js` (25 mocked-HTTP groups, mutation-checked), `.env.example`, `email_provider` flags (all false), `docs/phase4-brevo-integration.md`; sender made provider-neutral. Gmail adapter kept, disabled. No account, no credential, no real request, no email; customer sending off, dry_run, no scheduled task. **Needs you (nothing started):** Brevo account; authenticate flexifunnels.com; verify supportcore@flexifunnels.com; turn off click/open tracking in Brevo; create API key and set it only as BREVO_API_KEY; agree a raw-MIME inspection route and approve a controlled test (steps in section 6 and 7 of the Brevo doc).

## Draft-route test done (2026-11-01, D-059)
One synthetic draft: already wrapped at creation (raw MIME evidence), so nothing sent; draft deleted, drafts empty, Sent unchanged. Rewriting happens when the connector builds the message; no tested route delivers original URLs. All authorised link tests are used. Customer sending stays blocked. **Needs your decision:** (1) check an expired wrapped link after 2026-11-02 12:54 UTC (test-1) / 13:56 UTC (test-2) and tell me what happens; (2) whether a different sending mechanism (needs credentials, currently forbidden by the project rules) is acceptable; or (3) whether to accept wrapped links with updated validation.

## Link-rewriting investigation (2026-11-01, D-058)
Two synthetic tests to karan.s (plain-text and HTML): every URL is wrapped by the connector's send path (plain and HTML parts, 24h ust, Redirect Notice interstitial); no form avoids it; destination reachable now; post-expiry behaviour unverified; one authorised send unused. Customer sending stays blocked. **Needs your decision:** approve the draft-route test (create one synthetic draft, read it back without sending, send only if links are original, delete it), or choose another route. Check the test-1 links after 2026-11-02 12:54 UTC to see what expiry does.

## First internal test email SENT; link-rewriting finding (2026-11-01, D-056/D-057)
One marked test email to karan.s@flexifunnels.com (message ID 1a19724b2d3e0e9a), From supportcore@flexifunnels.com observed, Send Log final state SENT, no reconciliation, gate closed. **Blocker for customer sending:** the delivered body has the Fathom link wrapped in a time-limited google.com/url redirect (not identical to the validated draft). Next (needs your authorisation for further test sends to karan.s): find out whether the connector or Gmail does it, whether htmlBody or the draft route avoids it, and whether the wrapped link keeps working. Do not start a customer pilot before that.

## Send Log created; internal test send HELD (2026-11-01, D-055)
Send Log worksheet created and verified (19/19 headers, sheet ID 1001), gate closed again. Gmail identity: supportcore@flexifunnels.com supported by read-only evidence (no profile endpoint). **No email sent.** Missing prerequisite: a stored, validated draft addressed to karan.s@flexifunnels.com (needs a test draft row in Sheet1 and a real validation, plus a deterministic internal-test marker in the sent text). **Needs your decision** (see the last report).

## Send logic built and tested with mocks (2026-11-01, D-054)
Send Log design + code, Gmail request/search builders, reference sender, CLI helpers; tests: phase3 28, phase4 10, sender 18 (mocked Gmail). Docs: phase4-tracking-schema, idempotency, error-handling, architecture. Not live-tested, not exactly-once. **Needs you (not before):** go-ahead for the first real internal test send to `karan.s@flexifunnels.com` (it will also show the real From address) and approval to create the `Send Log` worksheet. Scheduling investigated read-only (``docs/scheduled-execution.md`` section 8: local desktop task recommended; unattended connector access untested; nothing created; a dry-run-only verification task needs your approval). Next: remaining Phase 4 docs (requirements, acceptance criteria, pilot report, go-live checklist). Customer sending off; nothing sent.

## Phase 3 CLOSED after the controlled storage test (2026-11-01, D-052)
One synthetic row written to the destination through the guard, read back (0 mismatches), existing 15 rows unchanged, planner idempotent, test row cleared, `writes_enabled` false again. Report sections 11-12. Phase 3 complete with documented limitations. **Next (Phase 4):** tracking schema, then Gmail wrapper with mocked responses, scheduling investigation, docs. Sender `supportcore@flexifunnels.com` and internal test recipient `karan.s@flexifunnels.com` APPROVED (D-053); no test send authorised yet. Nothing sent; source untouched; customer sending off.

## Phase 4 started: guard, state machine, regression (2026-11-01, D-048/D-049/D-050)
Committed: write guard (`src/lib/guard.js`) and sending logic (`src/lib/sendstate.js`) with tests (28 + 10 groups pass). Regression on latest skills: nine cases 7/9 first run (F5 fixed by eg 1.6.1; F2 expectation stale), Phase 2 harness 23/25 after the cs 1.4.1 fix (P2-07, P2-13 stale expectations). Report section 10. Gmail connector facts and account inference in `docs/phase4-gmail-integration.md`. Expectations aligned to D-044 on your instruction (D-051): nine cases 9/9, Phase 2 harness 25/25. **Needs you:** confirm the Gmail sender (`supportcore@flexifunnels.com`, inferred); authorise the controlled destination storage test (turn `writes_enabled` on for one run) so Phase 3 can close. Nothing sent; source untouched; customer sending off.

## Three older drafts replaced (2026-11-01, uncommitted, D-047)
On your authorisation, replaced the drafts of source rows 15451, 15448 and 15442 (sheet rows 3, 11, 13) with the coverage-first versions; read-back verified (7 draft rows, 0 mismatches); `writes_enabled` false. Sheet: 15 rows = 7 drafts (all new skills), 2 deferred (15453, 15454), 6 skipped. Real-record temp files deleted. Next: your review of the 7 drafts (notes column says what to check in each recording); transcripts for 15453/15454; confirm sharing for real (I cannot verify); OD-10/OD-32.

## Storage done after sharing restricted (2026-11-01, uncommitted, D-046)
You confirmed `Phase 3 Emails` is restricted (not verifiable by me). Stored 4 validated drafts: new rows for source rows 15443 and 15445, in-place updates of 15450 (neutral fallback) and 15447; read-back verified cell by cell (0 mismatches); re-plan shows 0 new/duplicate rows; `writes_enabled` false again. Sheet now: 15 rows, 7 drafts (4 new-skill, 3 old-skill: 15451, 15442, 15448 not replaced; newer versions are in the scratchpad `real` folder), 2 deferred (15453, 15454), 6 skipped. Needs: your review; decision whether to replace the 3 old-skill bodies; transcripts for 15453/15454.

## Skill optimisation + full-coverage run, 30/31 Oct (2026-11-01, uncommitted, D-043/D-044/D-045)
All four skills optimised (ta 1.6.0, cs 1.4.0, eg 1.6.0, ev 1.5.0): coverage first, neutral fallback email, statement-level confidence, exact transcript hash (`node src/p3.js extract-transcript`). Focused tests 9/9 + validators PASS. Real run: 15 records, 9 eligible, 7 with transcripts -> 7 drafts (6 conservative, 1 neutral fallback), all validated (2 after one regeneration) = 100% draft coverage; 2 transcripts (15453, 15454) still empty. NOTHING written to the destination: sharing is unverified after your report of broad Editor access (D-045; `destination_sharing_verified` reset to false). Drafts are in the session scratchpad `real` folder (outside the repo). Needs: restrict/confirm destination sharing (13 real rows already stored there), your review of drafts, then a storage run. Report `docs/phase3-acceptance-report.md` section 9. Nothing sent or committed.

## transcript-analysis 1.5.0: guided-action classification (2026-11-01, uncommitted, D-042)
A step done on screen under guidance is now `completed` when it has a performer basis and a completion signal (customer confirms, support states the result, or the result is used later); instructions and `okay` are not signals; unclear garbled steps stay `explained` (low confidence). Not re-run on any record and not regression-tested. Suggested check: re-analyse source row 15451 (31 Oct) only if you approve; the stored drafts are not changed. Still open: rule for low-confidence items, OD-10, OD-32.

## Second dry run, 30 Oct calls, email-generation 1.5.0 (2026-11-01, uncommitted, D-041)
Skill 1.5.0 (four statement kinds, status-word rules, `review_flags`). 9 source records for 30 Oct: 2 no-show, 2 cancelled, 3 processed (cap) -> 2 validated drafts (sheet rows 11 and 13), 1 review-required (row 10), 7 rows written and read back, rerun plan shows no new rows, `writes_enabled` back to false. Needs your human review of the drafts, and your decisions on the upstream classification gap, low-confidence items, OD-10/OD-32. Known issue: transcript hashes are not byte-exact (not stored this run). Report `docs/phase3-acceptance-report.md` section 8. Nothing sent or committed.

## Phase 3 dry run done, acceptance PARTIAL (2026-11-01, uncommitted, D-039/D-040)
Helpers in `src/` (tests: `node tests/unit/phase3.test.js`), runbook Phase 3 section, destination set up (21 headers, plain-text columns, frozen row; read back). Dry run on 2026-10-31 calls: 6 records -> 1 validated draft (source row 15451, stored in row 3 of `Phase 3 Emails`), 3 skipped, 2 deferred; no duplicates; `writes_enabled` back to false. Needs your human review of the draft, a second run, and OD-10/OD-32 confirmation. Report `docs/phase3-acceptance-report.md`. Nothing sent, nothing committed.

## Connector identity recorded (2026-11-01, uncommitted, D-038): documentation only
Connector account `karan.s@flexifunnels.com` (confirmed by you): Editor on the source and Editor on `Phase 3 Emails`. `Calls DONE` is unprotected, so source write protection is NOT enforced. Unresolved: make that account Viewer on the source (or an equivalent Google-enforced restriction) and confirm the destination is shared only with named support leads with link sharing off. Flags still false: writes_enabled, header_setup_authorized, headers_verified, source_access_enforced, destination_sharing_verified. No permission changed, no sheet touched.

## Phase 3B approvals recorded (2026-11-01, uncommitted, D-037): documentation only
Recorded your explicit approvals: real-transcript processing (OD-12) and persistent storage of names, emails, Fathom URLs, subjects and bodies in `Phase 3 Emails` (OD-19); schema confirmed (21 columns, last header `Source Row (reference only)`, no Call ID column). Retention period NOT set (company policy, to be confirmed). Not verified: connector account/access, source Viewer restriction (`Calls DONE` unprotected), destination sharing. One-time header/format setup planned (`docs/phase3-draft-destination.md` section 11), NOT performed, awaiting those checks and your go-ahead. OD-05/08 do not block a first dry run; OD-11 recommended before it. No sheet written, nothing committed.

## Phase 3A preflight done (2026-11-01, uncommitted, read-only)
Inspected both spreadsheets read-only (no writes). Source matches the documented headers; time cells have inconsistent zero-padding; `Calls DONE` has no protected ranges. Destination `Phase 3 Emails` / `Sheet1` (GID 0) is empty, 26 columns, timezone Etc/GMT; the 21-column schema fits unchanged. Connector account and Viewer/Editor level cannot be determined without a write; OD-12 and persistent-storage approvals are not recorded. Report with collision/idempotency design and the Phase 3B plan: `docs/phase3a-preflight-report.md`. Phase 3B not started; waiting for your approvals.

## No Call ID column; fingerprint identification (2026-11-01, uncommitted, D-036): documentation only
Phase 3 uses no new Call ID column and no UUIDs. Record fingerprint = normalised call date + call time + customer email (duplicate detection and draft association only, not unique). Different times on the same day = separate calls, rows and drafts; exact collisions flagged for review (FINGERPRINT_COLLISION), nothing merged or discarded; row numbers are references only. Draft schema now 21 columns. New OD-46 (collision resolution, not a gate); OD-44 resolved. Open for you: whether Phase 4+ still needs a persistent ID. Nothing read or written in any spreadsheet.

## Phase 3 draft destination decided (2026-11-01, uncommitted, D-035): documentation only
Draft spreadsheet 1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40 (GID 0) is the only place for generated drafts; the source stays read only; backup untouched. Phase 3 = read-only source, write-enabled draft sheet, Gmail-disabled, customer-send-disabled, manual (not scheduled). Design, proposed 22-column schema and de-duplication: docs/phase3-draft-destination.md. New OD-45 (headers and access), R-15 (OD-44 interim Call ID superseded by D-036). Nothing was read or written in either spreadsheet; Phase 3 not started; awaiting your approval and the gates in that document's section 9.

## Roadmap consolidated to seven phases (2026-11-01, uncommitted, D-034)
Phases 0-2 completed (Phase 2 = synthetic implementation baseline, latest refinements untested); Phases 3-7 not started: 3 Real Data Integration, 4 Tracking & Gmail, 5 Shadow & Production Readiness, 6 Live Automation & Scheduling, 7 Dashboard. Phase 3 needs your approval and OD-12 data-handling approval first. Documentation only; no tests, no external access. Phase 2 was committed as 817fe0e and pushed.

## Phase 2 final changes (2026-11-01, D-033): NOT tested by design
Per your instruction, no regression runs. Done: UTF-8 instruction in email-generation 1.4.0 (+ encoding check documented in `docs/validation-rules.md`; the check already existed in `tests/unit/checks.js`); P2-03 `must_not_include` narrowed to `we (have )?fixed|has been fixed|was fixed` (original preserved in `tests/fixtures/_history/`); language refinements in customer-summary 1.3.0, email-generation 1.4.0, email-validation 1.4.0. Business logic unchanged. Report Â§11 of `docs/phase2-final-report.md`. Nothing committed or pushed; Phase 3 not started. Re-test before relying on the new wording.

## Final policy implementation and regression (2026-11-01, uncommitted): S-11 CLOSED by your decision (D-032)
Implemented your four decisions (length 250/350/review, P2-03 investigation, ownership expectations, call-date timelines): skills transcript-analysis 1.4.0, customer-summary 1.2.0, email-generation 1.3.0, email-validation 1.3.0; policy in `config/email_policy.yaml`; D-031. Results (`tests/results/phase2-final/`): individual P2-03 and P2-10 pass; full runs 24/25, 25/25, 25/25 (13 fixtures + 12 adversarial drafts, all adversarial rejected every time). One failure: P2-10 in run 1 has a broken UTF-8 subject ("Ã¢â‚¬â€œ"), caught by a new deterministic check. S-11's own criteria (ownership, grounding, no fabricated intent/promise/timeline, no leak) hold in every run, but "all fixtures pass consistently" does not, but you decided to close S-11 and accept that run as a one-off generation-session fault (D-032). Still pending: your approval to narrow the P2-03 expectation (`must_not_include: fixed`, preserved as is). Nothing committed. Report: `docs/phase2-final-report.md`. Nothing committed.

## S-11 correction and regression (2026-10-31, uncommitted): fix verified in tests (earlier rounds)
Skills corrected (transcript-analysis 1.3.1, customer-summary 1.1.1, email-generation 1.2.0, email-validation 1.2.0; D-030, `docs/validation-rules.md` Â§1a). Round 2 (3 independent runs, 13 fixtures + 9 adversarial): 21/22, 21/22, 20/22; ownership and grounding correct everywhere; all adversarial drafts rejected. Open: P2-10 exceeds 250 words in all six runs (S-6, needs your length policy); one borderline P2-03 email ("wanted this fixed"); owner expectations in P2-01/02/04/05/06/09/10 encode the old defect and need your approval to update (not edited); S-1 relative timelines still undecided. Original results preserved in `tests/results/phase2`; new results in `phase2-s11/` and `phase2-s11-r2/`. Report: `docs/phase2-s11-report.md`. Nothing committed.

## Phase 2 â€” synthetic dry run (2026-10-31): NOT complete, awaiting your review
Authorised by you; scope synthetic data only. 11 fixtures (`tests/fixtures/P2-*`), 9 adversarial drafts, `config/email_policy.yaml`, Node harness `tests/unit/run-phase2.js`, plan `docs/phase2-plan.md`, report `docs/phase2-report.md`. Result: 19/20 harness checks pass; 7 of 8 generated emails pass independent semantic validation; **P2-06 fails** (`OWNER_MISATTRIBUTED`, skill defect S-11: `completed` items are always owned by `support` even when the customer did the step). A proposed fix was tested on skill copies only: partly effective (P2-06, P2-09 pass; P2-02 and P2-01 diverged). Skills unchanged. No Gmail, no spreadsheet access, no routine, no commit. Next: your decisions on S-11, S-1 (relative timelines), word limits and OD-08/09/11/38 (`docs/phase2-report.md` Â§10). Do not start Phase 3 without approval.

## Completed work

### Tasks 1â€“5 (committed): `642f7ea`, `39b1fc2`, `1f0dddb`, `6d9c76d`
- Phase 0 docs, repository move, previous-day design, source-sheet inspection.

### Tasks 6â€“7 (uncommitted)
- Business decisions D-022 â€¦ D-025; architecture pivot D-026 (Claude Code scheduled tasks + native Google connectors); future-alternatives; runbook; run settings.

### Task 8 â€” Corrections and Phase 1 read-only test (this task, uncommitted)
**Corrections**
1. AD-only restriction: docs now state that instructions and agent checks **do not enforce** it; only verified protected ranges do; **no write to the real sheet until verified** (`source.protected_ranges_verified: false` in `config/run-settings.yaml`). Updated architecture Â§5, security Â§6, call-id-strategy Â§3, R-03, OD-36, runbook Â§0, ROADMAP, CLAUDE.md, decision log.
2. OD-41 reworked: footer reference **withdrawn**; internal `send_attempt_id`; `SENT` only on positive confirmation; otherwise `SEND_UNCONFIRMED` â†’ **human review** (`review_decision`, `reviewed_by`, `reviewed_at`) â†’ no auto-resend. Updated delivery-state-machine Â§4â€“Â§7, data-model, pipeline, runbook, validation-rules (conditional check removed), skip-reasons (`SEND_REVIEW_REQUIRED`, `REVIEW_RESOLVED`), tests (EV-112, EV-114 â€¦ EV-117).
3. OD-37: cloud-first test (if available), desktop as fallback, nothing assumed.

**Phase 1 read-only results** â†’ full detail in `docs/phase1-results.md`
- Sheets connector available (local and one manual cloud run, reads only). Header Aâ€“AC validated; AD empty.
- **Yesterday (2026-10-30 IST) = 9 records** (rows 15441â€“15449); today 6; future 0. Aggregates for those 9: recording URL single 5 / empty 4 / multi 0; `Recording Sent` no 8, empty 1, yes 0; transcripts present 4, missing 5 (1 with a recording URL).
- Cloud routine created **disabled and manual-only**, narrowed to the Sheets connector, run once (17 s, success).
- Findings: no protected ranges on `Calls DONE`; routine tool settings not enforced; API routines attach all connectors by default; instructions unreachable in cloud (no remote repo); date-format quirks; full-column reads overflow; transcript checks pull content.
- New docs: `docs/phase1-results.md`; new OD-42, D-027; EV-118 â€¦ EV-123; `fetch_window_rows` setting; windowed read + coverage check in pipeline and runbook.

## Files modified (uncommitted, vs HEAD)
```
NEW     docs/future-alternatives.md, docs/phase1-results.md, workflows/daily-post-call-run.md, config/run-settings.yaml
RENAME  docs/deployment.md -> docs/scheduled-execution.md
DELETE  .env.example
EDIT    CLAUDE.md, README.md, ROADMAP.md, memory.md, handoff.md, config/README.md, src/README.md, tests/*,
        skills/*, docs/* (architecture, pipeline, state machine, data model, call-id, security, skip-reasons,
        validation, source profile, open decisions, decision log, testing, skills-runtime, scheduled-execution)
```

## External changes made (outside the repository)
- Anthropic cloud environment "Default" `env_01Cs49hSdGFEfboTPFSfY4Ty` **auto-created** by the scheduling skill.
- Cloud routine `trig_017psPj1c1uxCuPDXDw9rvXu` (disabled, manual-only, Sheets connector only) and one run session `cse_01FMKRNXJ9UTJA8LUr5tBe8x`. Contains headers, dates and counts only; no customer data.
- No spreadsheet, Gmail, Google Cloud or connector-permission changes. Local temporary tool-result files were deleted.

## Current status
Phase 1 partial. **No application code, no recurring schedule, no spreadsheet write (AD untouched), no worksheet, no Gmail call, no draft, no email, no Google Cloud resource, no commit.**

## Remaining blockers (see `docs/phase1-results.md` Â§8)
B1 **resolved**: private `karan2389/Post_Call_Email_Agent` attached to the test routine; Test 2 cloned it and read all files and skills (R-02 partly verified) Â· B2 connector Google accounts unidentified (R-13) Â· B3 protected ranges absent/unverified, needs a test copy (R-03) Â· B4 Gmail in cloud untested, needs test-mailbox plan and approval (R-01, R-04) Â· B5 helpers undecided (OD-38) Â· B6 data-handling approval for cloud session history (R-12, OD-12).

## Spreadsheet architecture (D-029, uncommitted, awaiting review)
Agent input = `Calls DONE` in the original `CSC  Booking - All Agents` (`1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, GID `1314582701`). `CSC Booking - Backup` (`10YjhBUPpJBEnbXz5zTqGoXEIVEIuuMZT4cCyiYJ7p3Q`) is a **recovery copy only**, never read or written by the agent, documented in `docs/backup-recovery.md`; not verified as reliable. D-029 supersedes the same-day D-028 (backup as input), which was never committed. **Source writes are disabled** (`source.source_writes_enabled: false`, `protected_ranges_verified: false`) until AD ownership, header approval, protected-range verification and backup-sync safety for agent data are all confirmed (`docs/call-id-strategy.md` Â§0, OD-43). No backup synchronisation script exists in this repository and none was run. The test routine's saved prompts name the original (historical); it stays disabled.

## Exact next steps
1. Review `docs/phase1-results.md`; decide whether to commit Tasks 6â€“8, and whether to delete the test routine / default environment at claude.ai.
2. **B1 / Test 2 done (2026-10-31):** the routine (disabled, Sheets only) ran once against https://github.com/karan2389/Post_Call_Email_Agent and read all six files, four skills and the `Calls DONE` header (`docs/phase1-results.md` Â§5a). Open items: the final report was truncated in the run log (rule checks 3â€“8, header details); review session https://claude.ai/code/session_01FMKRNUMdkCQiLUP6QhNLB4. The older repo `karan2389/flexifunnels-post-call-email-agent` is a stale copy (`39b1fc2`): archive or delete it, or tell me to fast-forward it.
3. Tell me which Google accounts authorise the Sheets and Gmail connectors (B2), and agree a test copy of the spreadsheet for the R-03 protection test (B3).
4. Do not enable any schedule until R-01 â€¦ R-04 and R-12 are resolved.
