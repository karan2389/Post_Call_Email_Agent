'use strict';
// Phase 4 sending state machine, send identity, draft versioning and pre-send checks (D-049). Pure functions: no network, no files.
// The Gmail connector has no idempotency key and no custom headers, so duplicate prevention rests on (1) a durable record written
// BEFORE every send attempt, (2) a stable per-call send key, and (3) reconciliation against the Sent folder after any uncertainty.
// This is NOT exactly-once delivery: a crash between the connector's send and our record is covered by reconciliation, not prevented.

const N = require('./normalize');
const em = (x) => { const r = N.normalizeEmail(x == null ? '' : String(x)); return r.valid ? r.value : ''; };

const STATES = ['DRAFT_GENERATED', 'VALIDATION_FAILED', 'VALIDATED', 'STORED', 'READY_TO_SEND', 'SEND_IN_PROGRESS', 'SENT', 'SEND_FAILED',
  'SEND_OUTCOME_UNKNOWN', 'RECONCILIATION_REQUIRED', 'REVIEW_REQUIRED', 'SKIPPED'];

// from -> allowed next states. SENT and SKIPPED are terminal. READY_TO_SEND is reachable only from STORED (validated + stored) or by an
// explicit human resolution out of RECONCILIATION_REQUIRED / SEND_FAILED (retry-safe states).
const TRANSITIONS = {
  DRAFT_GENERATED: ['VALIDATED', 'VALIDATION_FAILED', 'REVIEW_REQUIRED', 'SKIPPED'],
  VALIDATION_FAILED: ['SKIPPED', 'REVIEW_REQUIRED'],
  VALIDATED: ['STORED', 'REVIEW_REQUIRED', 'SKIPPED'],
  STORED: ['READY_TO_SEND', 'REVIEW_REQUIRED', 'SKIPPED'],
  READY_TO_SEND: ['SEND_IN_PROGRESS', 'REVIEW_REQUIRED', 'SKIPPED'],
  SEND_IN_PROGRESS: ['SENT', 'SEND_FAILED', 'SEND_OUTCOME_UNKNOWN'],
  SEND_FAILED: ['READY_TO_SEND', 'REVIEW_REQUIRED', 'SKIPPED'],          // only a connector-reported failure (no message created) may retry
  SEND_OUTCOME_UNKNOWN: ['SENT', 'RECONCILIATION_REQUIRED'],              // never straight back to a send
  RECONCILIATION_REQUIRED: ['SENT', 'READY_TO_SEND', 'SKIPPED'],          // human resolution only (see resolveReconciliation)
  REVIEW_REQUIRED: ['STORED', 'READY_TO_SEND', 'SKIPPED'],                // human decision only
  SENT: [],
  SKIPPED: [],
};

function canTransition(from, to) { return !!TRANSITIONS[from] && TRANSITIONS[from].indexOf(to) >= 0; }

// Returns { ok, event } where event is the audit-log entry to append; never mutates. `actor`: 'agent' | 'human:<name>'.
function transition(record, to, meta) {
  const from = record && record.state; const m = meta || {};
  if (!canTransition(from, to)) return { ok: false, code: 'INVALID_TRANSITION', from, to };
  // READY_TO_SEND only from a validated, stored draft with a PASS verdict, or by human resolution
  if (to === 'READY_TO_SEND') {
    const human = typeof m.actor === 'string' && m.actor.indexOf('human:') === 0;
    if (from === 'STORED' && !(record.validation_status === 'PASSED' && record.stored === true)) return { ok: false, code: 'NOT_VALIDATED_AND_STORED', from, to };
    if (from !== 'STORED' && !(human && m.reason)) return { ok: false, code: 'HUMAN_REASON_REQUIRED', from, to };
  }
  if (from === 'RECONCILIATION_REQUIRED' && to === 'SENT' && !m.gmail_message_id) return { ok: false, code: 'MESSAGE_ID_REQUIRED', from, to };
  if (to === 'SENT' && !m.gmail_message_id) return { ok: false, code: 'MESSAGE_ID_REQUIRED', from, to };
  return { ok: true, event: { send_key: record.send_key, from, to, at: m.at || null, actor: m.actor || 'agent', reason: m.reason || null, gmail_message_id: m.gmail_message_id || null, draft_hash: record.draft_hash || null } };
}

