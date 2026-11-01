# Confidence artifact (B4, D-070)

Decision (user, 2026-11-02): keep `overall_confidence` out of the approved 21-column destination schema and store it in a **git-ignored local analysis artifact** with its evidence and the identifiers of the exact call and draft. Implemented in `src/lib/confidence.js` with `tests/unit/phase4-confidence.test.js` (8 groups, mutation-checked) and wired into `src/lib/pilot.js`. **No record exists yet, nothing was read from a sheet or a transcript, and no gate changed.**

## 1. How confidence is calculated
Finding: the transcript-analysis skill defines item-level confidence (high, medium, low) but gives **no rule** for `overall_confidence`; the model simply sets it. A model-declared value is therefore not trusted on its own.

`derived = min(declared, computed)`, so the model's declaration can only **lower** the result, never raise it. `computed` comes from counts the analysis already contains:
- **low** if any of: transcript not `clear`; generation mode not `full`; no items; any low or invalid item; any item without evidence quotes; sensitive topics present; injection attempt detected; skip recommended; declared low or invalid.
- **high** if none of the above, at least 70 percent of items are high, no `uncertain` owner and no unreadable-passage notes.
- **medium** otherwise.
The pilot accepts **medium or high** only.

## 2. Which evidence supports each level
| Level | Evidence the record stores (counts and flags only) |
|---|---|
| high | clear transcript, full mode, all items evidenced, at least 70 percent high-confidence items, zero uncertain owners, zero notes |
| medium | clear transcript, full mode, all items evidenced, no low items, but fewer highs, an uncertain owner or a note |
| low | any weakening reason from section 1; the reason codes are stored with the record |
The record never contains transcript text, quotes, names, addresses or the analysis itself (only its hash), so it carries no customer content.

## 3. How the artifact is tied to the exact draft
A record (`ConfidenceRecord/1`, file `local/confidence.json`, git-ignored) holds: `call_ref` (source row), `send_key`, **`draft_hash`** (recipient + subject + body), **`transcript_hash`**, **`skill_versions`**, `analysis_hash`, declared, computed and derived levels, reason codes, evidence counts, `created_at` and an `integrity` seal. Verification compares each of these with the **stored row** (the `Transcript Hash` and `Skill Versions` cells already exist in the 21-column schema, so nothing is added to it) and with the draft hash recomputed now. Any edit to the recipient, subject or body gives `CONFIDENCE_DRAFT_CHANGED`.

## 4. Missing, stale or inconsistent data: fail closed
Every defect means "no confidence", which excludes the draft from the C1 pool and makes its review card not approvable:
`CONFIDENCE_NOT_AVAILABLE`, `CONFIDENCE_RECORD_MALFORMED`, `CONFIDENCE_INTEGRITY_FAILED` (any hand edit), `CONFIDENCE_DERIVATION_INCONSISTENT` (the level is recomputed from the stored counts and may never exceed the declaration), `CONFIDENCE_CALL_MISMATCH`, `CONFIDENCE_SEND_KEY_MISMATCH`, `CONFIDENCE_DRAFT_CHANGED`, `CONFIDENCE_TRANSCRIPT_MISMATCH`, `CONFIDENCE_SKILL_VERSIONS_MISMATCH`, `CONFIDENCE_EXPIRED` (older than 14 days), `CONFIDENCE_FROM_THE_FUTURE`, `CONFIDENCE_TIME_INVALID`, `CONFIDENCE_CONFLICT` (two valid records for one draft that disagree). A confidence value supplied on the row itself is ignored.

## 5. Writing and using records
- **Writing:** when a draft is stored, the generating session builds the record from that run's analysis (`node src/p3.js confidence-record`, stdin `{analysis, ctx}`) and appends it to `local/confidence.json`. This is a local file write, not a sheet write.
- **Checking:** `node src/p3.js confidence-check` (stdin `{records, expected}`) returns the verified level or a failure code.
- **Pool and card:** `candidatePool` and `approvalCard` read confidence only through `resolveConfidence`.

## 6. Known limits and next steps
- The 7 validated drafts stored earlier have **no record** and no analysis artifact survives from those runs, so all of them are currently excluded (`CONFIDENCE_NOT_AVAILABLE`). Creating records for them means re-analysing their transcripts, which reads customer data and needs the user's explicit authorisation (bounded, one record at a time). Newly generated drafts get a record at storage time.
- The seal detects accidental or casual edits; it is not a defence against someone who can run the code and re-seal a forged record. The local folder must be protected like `.env`.
- The 70 percent threshold and the 14-day expiry are policy choices recorded here; changing them is a decision-log entry.
- The model's items and evidence are still produced by the analysis skill; this design makes the confidence auditable and fail-closed, it does not make the model more accurate.
