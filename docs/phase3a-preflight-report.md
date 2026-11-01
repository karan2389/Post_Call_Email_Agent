# Phase 3A — Real Spreadsheet Inspection and Preflight Report

Date: 2026-11-01. Read-only inspection through the connected Google Sheets tools. **No write of any kind**, no draft, no transcript read, no Gmail, no schedule, no backup access. No customer values are recorded here (aggregates and formats only). Phase 3B has not started.

> **Update 2026-11-01 (Phase 3B record, D-037):** the real-transcript and customer-data-storage approvals listed as missing in section 6 have since been given and recorded; the retention period is still to be confirmed; connector account, source Viewer restriction and destination sharing remain unverified. The point-in-time results below are unchanged.

> **Update 2026-11-01 (connector identity, D-038):** the connector Google account is `karan.s@flexifunnels.com`, confirmed by the user on 2026-11-01 (reported to the agent; the Sheets connector cannot show it, so it is not independently verified). Access: **Editor (read + write) on `CSC  Booking - All Agents`** and **Editor (read + write) on `Phase 3 Emails`**. `Calls DONE` has no protected ranges, so the connector account can modify the source and **source write protection is NOT enforced**. Still unresolved: source protection (Viewer or an equivalent Google-enforced restriction) and the destination sharing list. Section 3 below is the point-in-time result (access level then unknown).

## 1. Source spreadsheet (verified)

