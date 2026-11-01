# Call ID Strategy

Status: **Design approved (D-024); writing to the source is NOT yet authorised (D-029).** The proposed Call ID location is source column **AD**, header **`POST_CALL_CALL_ID`**. The original source currently has headers through AC and AD is empty. Earlier documentation proposing this column does not make it approved for writing.

## 0. Gate: all source writes stay disabled until every condition is met

1. Ownership of column AD is confirmed with the sheet owner.
2. The header `POST_CALL_CALL_ID` is approved.
3. Protected ranges are verified: Google is seen to reject a forbidden write from the connector account (R-03, OD-36), after which `source.protected_ranges_verified` may be set to `true`.
4. The backup synchronisation is confirmed **not to erase agent-owned data** in AD (OD-43, `backup-recovery.md`).

Until then `source.source_writes_enabled` is `false`, and no cell in the source, including the AD header, is written. Sections below describe the intended behaviour once the gate is open.

## 1. Rules

1. Every call record has exactly one Call ID for its whole lifetime.
2. The Call ID identifies the **customer call**, not a recording segment. A row with two or more Fathom recording URLs is still one call, one Call ID and one email (D-025).
3. A Call ID is generated **once** and is **immutable**. An existing valid Call ID is **never overwritten**, regenerated or replaced.
4. **Spreadsheet row numbers are never used** for identity or duplicate prevention. They are only a hint for where to look, and every use is verified against row content.
5. The **Fathom URL is never used as the identity**, alone or as part of the key, because the same URL can appear in different rows (verified).
6. The agent writes **only** to column AD of `Calls DONE`, one cell at a time. No other source column is ever written (`Transcript` and `AI Summary` in particular, D-023).
7. The Call ID is the primary key of `POST_CALL_EMAIL_LOGS` and links the source row, log row, events and the sent Gmail message.

## 2. Format

`gen:{uuid4}` — for example `gen:3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f` (synthetic).