// ---- identity and versions ----
// Stable per CALL (fingerprint D-036 + recording URL set), not per draft: a regenerated or edited draft keeps the same send key, so it
// cannot silently trigger a second email.
function sendKey(fingerprint, urlSetKey) {
  if (!fingerprint) return null;
  return 'send_' + N.sha256('send|' + fingerprint + '|' + (urlSetKey || '')).slice(0, 24);
}
// ---- explicit internal test mode (D-056): a stored draft may be sent to an APPROVED INTERNAL recipient instead of the customer. The text is marked
// as a test and the send gets its OWN key, so a test can never be mistaken for the real send of that call (which stays unsent).
const TEST_SUBJECT_PREFIX = 'INTERNAL TEST - ';
const TEST_BODY_BANNER = 'INTERNAL TEST: this is a test copy of a stored draft. It was NOT sent to the customer.';
function testSendKey(realKey, recipient) { return realKey ? 'test_' + N.sha256('test|' + realKey + '|' + em(recipient)).slice(0, 24) : null; }
function testEnvelope(rec, recipient) { return { to: em(recipient), subject: TEST_SUBJECT_PREFIX + rec.stored_subject, body: TEST_BODY_BANNER + '\n\n' + rec.stored_body }; }

// Version of the exact text that would be sent (recipient + subject + body, no normalisation of the text itself).
function draftHash(recipient, subject, body) { return N.sha256('draft|' + em(recipient) + '|' + subject + '|' + body).slice(0, 24); }

// ---- pre-send checks (all ten must pass; any failure = do not send) ----
// rec: { state, stored, stored_recipient, stored_subject, stored_body, validated_draft_hash, validation_status, sensitive_review_required,
//        source_email, send_key, sent_message_id, open_attempt, sent_draft_hash, auto_send_eligible }
// ctx: { delivery_mode, live_authorized, internal_recipients[] (test mode), pilot_limit, pilot_sent_today, resend_authorization? }
function preSendChecks(rec, ctx) {
  const fail = []; const r = rec || {}; const c = ctx || {};
  if (!r.stored || !r.stored_subject || !r.stored_body) fail.push('DRAFT_NOT_STORED_OR_EMPTY');
  if (r.validation_status !== 'PASSED') fail.push('VALIDATION_NOT_PASSED');
  const to = em(r.stored_recipient);
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) fail.push('RECIPIENT_INVALID');
  if (!to || to !== em(r.source_email)) fail.push('RECIPIENT_MISMATCH');
  if (r.auto_send_eligible !== true) fail.push('NOT_AUTO_SEND_ELIGIBLE');
  if (r.sensitive_review_required) fail.push('SENSITIVE_REVIEW_REQUIRED');
  if (r.sent_message_id || r.state === 'SENT') {
    const a = c.resend_authorization;
    const ok = a && a.reason && a.authorized_by && a.send_key === r.send_key && a.draft_hash === draftHash(r.stored_recipient, r.stored_subject, r.stored_body);
    fail.push(ok ? 'RESEND_AUTHORISED_EXPLICITLY' : 'ALREADY_SENT');   // the first code is informational: a resend is still never automatic
  }
  if (r.open_attempt || ['SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', 'RECONCILIATION_REQUIRED'].indexOf(r.state) >= 0) fail.push('UNRESOLVED_SEND_ATTEMPT');
  if (r.sent_draft_hash && r.sent_draft_hash !== draftHash(r.stored_recipient, r.stored_subject, r.stored_body)) fail.push('DRAFT_CHANGED_AFTER_SEND');
  if (r.validated_draft_hash !== draftHash(r.stored_recipient, r.stored_subject, r.stored_body)) fail.push('STORED_DRAFT_DIFFERS_FROM_VALIDATED');
  const mode = c.delivery_mode;
  if (mode === 'live') {
    if (c.live_authorized !== true) fail.push('LIVE_NOT_AUTHORIZED');
    if (Number.isFinite(c.pilot_limit) && (c.pilot_sent_today || 0) >= c.pilot_limit) fail.push('PILOT_LIMIT_REACHED');
  } else if (mode === 'test') {
    const list = (c.internal_recipients || []).map(em);
    const eff = c.test_recipient !== undefined ? em(c.test_recipient) : to;   // explicit override: the effective recipient must be an approved internal address
    if (!list.length || !eff || list.indexOf(eff) < 0) fail.push('TEST_RECIPIENT_NOT_APPROVED');   // test mode may only reach approved internal addresses
  } else fail.push('MODE_DOES_NOT_PERMIT_SEND');                                             // dry_run, shadow, anything else
  const blocking = fail.filter((x) => x !== 'RESEND_AUTHORISED_EXPLICITLY');
  return { ok: blocking.length === 0 && fail.indexOf('RESEND_AUTHORISED_EXPLICITLY') < 0, failed: fail };
}

