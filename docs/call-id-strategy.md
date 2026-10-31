# Call ID Strategy

Status: **Approved principle.** Implementation details depend on OD-02 and OD-03.

## 1. Rules

1. Every call has exactly one Call ID for its whole lifetime.
2. A Call ID is **immutable** once assigned. It is never regenerated, re-derived or replaced — even if a Fathom recording ID is added to the row later.
3. **Spreadsheet row numbers are never used** for identity, lookups or duplicate prevention. Rows can be inserted, deleted, sorted or filtered at any time.
4. The Call ID is the primary key of `POST_CALL_EMAIL_LOGS` and the link between source row, tracking row, events and the sent Gmail message.

## 2. Format

| Source | Format | Example (synthetic) |
|---|---|---|
| Verified Fathom recording ID | `fathom:{recording_id}` | `fathom:123456789` |
| Generated | `gen:{uuid4}` | `gen:3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f` |

The prefix makes the origin visible and prevents collisions between the two namespaces. `call_id_source` (`fathom` | `generated`) is also stored in tracking.

## 3. Assignment algorithm

Applied in the FILTER PREVIOUS-DAY CALLS stage (`pipeline.md`) to every source row selected for the run (target date, lookback range) and to rows with an unparseable call date. Historical rows from before go-live are not touched.

1. If the row's `call_id` cell is non-empty → use it as is. Validate format; if malformed → row is skipped with `INVALID_CALL_ID` (never overwritten automatically).
2. Else if a **verified** Fathom recording ID is available → `fathom:{id}`.
3. Else → `gen:{uuid4}`.
4. Write the Call ID into the source row's `call_id` column **and** create the `PENDING` row in `POST_CALL_EMAIL_LOGS`. Re-read the row to confirm the write landed in the intended row: match on the row's content (call datetime plus whichever of customer email, customer name and Fathom URL are present), never on row number. If it no longer matches (rows moved during the run), restore that cell to its previous value (empty), do not create the log row, log the anomaly, and leave the call for the next run.

A row's Call ID is assigned even when the row is not yet eligible (e.g. the transcript is missing), so a late transcript is matched to the same call.

## 4. What counts as a "verified" Fathom recording ID

A Fathom recording ID is verified only if one of these holds (OD-03):

- (a) It comes from a dedicated `fathom_recording_id` column populated by the upstream integration that writes the sheet; **or**
- (b) It is parsed from the Fathom URL using a pattern that has been confirmed against real Fathom URLs and documented in this file.

Until (a) or (b) is confirmed, the agent uses generated IDs. It does not guess an ID from an unverified URL format. Note: Fathom share links may contain a share token rather than the recording ID; a share token is not a recording ID.

**Verified 2026-10-31 (D-021):** the source sheet has no recording-ID column, and `Recording URL` holds `https://fathom.video/share/<token>` links (share tokens only). So the `fathom:` namespace will not be used in the MVP. A share-token-derived ID (`fathom-share:<token>`) is one of the OD-02 options. It is stable while the URL is unchanged, but it does not exist for rows without a recording, and some cells contain two URLs (OD-31).

## 5. Where generated IDs live

A generated ID is only immutable if it is stored with the row. Options (OD-02):

| Option | Description | Assessment |
|---|---|---|
| **A (recommended)** | Agent writes the ID into a `call_id` column in the source sheet | Simple; requires write access to one column of the source sheet; column must be protected from manual edits |
| B | Upstream process (e.g. the automation that fills the sheet) generates the ID | Best separation; requires changing the upstream process |
| C | Content fingerprint only | Rejected as the primary key: changes when data is corrected, so it is not immutable |

## 6. Source fingerprint (secondary duplicate guard)

`source_fingerprint = sha256( lower(trim(customer_email)) + "|" + normalised(fathom_url) )`

- Stored in tracking; used to detect the same call appearing twice (copy-pasted row, re-import) with different Call IDs.
- If a new Call ID has the same fingerprint as an existing tracking row that is `SENT` or in progress → new row is `SKIPPED` with `DUPLICATE_SOURCE_ROW`.
- The fingerprint is never the primary key.
- URL normalisation: lowercase scheme and host, strip trailing slash, strip tracking query parameters (exact rules finalised in Phase 1).

## 7. Edge cases

| Case | Behaviour |
|---|---|
| Row sorted / moved | Call ID travels with row; no effect |
| Row deleted after `SENT` | Tracking row remains; nothing re-sent |
| Row deleted before processing | Tracking row stays `PENDING`; next run cannot find source → `SKIPPED` `SOURCE_ROW_MISSING` |
| Someone edits a `call_id` cell | Treated as a new call; fingerprint check catches the duplicate |
| Fathom ID added after a `gen:` ID was assigned | Keep `gen:`; store the Fathom ID in tracking for reference |
| Two rows with the same Fathom ID | Second gets `DUPLICATE_SOURCE_ROW` |
| Customer details corrected after `SENT` | No resend (OD-20 covers manual reprocess) |
