# Phase 4: tracking schema (the Send Log)

Status: **designed and implemented as code (`src/lib/sendlog.js`); the worksheet `Send Log` was created on 2026-11-01 on the user's explicit authorisation (D-055)**: sheet ID 1001 in the destination spreadsheet, 19 headers verified by read-back (`checkHeaders` ok), row 1 frozen, plain-text format on A1:S1000, no data rows yet. `Sheet1` was not touched.

## Decision
The approved 21-column draft schema in `Sheet1` is **not changed** (adding send columns would break the header check and mix a draft record with an event history). Send tracking goes in a separate worksheet `Send Log` of the same destination spreadsheet (`1_TxhedZ...`), **append-only: one row per state transition**. The current state of a send is the fold of its events (last event per send key). `Sheet1` stays the authoritative record of drafts; the Send Log is the authoritative record of what happened to each send. They are joined by the source fingerprint and the send key; the destination row number is a reference only.

## Columns (19, headers exact)
Event ID, Event At, Run ID, Send Key, Draft Hash, Source Fingerprint, Destination Row (reference only), Customer Email, Email Subject, Body Hash, From State, To State, Actor, Reason / Code, Gmail Message ID, Gmail Thread ID, Delivery Mode, Retry Count, Error Info.

Covers the tracking items requested for Phase 4: run ID, source fingerprint, destination reference, customer email, subject, validation status (a send exists only for `PASSED` drafts; the check is in the pre-send checks), send status (To State), Gmail message ID, timestamp, error, retry count, reconciliation status (the states `SEND_OUTCOME_UNKNOWN` and `RECONCILIATION_REQUIRED`). Plain-text format for the timestamp, key and hash columns; formula-looking text is neutralised (`'` prefix). Customer email and subject appear here because they appear in `Sheet1`; the operational daily summary carries identifiers and counts only.

## Rules
- A row is appended **before** the Gmail call (`SEND_IN_PROGRESS`); if that write fails there is no send.
- Only transitions allowed by `src/lib/sendstate.js` can be recorded; rows are never edited or deleted. A correction is a new event.
- Event IDs are `<run id>-<4 digit sequence>`, resuming from the existing log.
- Gate: writes to this worksheet are guarded like every destination write (`writes_enabled`, `destination_sharing_verified`, the spreadsheet ID check).