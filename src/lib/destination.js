'use strict';
// Draft-spreadsheet logic for Phase 3 (docs/phase3-draft-destination.md, D-036, D-037): the approved 21-column schema,
// storage rules, header check, and the idempotent planning of writes. Pure functions: this module never touches a
// spreadsheet. The session performs the reads and writes through the connector and only as the plan allows.

const N = require('./normalize');

const HEADERS = [
  'Call Date', 'Call Time', 'Customer Name', 'Customer Email', 'Support Agent', 'Recording URL(s)', 'Recording Count',
  'Email Subject', 'Email Body', 'Word Count', 'Validation Status', 'Validation Issue Codes', 'Processing Status',
  'Reason Code', 'Draft Created At', 'Last Updated At', 'Transcript Hash', 'Skill Versions', 'Run ID',
  'Error / Review Notes', 'Source Row (reference only)',
];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
const TEXT_COLUMNS = ['A', 'B', 'F', 'O', 'P', 'Q']; // plain text: Call Date, Call Time, Recording URL(s), Draft Created At, Last Updated At, Transcript Hash
const VALIDATION = ['PASSED', 'REVIEW_REQUIRED', 'FAILED', 'NOT_RUN'];
const PROCESSING = ['DRAFT_READY', 'REVIEW_REQUIRED', 'DEFERRED', 'SKIPPED', 'FAILED'];
const COLLISION = 'FINGERPRINT_COLLISION';

// row1: array of header cells read from Sheet1!A1:U1 (or wider).
function checkHeaders(row1) {
  const got = (row1 || []).map((c) => String(c == null ? '' : c));
  const diffs = [];
  HEADERS.forEach((h, i) => { if (got[i] !== h) diffs.push({ column: i + 1, expected: h, found: got[i] === undefined ? '' : got[i] }); });
  const extra = got.slice(HEADERS.length).filter((c) => c !== '').length;
  return { ok: diffs.length === 0 && extra === 0, diffs, extraColumns: extra };
}

const isEmptySheet = (values) => !values || values.every((r) => (r || []).every((c) => String(c == null ? '' : c).trim() === ''));

// Values written to a plain-text cell must not be read as formulas.
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
};

function history(prevStatus, prevReason, prevNotes) {
  const tag = `previous: ${prevStatus}${prevReason ? '/' + prevReason : ''}`;
  const p = String(prevNotes || '').trim();
  return p ? `${tag}; ${p}` : tag;
}

// o: { callDate, callTime, customerName, customerEmail, supportAgent, urls[], emailSubject, emailBody, wordCount,
//      validationStatus, issueCodes[], processingStatus, reasonCode, draftCreatedAt, lastUpdatedAt, transcriptHash,
//      skillVersions, runId, notes, sourceRow }
// Enforces the storage rules: only a validated draft (PASSED + DRAFT_READY) or a length-review draft carries email text.
function buildRow(o) {
  if (!VALIDATION.includes(o.validationStatus)) throw new Error('validationStatus invalid');
  if (!PROCESSING.includes(o.processingStatus)) throw new Error('processingStatus invalid');
  const hasText = Boolean(o.emailSubject || o.emailBody || o.wordCount);
  const validated = o.validationStatus === 'PASSED' && o.processingStatus === 'DRAFT_READY';
  const lengthReview = o.validationStatus === 'REVIEW_REQUIRED' && o.processingStatus === 'REVIEW_REQUIRED' && o.reasonCode === 'LENGTH_REVIEW_REQUIRED';
  if (o.processingStatus === 'DRAFT_READY' && !validated) throw new Error('DRAFT_READY requires validationStatus PASSED');
  if (o.validationStatus === 'PASSED' && o.processingStatus !== 'DRAFT_READY') throw new Error('PASSED requires DRAFT_READY');
  if (validated && !(o.emailSubject && o.emailBody)) throw new Error('a validated draft needs subject and body');
  if (hasText && !validated && !lengthReview) throw new Error('email text may only be stored for a validated draft or a length-review draft');
  const urls = o.urls || [];
  const r = new Array(HEADERS.length).fill('');
  r[COL['Call Date']] = o.callDate; r[COL['Call Time']] = o.callTime;
  r[COL['Customer Name']] = o.customerName; r[COL['Customer Email']] = o.customerEmail; r[COL['Support Agent']] = o.supportAgent;
  r[COL['Recording URL(s)']] = urls.join('\n'); r[COL['Recording Count']] = String(urls.length);
  r[COL['Email Subject']] = o.emailSubject || ''; r[COL['Email Body']] = o.emailBody || '';
  r[COL['Word Count']] = o.wordCount ? String(o.wordCount) : '';
  r[COL['Validation Status']] = o.validationStatus; r[COL['Validation Issue Codes']] = (o.issueCodes || []).join(', ');
  r[COL['Processing Status']] = o.processingStatus; r[COL['Reason Code']] = o.reasonCode || '';
  r[COL['Draft Created At']] = o.draftCreatedAt || ''; r[COL['Last Updated At']] = o.lastUpdatedAt || '';
  r[COL['Transcript Hash']] = o.transcriptHash || ''; r[COL['Skill Versions']] = o.skillVersions || '';
  r[COL['Run ID']] = o.runId || ''; r[COL['Error / Review Notes']] = o.notes || '';
  r[COL['Source Row (reference only)']] = o.sourceRow == null ? '' : String(o.sourceRow);
  return r.map(cell);
}