- Validation regex: `^gen:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
- The `fathom:` namespace from the original design is not used: the sheet has no Fathom recording IDs (D-021). `call_id_source` is always `generated`.

## 3. Column contract (AD)

| Item | Rule |
|---|---|
| Header cell AD1 | Exactly `POST_CALL_CALL_ID` |
| Location check | Every run reads row 1. Run aborts with `CONFIG_ERROR` if AD1 is anything other than `POST_CALL_CALL_ID`, if `POST_CALL_CALL_ID` appears in any other column, or if the verified headers A–AC have changed |
| Header creation | One-time setup step, run only with explicit user approval: writes `POST_CALL_CALL_ID` to AD1 if AD1 is empty. Never overwrites a non-empty AD1 |
| Cell writes | One Sheets-connector `update_values` call per ID, with range exactly `Calls DONE!AD{row}` and a single value. Never a multi-cell range, `append_values`, `insert_dimension`, `batch_clear_values`, sort or format change on the source worksheet |
| Write guard | **None that is enforced.** The runbook allows only this one write pattern after the pre-write check, but instructions and agent checks do not prevent other writes (D-026). A code-level guard exists only in the future-alternatives design |
| Protection (required before any real-sheet write) | Google Sheets protected ranges such that the connector's account can edit AD but **not** A–AC or AE+, **verified** (R-03, OD-36). This works only if that account is not the owner or an allowed editor of A–AC. Until verified, the AD header and Call IDs are written only on a test copy |

## 4. Which rows get a Call ID

A row is a **call record** if it has a parseable `Date` and at least one of `Customer Name` or `Email`.

| Row | Call ID? |
|---|---|
| Call record dated within the selection window (`target_date − discovery_lookback_days` … `target_date`) | **Yes**, assigned in the FILTER stage, even if not yet eligible (so a late transcript joins the same call) |
| Call record dated today or in the future (booked, not yet happened) | No — assigned on the day after the call |
| Placeholder row (date only, no name or email) | No — counted in the run summary as `placeholder_rows` |
| Row with unparseable `Date` but with name or email, inside the scanned area | Yes, then logged `SKIPPED` `MISSING_CALL_DATETIME` once |
| Historical rows (dated before the window) | **No backfill.** Existing records are never touched |

## 5. Row signature (for matching, never for identity)

`row_signature = sha256( Date serial | Time serial | lower(trim(Email)) | normalised(Customer Name) | trim(Meeting URL) )`

- Uses the booking-level columns A, B, D, C and L. The Zoom `Meeting URL` (L) is per booking and differs between bookings, so it separates rows that share a Fathom URL.
- Deliberately excludes `Recording URL`, `Transcript`, `Meeting Notes` and other fields that change after the call.
- Stored in the log as `source_signature` at assignment time.
- **Scheduled-task note (D-026, R-11, OD-38).** Hashing and UUID generation need a deterministic helper run inside the session; the model must not invent hashes or UUIDs. Without a helper, the row match compares the **normalised field values directly** (Date and Time as formatted by the connector, email, name, Meeting URL), which needs no hashing. Call ID generation then requires a helper or another verified source of randomness. Phase 1 decides which (OD-38).

## 6. Assignment algorithm (write-safe)

Runs per call record that has an empty AD cell, in the FILTER stage. Each record is handled on its own, and a failure affects only that record.

1. **Snapshot.** The full-sheet read (Stage 1) gives each row its values and current row number.
2. **Ambiguity check.** If another call record in the snapshot has the same `row_signature` **and** an empty AD, both are an exact duplicate entry. Assign each its own ID (steps 3–7), then the duplicate check (Stage 4) skips the later one as `DUPLICATE_SOURCE_ROW`. Their identical content means a swap between them is harmless.
3. **Generate** `gen:{uuid4}`.
4. **Pre-write check.** Re-read `A{row}:AD{row}`. Proceed only if its `row_signature` equals the snapshot signature **and** AD is still empty. Otherwise do not write: event `ROW_SHIFTED`, and retry on the next run.
5. **Write** the ID to `AD{row}` (single cell).
6. **Post-write verify.** Re-read `A{row}:AD{row}`. Success requires the signature to match and AD to equal the new ID.
   - Signature mismatch (the row moved in the instant between steps 4 and 5): search column AD for the new ID. If it sits on a row whose signature differs, clear **that cell only, and only if it still holds exactly this new ID** (restoring it to empty). Event `ROW_SHIFTED`, no log row, retry next run.
   - AD holds a different value (someone typed at the same moment): leave it, event `ROW_SHIFTED`, no log row.
7. **Create the log row** (`PENDING`) with `call_id`, `source_signature`, `source_row_hint` (row number, informational) and customer fields. If creating the log row fails, the ID stays in AD. The next run finds a valid ID with no log row and creates the log row then (step 1 of §7).

## 7. Existing IDs and later runs

| Found in AD | Action |
|---|---|
| Valid ID, log row exists | Use it. Refresh `source_row_hint`. Never rewrite AD |
| Valid ID, no log row (crash after write, or log row lost) | Create the log row for that ID (`CALL_ID_ADOPTED` event) |
| Invalid value (not matching the regex) | **Never overwritten**, never processed. No log row (there is no valid key). Recorded as an `INVALID_CALL_ID` event with the row hint, and counted in the run summary for human review |
| Same valid ID in two or more rows (e.g. a row copied with AD) | **None of those rows is processed.** If the log row is not `SENT`: `SKIPPED` `DUPLICATE_CALL_ID_IN_SOURCE` for human review. If already `SENT`: nothing is sent again; event noted |
| Log row exists but its ID is no longer in AD (cell cleared) | If **exactly one** call record has an empty AD and a `row_signature` equal to the stored `source_signature`, write the **same** ID back (event `CALL_ID_RESTORED`, same pre/post checks). Otherwise `SOURCE_ROW_MISSING` (terminal unless already `SENT`) |

## 8. Duplicate entries vs shared recording URLs

The fingerprint and URL rules live in `pipeline.md` Stage 4. In short:

- `source_fingerprint = sha256( lower(trim(Email)) | Date serial | Time serial )` detects the **same booking entered twice**. The later row → `DUPLICATE_SOURCE_ROW`.
- A Fathom URL that appears in **another row** does **not** make the rows the same call. Each row keeps its own Call ID and is investigated separately. Unless the rows are an exact duplicate entry (same fingerprint), sending a recording that may belong to a different customer is a privacy risk, so the not-yet-sent rows are skipped with `RECORDING_URL_CONFLICT` for human review (OD-31).

## 9. Edge cases

| Case | Behaviour |
|---|---|
| Rows sorted, inserted or deleted | Call ID travels with its row in AD; row numbers are only hints |
| Row moved between read and write | Pre/post-write checks prevent mis-assignment (§6) |
| Row deleted after `SENT` | Log row remains; nothing re-sent |
| Row deleted before processing | `SOURCE_ROW_MISSING` |
| Someone edits an ID in AD | Invalid → `INVALID_CALL_ID`; changed to another valid ID → treated as a different call, and the fingerprint check catches the duplicate |
| Customer details corrected after assignment | Same Call ID (identity is AD, not the signature). Signature drift only matters when restoring a cleared ID, which then fails safely to `SOURCE_ROW_MISSING` |
| Recording URL added, changed or extended to two segments later | Same Call ID; the URL list is re-read on every run (D-025) |
| Customer details corrected after `SENT` | No resend (OD-20 covers manual reprocess) |
