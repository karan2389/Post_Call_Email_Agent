# Phase 1 Results — read-only feasibility test (2026-10-31)

Status: **Partial.** Each item is marked **VERIFIED**, **PARTIAL**, **UNVERIFIED** or **BLOCKED**. Nothing here is assumed to work unless marked VERIFIED. No customer data, recording links or tokens appear in this document.

Test time: 2026-10-31 12:00 UTC = 17:30 IST. Run date (IST) 2026-10-31; **target date (yesterday, IST) 2026-10-30**. The machine's local timezone is also IST, so this test **cannot** show that the date calculation ignores the environment clock (R-11, EV-50 stay unverified). The cloud sandbox's clock/timezone was not inspected.

## 1. What was done (and not done)

| Allowed / done | Not done (by instruction) |
|---|---|
| Read-only calls on the Google Sheets connector (`get_spreadsheet`, `get_values`) | No spreadsheet write, no AD change, no worksheet created |
| Listed routines, desktop tasks, session crons (read-only) | No Gmail search, draft or send; no Gmail tool called anywhere |
| Created **one disabled, manual-only** cloud routine and ran it once (read-only prompt) | No recurring schedule; no live automation; no Google Cloud resources; no commit |

Large connector results were saved by the tool to local files outside the repository, processed locally for aggregate counts, and **deleted** after use.

## 2. Local test results (interactive Claude Code session)

| # | Item | Result | Status |
|---|---|---|---|
| 1 | Sheets connector available in this session | `Google Sheets` is a **claude.ai connector** (kind `connector`), status `connected`, 9 tools. `Gmail` is also `connected` (30 tools); **no Gmail tool was called** | VERIFIED |
| 2 | Access to spreadsheet and worksheet | Spreadsheet "CSC  Booking - All Agents" and worksheet `Calls DONE` (GID 1314582701, 15,662 × 35) readable; spreadsheet timezone `Asia/Calcutta` | VERIFIED |
| 3 | Header row | A1:AC1 = **29 headers, exactly as expected, in order**; AD1…AI1 empty (AD1 not yet created, as expected); `POST_CALL_CALL_ID` appears in no column | VERIFIED |
| 4 | Minimum records for date filtering | Column A only (dates, no customer data): 15,454 cells (A2:A15455) | VERIFIED |
| 5 | **Yesterday's count (2026-10-30, Asia/Kolkata)** | **9 records**, rows 15441–15449 (contiguous). Today (31 Oct): 6 rows (excluded). Future-dated: 0. An independent count in the cloud run also found 9 | VERIFIED |
| 6 | Aggregates for yesterday's 9 records | See §3 | VERIFIED |

## 3. Aggregate counts, yesterday's 9 records (no content)

| Measure | Count |
|---|---|
| Recording URL empty / whitespace-only | 4 / 0 |
| Recording URL single valid Fathom link | 5 |
| **Multiple recording URLs in one cell** | **0** (max 1 segment) |
| Rows with an invalid URL token / duplicate URL in one cell | 0 / 0 |
| Recording URLs shared across these rows | 0 |
| `Recording Sent` = yes / no / empty / other | 0 / 8 / 1 / 0 |
| Transcript present / **missing** | 4 / **5** |
| — missing but a valid recording URL exists (late-transcript candidate) | 1 |
| — missing and no recording URL (not classified; `Meeting Notes` was deliberately not read) | 4 |
| Longest transcript (characters; limit 50,000) | 30,674 (none ≥ 45,000) |
| `POST_CALL_CALL_ID` (AD) non-empty | 0 of 9 |