// values: Sheet1 rows including the header row. Returns parsed destination records (sheet row numbers are 1-based).
function parseDestination(values) {
  const out = [];
  (values || []).forEach((row, i) => {
    if (i === 0) return;
    const g = (h) => String((row || [])[COL[h]] == null ? '' : row[COL[h]]);
    if (!g('Call Date') && !g('Call Time') && !g('Customer Email')) return;
    const date = N.normalizeDate(g('Call Date')); const time = N.normalizeTime(g('Call Time'));
    const email = N.normalizeEmail(g('Customer Email'));
    const urls = N.parseRecordingUrls(g('Recording URL(s)')).urls;
    out.push({
      rowNumber: i + 1, fingerprint: N.fingerprint(date, time, email.valid ? email.value : ''), urlKey: N.urlSetKey(urls),
      processing: g('Processing Status'), validation: g('Validation Status'), reason: g('Reason Code'),
      notes: g('Error / Review Notes'), hasDraft: Boolean(g('Email Body')), transcriptHash: g('Transcript Hash'),
    });
  });
  return out;
}

const hasStoredDraft = (d) => d.hasDraft && (d.processing === 'DRAFT_READY' || (d.processing === 'REVIEW_REQUIRED' && d.reason !== COLLISION));
const RETRYABLE = ['DEFERRED', 'FAILED'];
// Rows stored under the retired quality-based skip (D-044) carry no draft and may be superseded by a new draft.
const SUPERSEDED_REASONS = ['ANALYSIS_LOW_CONFIDENCE', 'TRANSCRIPT_TOO_SHORT'];

