# Source Sheet Profile (verified)

Status: **Verified by read-only inspection on 2026-10-31** through the Google Sheets MCP connector. Nothing was written to the spreadsheet.

**Updated with business decisions D-022 … D-025 (2026-10-31):** Call ID column AD, `Recording Sent` handling, the transcript automation dependency, and multi-segment recording URLs.

This document contains **no customer data**. Observations are described structurally; no names, emails, phone numbers, transcript text or Fathom share tokens are reproduced (share tokens grant access to recordings).

## 1. Location

| Item | Value | Status |
|---|---|---|
| Spreadsheet title | `CSC  Booking - All Agents` (two spaces) | Verified |
| Spreadsheet ID | `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI` | Verified |
| Source worksheet | `Calls DONE` | Verified |
| Worksheet GID (sheetId) | `1314582701` | Verified |
| Grid size | 15,662 rows × 35 columns (headers in A–AC; AD–AI empty at inspection) | Verified |
| Agent-owned column | AD, header `POST_CALL_CALL_ID` — the **only** approved write (D-024). Not yet created | Approved |
| Last data row at inspection | ≈ 15,455 (rows for 31 Oct 2026 already present) | Verified |
| Header row | Row 1 (single header row, no frozen rows) | Verified |
| Spreadsheet timezone | `Asia/Calcutta` (IANA alias of `Asia/Kolkata`) | Verified |
| Spreadsheet locale | `en_US` | Verified |

The spreadsheet is the CSC team's shared operational workbook (22 worksheets, including KPI, report, per-agent, `Old Calls DONE` and `Calls Backup` tabs). Only `Calls DONE` is in scope.

## 2. Columns (row 1 headers, exact text)

| Col | Header (exact) | Used by agent | Notes |
|---|---|---|---|
| A | `Date` | **Call date** | Real date cell (serial number), format `mmmm d, yyyy` (e.g. displays "October 30, 2026") |
| B | `Time of the call` | **Call time** | Real time cell (day fraction), format `h:mm am/pm` |
| C | `Customer Name` | **Customer name** | Free text; inconsistent casing (all caps, all lower, repeated words) |
| D | `Email` | **Customer email** | Free text; some values have trailing spaces |
| E | `Phone` | No | Inconsistent (stray quotes, leading `-`) — not needed |
| F | `Call lead by(who took the call)` | **Support agent name** | First name of the CSC agent; empty on future/unfilled rows |
| G | `Trustpilot Review (STARS)` | No | |
| H | `Hosted by` | No (reference) | Usually equals F |
| I | `Reachout for G2 review` | No | |
| J | `Answer in Booking Form` | Optional context | Customer's booking-form text (free text, stray quotes) |
| K | `Meeting Duration` | Optional | Free text (`36min`, `40 Min`, `0`) |
| L | `Meeting URL` | **Row matching only** | Zoom link, per booking; part of the row signature used when writing the Call ID (`call-id-strategy.md` §5). Never sent to the LLM or in the email |
| M | `Recording URL` | **Fathom recording URL(s)** | Recent rows: `https://fathom.video/share/<token>`. A cell may hold **several URLs = recording segments of one extended call** (D-025). Old rows (2022): Google Drive links. Empty for no-show/cancelled calls |
| N | `Recording Sent` | **Duplicate guard (read-only)** | `No` / `yes` / `NO`. Written by support executives while the manual process runs. `yes` → the agent never sends. Empty ≠ "not sent" (D-022) |
| O | `Customer Type` | Optional context | e.g. repeat/new customer, onboarding attended |
| P | `In which Industry he/ She working` | Optional context | |
| Q | `Meeting Notes` | **Call outcome signal** (+ optional context) | Free text. Completed calls: detailed numbered summary. No-show: "customer not came" / "Customer not came". Cancelled: "Call cancel" |
| R | `Mistakes that you made & what steps you will take to improve those mistakes.` | **Never** (internal) | Internal coaching notes — must never reach the LLM or the email |
| S–V | `Meeting 1` … `Meeting 4` | No | |
| W | `Customer Not Came` | Not usable | Header exists but **empty in all rows 15000–15455** |
| X | `Cancel` | Not usable | Header exists but **empty in all rows 15000–15455** |
| Y | `Who didn't give review, call them to book another slot & mail them` | No | |
| Z | `Bugs your getting in CSC` | No (internal) | |
| AA | `Suggetions your getting in CSC` | No (internal) | |
| AB | `Transcript` | **Transcript (read-only)** | Stored **directly in the cell** as text (not a link). Written by the existing transcript automation; the agent never writes it (D-023) |
| AC | `AI Summary` | Not used; **never written** | Written by the existing automation; e.g. `SKIPPED: no Fathom URL` when no URL |
| AD | `POST_CALL_CALL_ID` *(to be created)* | **Call ID (agent-written)** | `gen:{uuid4}`, written once per call record by the agent only (D-024) |