// ---- reconciliation after SEND_OUTCOME_UNKNOWN ----
// sent: messages found in Sent for the recipient since the attempt started: [{id, subject, to, date, body_hash?}]. Never retries.
// Only a single, clearly matching message establishes SENT. Anything else stays with a human.
function reconcile(attempt, sent, opts) {
  const a = attempt || {}; const list = Array.isArray(sent) ? sent : [];
  const to = em(a.recipient);
  const t0 = Date.parse(a.started_at); const win = ((opts && opts.window_minutes) || 120) * 60000;
  const cand = list.filter((m) => m && m.id && em(m.to) === to && m.subject === a.subject && Date.parse(m.date) >= t0 - 60000 && Date.parse(m.date) <= t0 + win);
  if (cand.length === 1) {
    const m = cand[0];
    if (m.body_hash && m.body_hash !== a.body_hash) return { outcome: 'RECONCILIATION_REQUIRED', code: 'BODY_MISMATCH', gmail_message_id: m.id };
    if (!m.body_hash) return { outcome: 'RECONCILIATION_REQUIRED', code: 'BODY_NOT_VERIFIED', gmail_message_id: m.id };
    return { outcome: 'SENT', code: 'MATCHED_SENT_MESSAGE', gmail_message_id: m.id };
  }
  if (cand.length > 1) return { outcome: 'RECONCILIATION_REQUIRED', code: 'MULTIPLE_MATCHES', ids: cand.map((m) => m.id) };
  return { outcome: 'RECONCILIATION_REQUIRED', code: list.length ? 'NO_MATCH_OTHER_MAIL_PRESENT' : 'NO_EVIDENCE_FOUND' };   // absence of evidence is not proof of no send
}

// Human resolution of RECONCILIATION_REQUIRED. 'not_sent' needs a reason and the person's name, and returns the record to READY_TO_SEND.
function resolveReconciliation(record, decision) {
  const d = decision || {};
  if (!d.by || !d.reason) return { ok: false, code: 'HUMAN_REASON_REQUIRED' };
  if (d.verdict === 'sent') return transition(record, 'SENT', { actor: 'human:' + d.by, reason: d.reason, gmail_message_id: d.gmail_message_id, at: d.at });
  if (d.verdict === 'not_sent') return transition(record, 'READY_TO_SEND', { actor: 'human:' + d.by, reason: d.reason, at: d.at });
  if (d.verdict === 'skip') return transition(record, 'SKIPPED', { actor: 'human:' + d.by, reason: d.reason, at: d.at });
  return { ok: false, code: 'UNKNOWN_VERDICT' };
}

module.exports = { TEST_SUBJECT_PREFIX, TEST_BODY_BANNER, testSendKey, testEnvelope, STATES, TRANSITIONS, canTransition, transition, sendKey, draftHash, preSendChecks, reconcile, resolveReconciliation };