// sources: [{ key, fingerprint, urlKey }] (only records that could be fingerprinted); dests: parseDestination() output.
// Returns one action per source record. Actions:
//   PROCESS_NEW | PROCESS_UPDATE(rowNumber) | NOOP_ALREADY_PROCESSED | NOOP_TERMINAL | NOOP_REVIEW_PENDING | NOOP_COLLISION_ROW_EXISTS |
//   FLAG_COLLISION_APPEND | RESOLVED_DUPLICATE(rowNumber) | REPORT_ONLY(reason)
// It never overwrites a stored draft and never plans a second review row for an already flagged record.
function plan(sources, dests) {
  const actions = []; const act = (s, action, extra) => actions.push(Object.assign({ key: s.key, action }, extra || {}));
  const groups = new Map();
  sources.forEach((s) => { if (!groups.has(s.fingerprint)) groups.set(s.fingerprint, []); groups.get(s.fingerprint).push(s); });
  for (const [fp, srcs] of groups) {
    const ds = dests.filter((d) => d.fingerprint === fp);
    if (srcs.length === 1) {
      const s = srcs[0];
      if (!ds.length) { act(s, 'PROCESS_NEW'); continue; }
      const same = ds.filter((d) => d.urlKey === s.urlKey);
      if (same.length > 1) { act(s, 'REPORT_ONLY', { reason: 'MULTIPLE_ROWS_SAME_FINGERPRINT_AND_URLS' }); continue; }
      if (same.length === 1) {
        const d = same[0];
        if (d.reason === COLLISION) {
          if (/^RESOLVED:\s*SEPARATE/i.test(d.notes)) act(s, 'PROCESS_UPDATE', { rowNumber: d.rowNumber, history: history(d.processing, d.reason, d.notes) });
          else if (/^RESOLVED:\s*DUPLICATE/i.test(d.notes)) act(s, 'RESOLVED_DUPLICATE', { rowNumber: d.rowNumber });
          else act(s, 'NOOP_COLLISION_ROW_EXISTS', { rowNumber: d.rowNumber });
        } else if (hasStoredDraft(d)) act(s, 'NOOP_ALREADY_PROCESSED', { rowNumber: d.rowNumber, storedTranscriptHash: d.transcriptHash });
        else if (!d.hasDraft && SUPERSEDED_REASONS.includes(d.reason) && ['SKIPPED', 'REVIEW_REQUIRED'].includes(d.processing)) act(s, 'PROCESS_UPDATE', { rowNumber: d.rowNumber, history: history(d.processing, d.reason, d.notes) });
        else if (d.processing === 'REVIEW_REQUIRED') act(s, 'NOOP_REVIEW_PENDING', { rowNumber: d.rowNumber });
        else if (RETRYABLE.includes(d.processing)) act(s, 'PROCESS_UPDATE', { rowNumber: d.rowNumber, history: history(d.processing, d.reason, d.notes) });
        else if (d.processing === 'SKIPPED') act(s, 'NOOP_TERMINAL', { rowNumber: d.rowNumber });
        else act(s, 'REPORT_ONLY', { reason: 'UNRECOGNISED_PROCESSING_STATUS', rowNumber: d.rowNumber });
        continue;
      }
      // same fingerprint, different recording URL set
      if (ds.some(hasStoredDraft)) { act(s, 'FLAG_COLLISION_APPEND', { reason: 'URL_SET_DIFFERS_FROM_STORED_DRAFT' }); continue; }
      if (ds.length === 1 && RETRYABLE.includes(ds[0].processing) && ds[0].reason !== COLLISION) {
        act(s, 'PROCESS_UPDATE', { rowNumber: ds[0].rowNumber, history: history(ds[0].processing, ds[0].reason, ds[0].notes) });
      } else act(s, 'REPORT_ONLY', { reason: 'CANNOT_ASSOCIATE_WITH_DESTINATION_ROW' });
      continue;
    }
    // exact collision inside the source snapshot (two or more records, identical fingerprint)
    const coll = ds.filter((d) => d.reason === COLLISION);
    const others = ds.filter((d) => d.reason !== COLLISION);
    if (others.length) { srcs.forEach((s) => act(s, 'REPORT_ONLY', { reason: 'COLLISION_WITH_EXISTING_NON_COLLISION_ROW' })); continue; }
    if (!coll.length) { srcs.forEach((s) => act(s, 'FLAG_COLLISION_APPEND', { reason: 'EXACT_FINGERPRINT_COLLISION' })); continue; }
    if (coll.length === srcs.length) { srcs.forEach((s) => act(s, 'NOOP_COLLISION_ROW_EXISTS')); continue; }
    const rep = srcs.filter((s) => s.urlKey && coll.some((d) => d.urlKey === s.urlKey));
    const unrep = srcs.filter((s) => !rep.includes(s));
    const distinct = unrep.filter((s) => s.urlKey && !srcs.some((o) => o !== s && o.urlKey === s.urlKey));
    rep.forEach((s) => act(s, 'NOOP_COLLISION_ROW_EXISTS'));
    if (distinct.length === 1 && unrep.length === 1) act(unrep[0], 'FLAG_COLLISION_APPEND', { reason: 'ONE_NEW_DISTINGUISHABLE_COLLISION_RECORD' });
    else unrep.forEach((s) => act(s, 'REPORT_ONLY', { reason: 'COLLISION_GROUP_CHANGED_OR_NOT_DISTINGUISHABLE' }));
  }
  return actions;
}

module.exports = { HEADERS, COL, TEXT_COLUMNS, VALIDATION, PROCESSING, COLLISION, checkHeaders, isEmptySheet, buildRow, parseDestination, plan, history };