## 3. Field mapping summary

| Logical field (`data-model.md`) | Status | Source |
|---|---|---|
| `call_datetime` | **Verified** | A (date serial) + B (time serial), interpreted in Asia/Kolkata |
| `customer_name` | **Verified** | C |
| `customer_email` | **Verified** | D (trim whitespace) |
| `support_agent_name` | **Verified** | F |
| `fathom_urls` (ordered list) | **Verified** | M — parsed into one or more segment URLs (D-025) |
| `recording_sent` | **Verified** | N — `yes` / `no` / empty / other (D-022) |
| `transcript` | **Verified** | AB (direct text) |
| `call_status` | **Missing as a structured field** | Derived from Q free text (W and X exist but are unused) — OD-26 |
| `call_id` | **Approved, not yet created** | AD `POST_CALL_CALL_ID` (D-024) |
| `fathom_recording_id` | **Missing** | Only share tokens in URLs; a share token is not a recording ID — OD-03 |
| `recording_shareable` | **Missing** | All recent URLs are `/share/` links; public visibility not confirmed — OD-04 |
| `email_opt_out` | **Missing** | No column |
| `call_type` | **Missing** | Closest: O (`Customer Type`) — OD-10 |

## 4. Format findings

- **Dates are real date cells.** Grid data (via `get_spreadsheet`) shows serials (e.g. `46325`) and day fractions for time (e.g. `0.79166…` = 7:00 PM). The connector's `get_values` returns the formatted values `mmmm d, yyyy` and `h:mm am/pm` (e.g. "October 30, 2026", "7:00 PM"), which are unambiguous. No text-date ambiguity in sampled rows. Spreadsheet timezone is Asia/Calcutta = Asia/Kolkata, so serials map directly to IST.
- **Date and time are separate columns.** `call_date` = column A alone; `call_datetime` = A + B.
- **Transcripts** are Fathom-style text: one utterance per line, each line `[HH:MM:SS] Speaker Name: text`. Sampled lengths 13,778–30,674 characters (91–500 lines), below the 50,000-character cell limit. At least one transcript contains Hindi (Devanagari) text and repeated transcription noise.
- **Transcripts arrive after the call.** A completed 30 Oct call (Fathom URL and notes present) had an **empty transcript** when inspected on 31 Oct — confirming the deferral design.
- **Rows exist before the call happens.** Today's bookings appear with date, time, name, email, booking text and Zoom link, but no agent, notes, recording or transcript. Placeholder rows with only a date also exist.
- **Rows are grouped by agent, not sorted by time** within a day.
- **Values written by people:** cells in sampled rows are plain values, not formulas.

## 5. Data-quality issues found

| Issue | Example (structural) | Handling |
|---|---|---|
| Trailing spaces in emails | `name@domain.com ` | Trim before validation |
| Whitespace-only Recording URL | `" "` | Treat as empty → `MISSING_FATHOM_URL` (deferrable) |
| Two Fathom URLs in one cell | `<url1>  <url2>` | **Recording segments of one extended call** (D-025): extract all, dedupe, keep order, include all in one email |
| Same Fathom URL in two different rows | adjacent and non-adjacent duplicates | **Not** assumed to be the same call. Each row keeps its own Call ID. Exact duplicate entry (same email, date and time) → later row `DUPLICATE_SOURCE_ROW`; otherwise `RECORDING_URL_CONFLICT` for review (OD-31) |
| No structured cancel/no-show flag | W/X empty; outcome only in Q text | Deterministic text patterns on Q (OD-26) |
| Inconsistent name casing / repeated words | all caps, lower case, `X X` | Name normalisation rules (OD-32) |
| Mixed-case `Recording Sent` | `No` / `yes` / `NO` | Case-insensitive normalisation; unrecognised values → skip for review (D-022) |
| Date text with stray spaces | `"October 14 , 2022 "` in 10 historical cells (rows 5–14) | Trim and collapse whitespace before parsing (Phase 1 F1) |
| Empty date cells inside the data | rows 5230 and 6773 | Not call records |
| Dates not strictly ascending | 7 decreases in 15,454 dates | Never assume sort order; bounded window with coverage check (Phase 1 F2) |
| Placeholder rows | date only | Not a call record: no Call ID, not logged, counted in the run summary (`call-id-strategy.md` §4) |
| Old rows use Google Drive recording links | 2022 rows | Out of scope (pre-go-live; not in the target window). `INVALID_FATHOM_URL` if ever selected |
| Internal-only columns next to customer data | R, Z, AA | Never read into prompts |

