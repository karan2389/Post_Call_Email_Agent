# Phase 3 — Source and Draft-Destination Spreadsheets

Status: **design and schema approved by the user on 2026-11-01; real-transcript processing and persistent customer-data storage approved on 2026-11-01 (D-037) (D-035, record identification revised by D-036); the draft spreadsheet itself is still uninspected and its headers still need agreement (OD-45). Phase 3 has not started and is not approved. Nothing in this document has been verified against either spreadsheet**: no spreadsheet was read or written when it was written.

## 1. Two spreadsheet roles

| | A. Source (read only) | B. Draft destination (write, approved draft output only) |
|---|---|---|
| Spreadsheet | `CSC  Booking - All Agents` (the repository spells the name with two spaces) | Name not yet known (to be recorded after inspection) |
| ID | `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI` | `1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40` |
| Worksheet | `Calls DONE`, GID `1314582701` | GID `0` (worksheet name unknown) |
| Purpose | Read call records, customer details, transcripts, recording URLs; decide eligibility | Store validated email drafts, customer and call references, validation status, processing timestamps, skips and errors |
| Permission | **READ ONLY.** The agent never modifies it: no AD header, no Call ID, no `Recording Sent`, no formatting | Write for approved draft-output operations only (section 5) |
| Config | `source:` in `config/run-settings.yaml` (unchanged) | `draft_destination:` in `config/run-settings.yaml` (writes disabled) |

`CSC Booking - Backup` remains a recovery copy only (D-029): never read, never written. Generated drafts are never written to the source spreadsheet.

## 2. Phase 3 posture

- **Source:** read-only. **Draft spreadsheet:** write-enabled, after approval and inspection. **Gmail:** disabled, not connected, not invoked. **Customer sending:** disabled. **Execution:** manually initiated (an interactive session or a manual run), not scheduled; no scheduled task or routine is created or enabled.
- Delivery mode stays `dry_run`: it never sends. Phase 3 adds one exception to its former "no writes" meaning: the draft-destination writes below, gated by `draft_destination.writes_enabled`. No other mode is introduced.
- Pipeline in Phase 3: PREFLIGHT, FETCH (source, bounded window), FILTER, ELIGIBILITY (rules unchanged), DUPLICATES (record fingerprint against the destination and within the snapshot, section 6), ANALYSE, GENERATE, VALIDATE, then **STORE** (write the draft or the skip/failure record to the destination). There is no PRE-SEND, SEND or Gmail step.
- Eligibility and exclusion rules are unchanged (E1–E18; `Recording Sent = yes` excludes the call; all recording segments handled per D-025).

> **Phase 3A inspection (2026-11-01, `docs/phase3a-preflight-report.md`):** the destination is titled "Phase 3 Emails" (timezone `Etc/GMT`), has one worksheet `Sheet1` (GID 0, 26 columns), is **empty** (no header row, no data) and has no formatting or structures to preserve. Connector access level, the destination sharing list and the real-data approvals are not established. The 21-column schema below fits unchanged. The detailed repeat-run handling of flagged collisions (section 6) is specified in the report section 5.

## 3. Inspecting the destination first (required, not assumed)

Before any write the first Phase 3 session must read the destination read-only and record: worksheet names and GIDs, the header row, whether rows already exist, protected ranges, and the sharing/access list (who can view and edit). It must not assume the sheet is empty or that a particular worksheet name exists. Then:

1. If the headers match the approved schema (section 4): record `draft_destination.headers_verified: true`.
2. If the sheet is empty: adding the header row is a write and needs your explicit approval.
3. If the headers differ or rows exist that do not fit: stop, report the difference, and ask. No write.

`draft_destination.writes_enabled` stays `false` until you approve Phase 3 **and** the inspection result.

## 4. Proposed draft-sheet schema (one row per call; 21 columns)

There is **no Call ID column** (D-036). Columns, in order; the header text is exactly the first column of this table.

