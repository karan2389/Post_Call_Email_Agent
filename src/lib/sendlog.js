'use strict';
// Phase 4 send log (D-054): an append-only event log, one row per state transition, kept in its own worksheet of the destination
// spreadsheet ("Send Log") so the approved 21-column draft schema is not changed. The current state of a send is the fold of its
// events (last event per send key). Pure functions: this module never touches a spreadsheet; the session writes the rows through the
// connector and only after src/lib/guard.js authorises the write. The row is appended BEFORE any Gmail call (see sender.js).

const N = require('./normalize');

const HEADERS = [
  'Event ID', 'Event At', 'Run ID', 'Send Key', 'Draft Hash', 'Source Fingerprint', 'Destination Row (reference only)',
  'Customer Email', 'Email Subject', 'Body Hash', 'From State', 'To State', 'Actor', 'Reason / Code', 'Gmail Message ID',
  'Gmail Thread ID', 'Delivery Mode', 'Retry Count', 'Error Info',
];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
const cell = (v) => { const s = v == null ? '' : String(v); return /^[=+\-@]/.test(s) ? `'${s}` : s; };

// e: { eventId, at, runId, sendKey, draftHash, fingerprint, destinationRow, email, subject, bodyHash, from, to, actor, reason,
//      gmailMessageId, gmailThreadId, deliveryMode, retryCount, error }
function buildEventRow(e) {
  if (!e || !e.sendKey || !e.to || !e.at || !e.eventId) throw new Error('event needs eventId, at, sendKey and to');
  const r = new Array(HEADERS.length).fill('');
  r[COL['Event ID']] = e.eventId; r[COL['Event At']] = e.at; r[COL['Run ID']] = e.runId || ''; r[COL['Send Key']] = e.sendKey;
  r[COL['Draft Hash']] = e.draftHash || ''; r[COL['Source Fingerprint']] = e.fingerprint || '';
  r[COL['Destination Row (reference only)']] = e.destinationRow == null ? '' : String(e.destinationRow);
  r[COL['Customer Email']] = e.email || ''; r[COL['Email Subject']] = e.subject || ''; r[COL['Body Hash']] = e.bodyHash || '';
  r[COL['From State']] = e.from || ''; r[COL['To State']] = e.to; r[COL['Actor']] = e.actor || 'agent'; r[COL['Reason / Code']] = e.reason || '';
  r[COL['Gmail Message ID']] = e.gmailMessageId || ''; r[COL['Gmail Thread ID']] = e.gmailThreadId || '';
  r[COL['Delivery Mode']] = e.deliveryMode || ''; r[COL['Retry Count']] = String(e.retryCount == null ? 0 : e.retryCount);
  r[COL['Error Info']] = e.error || '';
  return r.map(cell);
}

function checkHeaders(row1) {
  const got = (row1 || []).map((c) => String(c == null ? '' : c));
  const diffs = []; HEADERS.forEach((h, i) => { if (got[i] !== h) diffs.push({ column: i + 1, expected: h, found: got[i] || '' }); });
  return { ok: diffs.length === 0 && got.slice(HEADERS.length).every((c) => c === ''), diffs };
}

// values: rows of the Send Log including the header row. Returns events in sheet order (sheet order is the event order).
function parseEvents(values) {
  const out = [];
  (values || []).forEach((row, i) => {
    if (i === 0 || !row || !row[COL['Send Key']]) return;
    const g = (h) => String(row[COL[h]] == null ? '' : row[COL[h]]);
    out.push({ eventId: g('Event ID'), at: g('Event At'), runId: g('Run ID'), sendKey: g('Send Key'), draftHash: g('Draft Hash'),
      fingerprint: g('Source Fingerprint'), email: g('Customer Email'), subject: g('Email Subject'), bodyHash: g('Body Hash'),
      from: g('From State'), to: g('To State'), actor: g('Actor'), reason: g('Reason / Code'), gmailMessageId: g('Gmail Message ID'),
      gmailThreadId: g('Gmail Thread ID'), deliveryMode: g('Delivery Mode'), retryCount: Number(g('Retry Count')) || 0, error: g('Error Info'), row: i + 1 });
  });
  return out;
}

// Current record per send key, derived only from the events. `sentDraftHash` is the draft hash of the SENT event (never changes later);
// `attempts` counts SEND_IN_PROGRESS events; `open_attempt` is true while the last attempt has no SENT or SEND_FAILED outcome.
function fold(events) {
  const recs = new Map();
  for (const e of events) {
    const r = recs.get(e.sendKey) || { send_key: e.sendKey, state: null, attempts: 0, retry_count: 0, history: 0, sent_message_id: '', sent_draft_hash: '', open_attempt: false };
    r.state = e.to; r.history += 1; r.draft_hash = e.draftHash || r.draft_hash; r.recipient = e.email || r.recipient;
    r.subject = e.subject || r.subject; r.body_hash = e.bodyHash || r.body_hash; r.fingerprint = e.fingerprint || r.fingerprint;
    if (e.to === 'SEND_IN_PROGRESS') { r.attempts += 1; r.open_attempt = true; r.started_at = e.at; r.attempt_body_hash = e.bodyHash; r.attempt_subject = e.subject; r.attempt_recipient = e.email; }
    if (e.to === 'SENT') { r.sent_message_id = e.gmailMessageId; r.sent_draft_hash = e.draftHash; r.open_attempt = false; r.gmail_thread_id = e.gmailThreadId; }
    if (e.to === 'SEND_FAILED') { r.open_attempt = false; r.retry_count = Math.max(r.retry_count, e.retryCount); }
    recs.set(e.sendKey, r);
  }
  return recs;
}

// Records that were interrupted mid-send: the last event is SEND_IN_PROGRESS or SEND_OUTCOME_UNKNOWN (never retried; reconciled first).
const unresolved = (recs) => [...recs.values()].filter((r) => r.state === 'SEND_IN_PROGRESS' || r.state === 'SEND_OUTCOME_UNKNOWN');

// Deterministic, monotonic event id within a run: run id + zero-padded sequence (the sequence resumes from the existing log).
const nextEventId = (runId, events) => runId + '-' + String((events || []).filter((e) => e.runId === runId).length + 1).padStart(4, '0');
const bodyHash = (body) => N.sha256('body|' + body).slice(0, 24);

module.exports = { HEADERS, COL, buildEventRow, checkHeaders, parseEvents, fold, unresolved, nextEventId, bodyHash };