**Phase 1 additions (2026-10-31, `phase1-results.md`):** `Calls DONE` has **no protected ranges** (three other tabs do); about 10 rows per day recently (41 rows for 28–31 Oct); yesterday (30 Oct) had 9 records, none with multiple recording URLs.

## 6. Implications for the design

1. **Call outcome:** E1/E2 eligibility checks use column Q text. Proposed deterministic patterns (case-insensitive, trimmed): no-show = `customer not came`, `not came`, `no show`, `didn't join`; cancelled = `call cancel`, `cancelled`, `canceled`, `rescheduled`. Empty Q with no Recording URL → defer (agent has not filled the row yet). Patterns to be confirmed with the CSC team (OD-26).
2. **Call ID:** stored in AD `POST_CALL_CALL_ID` (D-024). Assignment uses a write-safe row-matching procedure (`call-id-strategy.md` §6).
3. **Shareability:** all recent recording links are Fathom `/share/` links; whether they are viewable without login remains OD-04.
4. **Manual recording emails:** controlled transition from manual to automated sending (D-022). The agent always honours `Recording Sent = yes`, never treats an empty cell as proof of "not sent", and only sends for calls on or after the go-live date.
5. **Transcript automation:** an independent upstream dependency (D-023). The agent only reads `Transcript`, never writes `Transcript` / `AI Summary`, and handles late transcripts through deferral. Conflicts are listed in §7.
6. **Multiple recording URLs:** segments of one call, all included in one email (D-025).
7. **Internal notes:** column R (self-assessment of mistakes), Z and AA are staff-only and are excluded from every prompt and from the logs.
8. **Language:** Hindi/Hinglish content is real, not hypothetical → OD-08 matters for Phase 2.

## 7. Dependency on the existing transcript automation (D-023)

The automation's name, owner and schedule are not yet documented (OD-33).

| Aspect | Agent behaviour |
|---|---|
| Ownership | The automation stays independent. The agent does not call, trigger, configure or replace it |
| Data contract | The agent reads `Transcript` (AB) as written. It never writes AB or AC; the runbook allows writing AD only (instruction-level, R-03) |
| Timing | Transcripts may appear hours after the call. Empty → `PENDING` `MISSING_TRANSCRIPT`, rechecked each run within the wait window (D-019) |

Possible conflicts and mitigations:

| # | Possible conflict | Mitigation / open point |
|---|---|---|
| C1 | The automation runs less often than daily, or late, so transcripts miss the 1-day wait window | Watch `MISSING_TRANSCRIPT` skip rates in shadow mode; revisit D-019 once the schedule is known (OD-33) |
| C2 | The automation wrote `SKIPPED: no Fathom URL` before the URL was pasted, and may never retry | The agent ignores AC. Such calls wait, then skip as `MISSING_TRANSCRIPT`. Ask whether the automation retries (OD-33) |
| C3 | Multi-segment calls: does `Transcript` contain all segments or only the first? | If only part, analysis may flag the transcript as incomplete → skipped rather than wrong. Confirm with the owner (OD-33) |
| C4 | The automation rewrites `Transcript` after the agent has read it (e.g. fuller version) | The email reflects the version read. Pre-send re-read compares a transcript hash; if it changed, the call returns to `PENDING` and is regenerated |
| C5 | Concurrent writes to the same row (automation writes AB/AC, agent writes AD) | Single-cell writes only; no row-level writes; pre/post-write signature checks |
| C6 | The automation inserts, deletes or re-sorts rows | Identity is AD, not the row number; write-safe assignment (`call-id-strategy.md` §6) |
| C7 | Shared Google API quota | Different credentials are likely. Batch reads (one full-sheet read per run) keep the agent's usage small |
| C8 | Truncation at the 50,000-character cell limit for long or extended calls | `TRANSCRIPT_POSSIBLY_TRUNCATED` check |