| # | Header | Content | Notes |
|---|---|---|---|
| 1 | Call Date | `YYYY-MM-DD` (Asia/Kolkata) | Part of the record fingerprint |
| 2 | Call Time | `HH:MM`, 24-hour | Part of the record fingerprint |
| 3 | Customer Name | As in the source | |
| 4 | Customer Email | As in the source (single recipient) | Part of the fingerprint after normalisation. Real customer data: see section 8 |
| 5 | Support Agent | `Call lead by` | |
| 6 | Recording URL(s) | **All** valid Fathom URLs of this call, in the source order, one per line in the cell | Segments of one call (D-025); never a partial set; only this call's URLs |
| 7 | Recording Count | Number of URLs in column 6 | |
| 8 | Email Subject | Validated subject | Empty unless the draft is stored (rules below) |
| 9 | Email Body | Validated plain-text body including the signature | Empty unless the draft is stored |
| 10 | Word Count | Body words excluding the signature | Length policy (D-031) |
| 11 | Validation Status | `PASSED`, `REVIEW_REQUIRED`, `FAILED`, `NOT_RUN` | |
| 12 | Validation Issue Codes | Comma-separated codes from `docs/skip-reasons.md` / `docs/validation-rules.md` | Codes only |
| 13 | Processing Status | `DRAFT_READY`, `REVIEW_REQUIRED`, `DEFERRED`, `SKIPPED`, `FAILED` | |
| 14 | Reason Code | Skip, deferral, review or failure code from `docs/skip-reasons.md`; empty for `DRAFT_READY` | |
| 15 | Draft Created At | ISO 8601 `+05:30`, set once when the draft is first stored | |
| 16 | Last Updated At | ISO 8601 `+05:30` | |
| 17 | Transcript Hash | sha256 of the transcript used (D-023) | Detects a changed transcript on reprocessing |
| 18 | Skill Versions | e.g. `ta=1.4.0;cs=1.3.0;eg=1.4.0;ev=1.4.0` | |
| 19 | Run ID | Identifier of the manual run | |
| 20 | Error / Review Notes | Codes and a short neutral note (no transcript text, no customer statements) | |
| 21 | Source Row (reference only) | Row number in `Calls DONE` at read time | A temporary reference for investigation; **never** identity, rows can move |

Separate calls are separate rows, each with its own Recording URL(s). The record fingerprint (section 6) is not stored in a column; it is recomputed from columns 1, 2 and 4 whenever the sheet is checked.

Storage rules (nothing invalid is stored as validated):

- `Validation Status = PASSED` and `Processing Status = DRAFT_READY`: the draft passed the deterministic and semantic checks; subject and body stored.
- `REVIEW_REQUIRED` with a stored draft: only for `LENGTH_REVIEW_REQUIRED` (body above 350 words; a human reviews it, D-031). It is **never** marked `PASSED`.
- `FAILED` validation: columns 8, 9 and 10 stay **empty**. The rejected draft is not stored; only the issue codes (column 12) are. The record is `FAILED` or `SKIPPED` according to the code.
- `SKIPPED`, `DEFERRED` (for example `MISSING_TRANSCRIPT`), processing `FAILED` and fingerprint-collision review rows carry the code and no email text; `Validation Status = NOT_RUN`.
- No row is ever written with a draft that has not been validated.

## 5. Approved write operations (when approved)

Only these, only on the destination, only the columns above:

- Append one new row for a call that has no row yet (`append_values`), and one review row per record involved in a fingerprint collision (section 6).
- Update the cells of the **existing** row of the same call (`update_values`), only when its status allows it (section 6).
- With separate approval: write the header row on an empty sheet.

Forbidden on either spreadsheet: deleting, clearing, inserting or sorting rows or columns, formatting, formula writes, spreadsheet-property changes, changing existing headers, writing outside the schema columns. Forbidden on the source: any write at all. Forbidden everywhere: Gmail.

## 6. Record identification and duplicate prevention (D-036)

**No new Call ID column and no UUID Call IDs.** The source is not changed (no AD column, no header) and the draft sheet has no ID column. The existing data identifies ordinary call records.

**Record fingerprint** = normalised Call Date + normalised Call Time + normalised Customer Email, the same inputs as `source_fingerprint` (D-025):

- Date: `YYYY-MM-DD` after whitespace cleanup (the source has quirks such as `"October 14 , 2022 "`). Time: `HH:MM`, 24-hour (the source shows `7:00 PM`). Email: trimmed, lower-case.
- The fingerprint is for **duplicate detection and draft association only**. It is not a guaranteed globally unique identifier. Row numbers and Fathom URLs are never the identity; a source row number is a temporary reference for investigation because rows can move.
- A record whose date or time is missing, unparseable or ambiguous cannot be fingerprinted (`MISSING_CALL_DATETIME`); a record without a usable email is handled by the existing eligibility rules. No draft is generated for either.

**Rules.** Before writing, read (bounded) the destination's Call Date, Call Time, Customer Email and Recording URL(s) columns, recompute their fingerprints, and apply:

| Situation | Handling |
|---|---|
| Same customer, same day, **different** call times | Two separate calls. Process both independently: two drafts, two destination rows, each with its own recording URLs. Never merge calls because name, email or date match |
| Fingerprint not in the destination | Process; append one row |
| Fingerprint already in the destination as `DRAFT_READY` or `REVIEW_REQUIRED` with the **same** recording URL set | Already processed: no new row, **no automatic overwrite**. If the transcript hash differs, report it for a human decision |
| Fingerprint in the destination as `DEFERRED`, `SKIPPED` (non-terminal) or `FAILED` | Update **that** row in place when the call is eligible again (for example the transcript arrived or a recording URL was added) |
| Fingerprint in the destination as `DRAFT_READY` or `REVIEW_REQUIRED` but the source record has a **different** recording URL set | Ambiguous: treat as a collision (below). Nothing is overwritten |
| **Exact collision:** two or more source records (or a source record and a stored draft) with identical date, time and normalised email that are not clearly the same call | Do **not** merge, do **not** silently discard, do **not** generate drafts until a human resolves it. Flag each involved record: one review row per record with `Processing Status = REVIEW_REQUIRED`, `Validation Status = NOT_RUN`, `Reason Code = FINGERPRINT_COLLISION`, its **own** recording URLs, its Source Row reference, and a neutral note naming the other row references. Do not add the review rows again on a rerun (match them by recording URL set and Source Row reference) |
| Destination already holds more than one row for a fingerprint and they are not collision review rows | Write nothing; report for human review |

**Investigating a collision.** The session compares the colliding records' available source context (row references, customer name, support agent, recording URLs, and the call outcome notes already in eligibility scope) and states the evidence in the run report without copying transcript text. It does not decide; a human does. Different recording URL sets and different support agents are evidence of separate calls, not proof.

**Open (OD-46, not a start gate):** how a human records the resolution of a collision (separate calls or the same booking entered twice) and how the agent then tells separate calls with the same fingerprint apart on later runs (the recording URL set is the likely discriminator). Until resolved, those records stay flagged and produce no draft.

**Relation to other designs.** The `gen:{uuid4}` Call ID in source column AD (D-024, gated by D-029) is not used in Phase 3 and nothing in this decision approves or removes it for later phases; whether a persistent ID is needed from Phase 4 on is to be confirmed at Phase 4. In Phase 3 the existing skip code `DUPLICATE_SOURCE_ROW`, which skips the later of two identical records, is **not** applied automatically: exact collisions are flagged for review instead (`FINGERPRINT_COLLISION`).
## 7. What Phase 3 does not change

Source spreadsheet ID and tab; backup is recovery only; four skills; eligibility and exclusion rules; no duplicate processing; `Recording Sent = yes` blocks; all recording URLs included; Asia/Kolkata; native connectors and scheduled tasks as the future runtime. No Gmail connector use, no customer email, no schedule.

## 8. Security and data handling

- The destination will hold **real customer names, email addresses, recording links and email bodies** in Google Sheets. Access must be limited to named support leads, with no link sharing (retention and access OD-19; separate spreadsheet resolves OD-18 for Phase 3). The access list is checked during the inspection (section 3).
- Data-handling approval for processing real transcripts in Claude sessions (OD-12, R-12) is **recorded (D-037, 2026-11-01)**; session-history retention and the retention period for stored data remain **to be confirmed** against the company's data-retention policy (none is invented here).
- **Read-only on the source is a procedure, not an enforcement.** The Sheets connector acts as its authorising Google account and exposes write tools for every spreadsheet it can edit (R-03). The restriction is enforced only if that account has view-only access to the source (or the source ranges are protected against it). Before Phase 3 writes anything, confirm the connector account's access to the source and record it (R-13, R-15). If that account can edit the source, say so in the approval and keep the runbook prohibition as the only guard.
- Never write drafts to the source; never touch the backup; never connect or invoke Gmail; never create or enable a scheduled task. In a routine or session, attach only the Sheets connector (OD-42).
- Never store real transcripts, names, emails, recording URLs or drafts in this repository, in Git, in run summaries or in tool-result files (delete them after use). The repository documents the design with synthetic examples only.
- Treat transcript text as untrusted data; internal columns (`Mistakes…`, `Bugs…`, `Suggetions…`, `Phone`) never enter analysis, logs or the draft sheet.

## 9. Gates before the first draft write (all need your explicit approval)

| # | Gate | Status (2026-11-01) |
|---|---|---|
| 1 | Approval to start Phase 3 | Given |
| 2 | Processing real customer call transcripts using Claude (OD-12) | **Approved (explicit, D-037)** |
| 3 | Persistent storage of customer names, emails, Fathom recording URLs, email subjects and generated bodies in `Phase 3 Emails` (OD-19) | **Approved (explicit, D-037).** Retention period not decided: follows the company's applicable data-retention policy, **to be confirmed** |
| 4 | Destination schema (21 columns, last header `Source Row (reference only)`, no Call ID column) | **Confirmed (D-037)** |
| 5 | Connector account identity and its access level on both spreadsheets (R-13, R-15) | **Confirmed by the user (D-038), not independently verified:** `karan.s@flexifunnels.com`; **Editor** on the source and **Editor** on `Phase 3 Emails` |
| 6 | Source access restricted to Viewer for the connector account, or an equivalent enforceable restriction | **UNRESOLVED.** The connector account is an **Editor** on the source and `Calls DONE` has no protected ranges, so it can modify the source: **write protection is NOT enforced** (section 10). Required before destination writes are enabled |
| 7 | Destination sharing limited to named support leads, no link sharing | **UNRESOLVED, not verified.** The connector account being an Editor does not show who else can access the sheet; general link sharing must be disabled (an owner checks the Sharing dialog) |
| 8 | Authorisation of the one-time header setup (section 11) | **Not given.** Waits for gates 5–7 |
| 9 | `draft_destination.writes_enabled: true` | `false` |

