# Source Sheet Profile (verified)

Status: **Verified by read-only inspection on 2026-10-31** through the Google Sheets MCP connector. Nothing was written to the spreadsheet.

This document contains **no customer data**. Observations are described structurally; no names, emails, phone numbers, transcript text or Fathom share tokens are reproduced (share tokens grant access to recordings).

## 1. Location

| Item | Value | Status |
|---|---|---|
| Spreadsheet title | `CSC  Booking - All Agents` (two spaces) | Verified |
| Spreadsheet ID | `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI` | Verified |
| Source worksheet | `Calls DONE` | Verified |
| Worksheet GID (sheetId) | `1314582701` | Verified |
| Grid size | 15,662 rows × 35 columns (headers in A–AC; AD–AI empty) | Verified |
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
| L | `Meeting URL` | No | Zoom link |
| M | `Recording URL` | **Fathom URL** | Recent rows: `https://fathom.video/share/<token>`. Old rows (2022): Google Drive links. Empty for no-show/cancelled calls |
| N | `Recording Sent` | Not used yet (see OD-29) | `No` / `yes` / `NO` — mixed case; suggests recordings are sometimes sent manually |
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
| AB | `Transcript` | **Transcript** | Stored **directly in the cell** as text (not a link) |
| AC | `AI Summary` | Not used (see OD-29) | Written by an existing automation; e.g. `SKIPPED: no Fathom URL` when no URL |

## 3. Field mapping summary

| Logical field (`data-model.md`) | Status | Source |
|---|---|---|
| `call_datetime` | **Verified** | A (date serial) + B (time serial), interpreted in Asia/Kolkata |
| `customer_name` | **Verified** | C |
| `customer_email` | **Verified** | D (trim whitespace) |
| `support_agent_name` | **Verified** | F |
| `fathom_url` | **Verified** | M |
| `transcript` | **Verified** | AB (direct text) |
| `call_status` | **Missing as a structured field** | Derived from Q free text (W and X exist but are unused) — OD-26 |
| `call_id` | **Missing** | No ID column exists — OD-02 |
| `fathom_recording_id` | **Missing** | Only share tokens in URLs; a share token is not a recording ID — OD-03 |
| `recording_shareable` | **Missing** | All recent URLs are `/share/` links; public visibility not confirmed — OD-04 |
| `email_opt_out` | **Missing** | No column |
| `call_type` | **Missing** | Closest: O (`Customer Type`) — OD-10 |

## 4. Format findings

- **Dates are real date cells.** Reading with `UNFORMATTED_VALUE` + `SERIAL_NUMBER` returns serials (e.g. `46325`) and day fractions for time (e.g. `0.79166…` = 7:00 PM). Formatted values are `mmmm d, yyyy` and `h:mm am/pm`. No text-date ambiguity in sampled rows. Spreadsheet timezone is Asia/Calcutta = Asia/Kolkata, so serials map directly to IST.
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
| Two Fathom URLs in one cell | `<url1>  <url2>` | Ambiguous recording → policy needed (OD-31) |
| Same Fathom URL in two different rows | adjacent and non-adjacent duplicates | `DUPLICATE_SOURCE_ROW` when same customer; needs review when different customers (OD-31) |
| No structured cancel/no-show flag | W/X empty; outcome only in Q text | Deterministic text patterns on Q (OD-26) |
| Inconsistent name casing / repeated words | all caps, lower case, `X X` | Name normalisation rules (OD-32) |
| Mixed-case `Recording Sent` | `No` / `yes` / `NO` | Normalise if ever used (OD-29) |
| Placeholder rows | date only | No email/URL/transcript → deferred, then skipped; or ignored if name and email are both empty (Phase 1 rule) |
| Old rows use Google Drive recording links | 2022 rows | Out of scope (pre-go-live; not in the target window). `INVALID_FATHOM_URL` if ever selected |
| Internal-only columns next to customer data | R, Z, AA | Never read into prompts |

## 6. Implications for the design

1. **Call outcome:** E1/E2 eligibility checks use column Q text. Proposed deterministic patterns (case-insensitive, trimmed): no-show = `customer not came`, `not came`, `no show`, `didn't join`; cancelled = `call cancel`, `cancelled`, `canceled`, `rescheduled`. Empty Q with no Recording URL → defer (agent has not filled the row yet). Patterns to be confirmed with the CSC team (OD-26).
2. **Call ID:** no ID column; Fathom recording IDs unavailable. Options are re-evaluated in OD-02 (the sheet is a shared team workbook, so adding a column needs the owner's approval).
3. **Shareability:** all recent recording links are Fathom `/share/` links; whether they are viewable without login remains OD-04.
4. **Existing automation:** something already fills `Transcript` and `AI Summary`, and the team tracks `Recording Sent`. The agent must not duplicate an email the team already sends (OD-29).
5. **Internal notes:** column R (self-assessment of mistakes), Z and AA are staff-only and are excluded from every prompt and from the logs.
6. **Language:** Hindi/Hinglish content is real, not hypothetical → OD-08 matters for Phase 2.