Earlier inspection (before today's test) saw one cell containing two Fathom URLs in older rows; none fall on yesterday's date.

## 4. Findings from the local test

**F1 — Date column quirks (affect the parser).**
- 10 historical cells (rows 5–14, year 2022) have the shape `"October 14 , 2022 "`: a space before the comma and a trailing space. The exact format `MMMM d, yyyy` rejects them. **The parser must trim and normalise whitespace, including a space before the comma.** They are outside any processing window, but a stricter parser would have mislabelled them.
- 2 empty date cells inside the data (rows 5230 and 6773).
- Dates are mostly ascending but **not strictly** (7 decreases). The sheet cannot be assumed sorted.

**F2 — A full-column read is impractical.** Reading column A alone returned ~307,000 characters, so the tool saved it to a file instead of returning it. The runbook must read **bounded windows** (e.g. the last ~300 rows, about 30 days at roughly 10 rows/day) and **verify coverage**: the window's earliest date must be older than `target_date − lookback − 1 day`; otherwise extend the window. Rows 15415–15455 (41 rows) cover 28–31 Oct. Gaps in ordering mean this needs the coverage check, not just "last N rows".

**F3 — Connector cannot test for "empty" cheaply.** Counting missing transcripts required fetching the transcript cells (~97 KB for 9 rows). Customer content therefore passes through the session whenever transcripts are checked (R-12), and large reads spill to files. A scheduled session must read transcripts **one record at a time**, only for eligible records, and never in bulk.

**F4 — `Calls DONE` has no protected ranges.** Sheet metadata (`sheets.protectedRanges`) shows protections on three other tabs ("Daily Lock", plus the Weekly and Monthly Report tabs) and **none on `Calls DONE`**. Nothing currently stops a connector account from editing any cell there. The metadata call works, so protection can be inspected through the connector (R-03). The connector's Google account is **not identifiable** from these calls (R-13: UNVERIFIED).

## 5. Cloud scheduled execution — results

| # | Question | Result | Status |
|---|---|---|---|
| C1 | Is cloud scheduling available here? | The routines API responds (HTTP 200); a cloud environment exists; one routine was created and run successfully. Desktop tasks (`scheduled-tasks`) and session crons also exist but were not used | VERIFIED (available) |
| C2 | Can a cloud run use the native **Google Sheets** connector? | **Yes, for reads.** The run (session `cse_01FMKRNXJ9UTJA8LUr5tBe8x`, 17 s, success) called `get_values` and returned the same 29 headers (AD1 empty) and the same count (9) | VERIFIED (manual trigger, reads only) |
| C3 | Can a cloud run use the native **Gmail** connector? | **Not tested.** Gmail was deliberately removed from the routine (and not called). It was attached by default, with URL `gmailmcp.googleapis.com/mcp/v1`, before being removed | UNVERIFIED |
| C4 | Are the **project instructions** (CLAUDE.md, workflows, skills, config) available in a cloud run? | **No.** "No sources configured"; working directory `/home/user` empty; `CLAUDE.md` absent. This repository has **no remote**, so a cloud session cannot reach it | **BLOCKED** (R-02) |
| C5 | Can a routine's connector be limited to read tools? | The API **accepted** `permitted_tools: ["get_spreadsheet","get_values"]`, but the cloud session still **listed all nine Sheets tools** including `update_values`, `append_values`, `batch_clear_values`, `insert_dimension`, `update_formulas`, `update_spreadsheet`, `copy_sheet_to_another_spreadsheet`. Whether a write would have been blocked at call time was **not tested** (it would need a write attempt) | PARTIAL → treat as **not enforced** |
| C6 | Do routine tool settings restrict built-in tools? | `allowed_tools` was `["Read","Glob","Grep"]`, yet the run used `Bash` successfully. So `allowed_tools` pre-approves; it does not restrict | VERIFIED (not a restriction) |
| C7 | Connector attachment defaults | A routine created through the API **attached all seven of the account's connectors by default** (Claude Docs, FlexiFunnels, FlexiMembership, affiliate testing, Gmail, Google Sheets, Claude Code Remote). Narrowing to one connector worked via `update` | VERIFIED |
| C8 | Network access of the sandbox | Plugin MCP servers failed with `ERR_PROXY_TUNNEL … 403 Forbidden`, so the sandbox sends outbound traffic through a restricted proxy. The Google Sheets connector worked regardless | PARTIAL |
| C9 | Schedule format | Routine cron and `run_once_at` are in **UTC**; minimum interval **1 hour**. 09:00 IST = **03:30 UTC** (`30 3 * * *`). Dispatch jitter for routines not observed | PARTIAL |
| C10 | Failure/run visibility | `list_runs` and `get_run_log` return the run's events and final result through the API | PARTIAL (notifications not tested) |
| C11 | Usage | 17 s, 6 turns for this trivial test | one data point only (R-09) |
| C12 | Scheduled `live`-style sending without approval | Not tested | UNVERIFIED (R-04) |

## 6. Side effects and leftovers (all non-destructive; please review)

| Item | Detail | Action |
|---|---|---|
| Anthropic cloud environment "Default" | `env_01Cs49hSdGFEfboTPFSfY4Ty` was **created automatically** when the scheduling skill loaded (the account had none). It is an Anthropic cloud environment, not a Google Cloud resource | Keep or remove at claude.ai |
| Routine `trig_017psPj1c1uxCuPDXDw9rvXu` | "PHASE1-readonly-feasibility-test", **disabled**, `run_once_at` 2027-12-31 (will not fire), Google Sheets connector only. One manual run done. Routines cannot be deleted through the API | Delete at https://claude.ai/code/routines if not wanted |
| Cloud session history | Session `cse_01FMKRNXJ9UTJA8LUr5tBe8x` is stored on claude.ai. It contains the 29 header names, date strings from rows 15400–15460 and counts only. No customer data | Informational (R-12) |
| Local temporary files | Three tool-result files containing sheet data were deleted | none |

## 7. Connector limitations discovered

1. A routine API-created by default attaches **every** account connector (including Gmail, FlexiFunnels, FlexiMembership) with URLs. Must be narrowed explicitly (OD-42).
2. Tool-level and built-in-tool settings on a routine are **not** reliable restrictions (C5, C6). They cannot be used as enforcement of AD-only writes or read-only behaviour.
3. Full-column reads overflow; transcript checks pull content (F2, F3).
4. The connector's Google account is not discoverable from within calls (R-13).
5. Cloud sessions cannot see local repository files; a remote repository is required (C4).
6. Routine timing is UTC with a 1-hour minimum interval (C9).

## 8. Remaining blockers for the next Phase 1 steps

| # | Blocker | Needed from |
|---|---|---|
| B1 | **No remote repository**, so R-02 (instructions in cloud runs) cannot be tested. Needs a **private** remote (e.g. GitHub), the claude.ai GitHub access for that repository, and approval to push instructions-only content (OD-21, OD-12) | You |
| B2 | Identify the Google account behind the Sheets connector and the Gmail connector, and whether it is the sheet owner or an editor (R-13, OD-36, OD-39) | You / sheet owner |
| B3 | Decide protected ranges on `Calls DONE` and verify Google rejects a forbidden write from the connector account **on a test copy** (R-03). Needs a test copy of the spreadsheet | You / sheet owner |
| B4 | Gmail in cloud runs (R-01, R-04): needs a test mailbox plan and approval before any Gmail call | You |
| B5 | Decision whether deterministic helpers are allowed (OD-38). `Bash` exists in the cloud sandbox; interpreters (e.g. Python) were not tested | You |
| B6 | Approval of data handling for cloud session history and the Anthropic-hosted sandbox with real transcripts (R-12, OD-12) | Management |