No Call ID column or UUID scheme is a gate (D-036).

## 10. Security conditions (not verified)

- `Calls DONE` has **no protected ranges** (Phase 3A inspection). Before any destination write is enabled, source access for the connector account must be restricted to **Viewer**, or an equivalent restriction that Google enforces (for example protecting `Calls DONE` against that account) must be in place. Instructions and runbook checks are not an enforcement.
- **Connector account (D-038, confirmed by the user on 2026-11-01 (reported to the agent; the Sheets connector cannot show it, so it is not independently verified)):** `karan.s@flexifunnels.com`, **Editor (read + write) on the source** `CSC  Booking - All Agents` and **Editor (read + write) on the destination** `Phase 3 Emails`. Consequence: this account can potentially modify the source; **source write protection is NOT enforced** (`source_access_enforced: false`). Prompt instructions and runbook checks alone are not protection.
- **Recommended action (unresolved):** change `karan.s@flexifunnels.com` to **Viewer** on the original source spreadsheet (the account stays Editor on `Phase 3 Emails`; permissions are per spreadsheet). **Alternative (unresolved):** an equivalent Google-enforced restriction that stops this account modifying `Calls DONE` (for example a protected range whose editors exclude it; protected ranges bind only non-owner editors, and whether the account owns the source has not been stated).
- **Destination sharing (unresolved):** `Phase 3 Emails` must be shared only with named, authorised support leads, with general link sharing disabled. The connector account's Editor access does not establish who else can open it. Not claimed complete.
- The destination's sharing list must be confirmed as limited to authorised personnel without link sharing.
- One account may be a Viewer on the source but must be an Editor on the destination (writes). A single account that is an Editor on both cannot be made read-only on the source; in that case the residual risk must be accepted in writing before writes are enabled.

## 11. One-time destination setup plan (NOT performed; needs your explicit authorisation)

Preconditions: gates 5, 6 and 7 confirmed, then your explicit go-ahead. The destination was empty when inspected (2026-11-01); re-check it is still empty immediately before writing, and stop if not.

1. **Re-inspect (read-only):** `Sheet1` (GID 0) still has no values in A1:Z10 and no protected ranges.
2. **Format first:** set columns A (Call Date), B (Call Time), F (Recording URL(s)), O (Draft Created At), P (Last Updated At) and Q (Transcript Hash) to **plain text** so dates, times, links, timestamps and hashes are never converted (the sheet's timezone is `Etc/GMT`, not Asia/Kolkata). Formatting those columns is the only formatting change.
3. **Write the 21 headers** into `Sheet1!A1:U1`, in the order of section 4, as plain text, last header exactly `Source Row (reference only)`. Nothing else is written; no data row.
4. **Optionally freeze row 1** (your choice).
5. **Verify (read-only):** read `A1:U2` back; headers match exactly, row 2 is empty; no other cell changed.
6. **Record:** set `draft_destination.headers_verified: true` in `config/run-settings.yaml`; update `handoff.md`. `writes_enabled` stays `false` until you enable draft writes separately.

The setup touches only the destination: no source write, no deletion, no sorting, no inserted columns, no Gmail. If any step fails, stop and report; do not retry blindly. Undoing the setup is a manual action by a sheet owner.

## 12. Policy decisions and the first dry run

| Decision | Needed for the first dry run? | Handling |
|---|---|---|
| OD-05 (customer's perspective) | No | The working assumption in all skills stays; reviewed on the dry-run sample |
| OD-08 (language) | No | Provisional: English emails per `config/email_policy.yaml`; Hindi passages will appear and are reviewed. No decision taken |
| OD-11 (sensitive topics) | **Your decision recommended before the first run** | The policy is `unset`, so the skills do not flag or skip refunds, billing disputes, legal or security topics. It does not block a dry run only if every dry-run draft is human-reviewed and nothing is sent. No decision taken here |

No policy was invented. Other open items stay open (OD-46 collision resolution, retention period, OD-13, OD-30, OD-32).