| Item | Result |
|---|---|
| Identity | ID `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, title "CSC  Booking - All Agents" (two spaces), timezone `Asia/Calcutta` |
| Worksheet | `Calls DONE`, GID `1314582701`, 35 columns (A–AI), 15,662 grid rows; data currently ends near row 15455 |
| Headers A–AC | Match `docs/source-sheet-profile.md`: Date (A), Time of the call (B), Customer Name (C), Email (D), Phone (E), Call lead by (F), … Meeting URL (L), Recording URL (M), Recording Sent (N), … Meeting Notes (Q), … Customer Not Came (W), Cancel (X), … Transcript (AB), AI Summary (AC) |
| AD–AI | Empty (header row and first rows). No Call ID column exists and none is added (D-036) |
| Date format | Formatted text such as `October 31, 2026` |
| Time format | Formatted text; **zero-padding is inconsistent** (`06:00 PM` next to `8:30 AM`). Normalise to 24-hour `HH:MM` |
| Recording URL | Fathom share links in column M; some cells empty; `Recording Sent` showed `No` for all rows sampled |
| Yesterday (2026-10-31 IST) | 6 call rows by date (4 with a recording URL, 2 without; `Recording Sent = No` for all 6). Transcript presence was not checked (no transcript read) |
| Protected ranges | **None on `Calls DONE`.** Protection exists only on the tabs Daily Report, Weekly Report and Monthly Report |
| Other tabs | 22 tabs including `Old Calls DONE`, `CSC Database`, `Calls Backup` (an in-workbook tab, not the backup spreadsheet; not used) |
| Differences from the documentation | None in the headers or the column map. New findings: time zero-padding inconsistency; yesterday's count (6) differs from the earlier 9 only because the target date changed |

## 2. Destination spreadsheet (verified)

| Item | Result |
|---|---|
| Identity | ID `1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40`, title **"Phase 3 Emails"**, timezone **`Etc/GMT`** (not Asia/Kolkata) |
| Worksheets | One: `Sheet1`, GID `0`, 26 columns (A–Z), 1,000 rows |
| Existing data | **Empty.** Range A1:Z10 returned no values: no header row, no rows |
| Formatting and structures | None found: no protected ranges, filters, merges, conditional formats, named ranges or developer metadata; no frozen rows; default column widths; no formulas |
| Consequence | Nothing existing needs preserving. The header row does not exist yet (a write that needs your approval) |
| Date handling risk | The sheet's timezone is `Etc/GMT`. Dates, times and timestamps must be stored as **plain text** (`YYYY-MM-DD`, `HH:MM`, ISO 8601 with `+05:30`) so Sheets does not convert them. The connector's input mode is not known; plain-text formatting of those columns is a formatting write that needs approval |

## 3. Connector permissions (not determinable without a write)

- The Sheets API metadata does not reveal whether the connected account is Viewer or Editor, and the connector account's identity is not exposed (R-13). Proving write access would need a write, which this task forbids. **Viewer or Editor access is unknown on both spreadsheets.**
- The connector exposes write tools (`update_values`, `append_values`, `batch_clear_values`, `insert_dimension`, `update_spreadsheet`, `update_formulas`, `copy_sheet_to_another_spreadsheet`) for any spreadsheet the account can edit.
- `Calls DONE` has no protected ranges. If the account can edit the source, **nothing but the runbook prohibition stops a write to it** (R-03, R-15).
- Destination access list (who else can view or edit it) cannot be read through the connector; it must be confirmed in the Google Sharing dialog by an owner.

## 4. Destination schema: comparison and recommendation

Actual sheet: empty, 26 columns available. The proposed 21 columns fit in A–U with five spare. **No change to the proposed schema is required.** Recommended final schema (header text exactly as shown), unchanged from D-036:

A Call Date · B Call Time · C Customer Name · D Customer Email · E Support Agent · F Recording URL(s) · G Recording Count · H Email Subject · I Email Body · J Word Count · K Validation Status · L Validation Issue Codes · M Processing Status · N Reason Code · O Draft Created At · P Last Updated At · Q Transcript Hash · R Skill Versions · S Run ID · T Error / Review Notes · U Source Row (reference only)

(The numbered list in the task named the last header `Source Row`; D-036 and the design document use `Source Row (reference only)`. Pick one before the header is written; the recommendation keeps the longer, self-explaining form.)

Proposed one-time setup on approval (not performed): write the 21 headers in row 1; set columns A, B, F, O, P, Q to plain-text format so dates, times, URLs, timestamps and hashes are not converted; optionally freeze row 1. No columns are created, deleted, renamed or reordered beyond writing the header row.

## 5. Idempotency and collision handling (design)

Fingerprint (D-036) = normalised Call Date (`YYYY-MM-DD`) + Call Time (24-hour `HH:MM`, zero-padded) + Customer Email (trimmed, lower-case). Not a unique identifier. Two records are the **same call** only when the fingerprint **and** the recording URL set match.

**Association key.** Fingerprint, refined by the normalised recording URL set (split on whitespace and newlines, de-duplicated, order-insensitive for matching, order-preserving for storage) whenever a fingerprint has more than one candidate.

**Recognising flagged collisions on repeat runs (no extra rows).** Collision review rows are written with `Processing Status = REVIEW_REQUIRED`, `Reason Code = FINGERPRINT_COLLISION`, their own URL set and Source Row, and a neutral note. On every later run, before any write, per fingerprint:

1. Read the destination rows with that fingerprint (bounded read of columns A, B, D, F, M, N, U).
2. For each source record in the colliding group, look for a destination row with the same fingerprint and the same URL set. If found, the record is already represented: **write nothing** (do not touch Last Updated At).
3. If a source record has no URL set, or its URL set equals another group member's, URLs cannot tell them apart. Reconcile by **count**: if the number of existing `FINGERPRINT_COLLISION` rows for the fingerprint equals the number of source records in the group, treat the group as already represented. Source Row is only a reference to explain mismatches, never the match key.
4. If the counts differ, or a stored draft's URL set differs from the source record's, or the rows cannot be reliably associated: **write nothing automatically**; list the fingerprint and row references in the run report for a human. The only automatic write allowed in a collision group is appending exactly one review row for a source record that is positively distinguishable (a URL set no destination row has) when the existing rows are otherwise consistent.
5. A group that grows (a third identical record appears) is reported, not auto-expanded, unless rule 4's single-row exception applies.
6. Review rows are never regenerated, so a run that changes nothing writes nothing.

**Same-day separate calls** (different times) have different fingerprints and are independent. **Existing drafts** (`DRAFT_READY`, `REVIEW_REQUIRED` with a stored draft) are never overwritten. **Deferred, skipped (non-terminal) or failed rows** are updated in place when the call becomes eligible; the previous `Reason Code` is kept in `Error / Review Notes` (for example `previous: MISSING_TRANSCRIPT`) and `Draft Created At` is set only when a draft is first stored, so the history survives without extra rows.

**Resolving a collision (OD-46, proposed, needs your decision):** a human starts `Error / Review Notes` with `RESOLVED: SEPARATE` or `RESOLVED: DUPLICATE`. On the next run `SEPARATE` makes the record a normal call keyed by fingerprint + URL set (its review row is updated in place into the draft row); `DUPLICATE` sets `Processing Status = SKIPPED`. Without a marker the row stays flagged.

## 6. Approvals and gates (status)

| Gate | Status |
|---|---|
| Start of Phase 3 | Given ("officially starting Phase 3") |
| Real transcript processing approval (OD-12, R-12) | **Not recorded as an explicit approval.** Needs a written statement from you |
| Persistent storage of customer names, emails, recording links and email bodies in the draft spreadsheet | **Not established.** Needs an explicit decision (including retention, OD-19) |
| Connector account known (R-13) | **Unknown** |
| Source protected against accidental writes by enforceable permissions | **No.** No protected ranges on `Calls DONE`; Viewer/Editor level unknown |
| Destination access restricted to authorised personnel | **Unverified** (access list not readable via the connector) |
| Destination headers agreed and written (OD-45) | Sheet is empty; schema recommended above; **header write needs approval** |
| `draft_destination.writes_enabled` | `false` (unchanged) |

## 7. Remaining blockers for Phase 3B

1. Explicit approval to process real transcripts in Claude sessions (OD-12, R-12).
2. Explicit approval to persist customer data (names, emails, recording URLs, drafts) in the draft spreadsheet, with a retention rule (OD-19).
3. Which Google account the connector uses and its access on both spreadsheets (R-13, R-15). **Recommended:** make that account Viewer on the source (or protect `Calls DONE` against it) so "read-only" is enforced by Google, not by instructions. If it must stay an Editor, accept the residual risk in writing.
4. Destination sharing check: access limited to named support leads, no link sharing (an owner confirms in the Sharing dialog).
5. Approval of the header write and plain-text column format on the draft sheet (OD-45), and the final header spelling.
6. Collision-resolution marker convention (OD-46; not needed to start, needed to resolve).
7. Open policy decisions that affect drafts: OD-11 (sensitive topics), OD-08 (language), OD-05 (perspective).

## 8. Phase 3B implementation plan (not started)

1. **Approvals recorded** in `docs/open-decisions.md` and `config/run-settings.yaml` (OD-12, storage approval, access confirmation, header spelling).
2. **Setup (one write step, after approval):** write the 21 headers and plain-text formats to the draft sheet; set `headers_verified: true`. Nothing else is written.
3. **Runbook for a manual Phase 3 run** (`workflows/daily-post-call-run.md` Phase 3 section): PREFLIGHT (settings, target date = previous day in Asia/Kolkata, destination header check), FETCH (bounded window from the end of `Calls DONE`, coverage check), FILTER and ELIGIBILITY (E1–E18, `Recording Sent = yes` excludes, deferral of missing transcripts), DUPLICATES (fingerprint and collision rules above), ANALYSE (one transcript at a time), GENERATE, VALIDATE (deterministic checks and the semantic validator in a separate session), STORE (append or in-place update only as allowed), report (codes and counts only).
4. **Small dry run first:** a limited number of records (`max_records_per_run`), reviewed by you before wider use; drafts stay in the draft sheet only.
5. **Idempotency check on that dry run:** repeat the run and confirm it writes nothing new; confirm collision handling with a synthetic collision on a **test copy** of the draft sheet, not the real one.
6. **Safeguards throughout:** source never written, backup never touched, Gmail not attached or invoked, no scheduled task, tool-result files deleted, no customer data in the repository.
7. **Exit review:** a sample of drafts compared with their transcripts, eligibility and recording URL handling checked, no write to the source, no Gmail call. Documentation updated (handoff, memory, decision log).

Pre-existing limitation: the four skills were last regression-tested before the final wording refinements (customer-summary 1.3.0, email-generation 1.4.0, email-validation 1.4.0 are untested). Phase 3B's first dry run is their first execution; treat its results as such.
