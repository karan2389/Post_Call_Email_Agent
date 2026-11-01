'use strict';
// Reference sender for Phase 4 (D-054): the exact sequence a session follows to send ONE stored, validated draft, written as code so that
// every failure path can be tested against mocked Gmail and log dependencies. No network here: `deps` is injected.
//   deps.log:   { events() -> array of events so far, append(event) -> throws if the row could not be written }
//   deps.gmail: { send(request) -> {id, threadId}, search(query) -> [{id}], read(id) -> {id, subject, to, date, body} }
//   deps.now(): ISO timestamp (Asia/Kolkata)
// Rules enforced: the durable SEND_IN_PROGRESS event is written BEFORE the Gmail call and a failed write means no send; only a failure the
// connector reports as "no message created" (err.definite === true) counts as SEND_FAILED; every other error, including a timeout, is an
// unknown outcome that is reconciled and never retried; the text sent is the stored text unchanged. Not exactly-once (see docs/phase4-idempotency.md).

const S = require('./sendstate');
const L = require('./sendlog');
const G = require('./gmail');

const MAX_RETRIES = 2;

async function emit(deps, ctx, rec, from, to, extra) {
  const x = extra || {};
  const ev = { eventId: L.nextEventId(ctx.runId, deps.log.events()), at: deps.now(), runId: ctx.runId, sendKey: rec.send_key, draftHash: x.draftHash || rec.draft_hash,
    fingerprint: rec.fingerprint, destinationRow: rec.destination_row, email: rec.stored_recipient || rec.recipient, subject: rec.stored_subject || rec.subject,
    bodyHash: x.bodyHash || rec.body_hash, from, to, actor: x.actor || 'agent', reason: x.reason, gmailMessageId: x.gmailMessageId, gmailThreadId: x.gmailThreadId,
    deliveryMode: ctx.delivery_mode, retryCount: x.retryCount, error: x.error };
  if (from && !S.canTransition(from, to)) throw new Error('invalid transition ' + from + ' -> ' + to);   // the log can only record valid transitions
  await deps.log.append(ev);   // throws when the row cannot be written
  return ev;
}

// Reconciles an interrupted or uncertain attempt. Never sends. attempt fields come from the SEND_IN_PROGRESS event.
async function reconcileAttempt(rec, ctx, deps) {
  let state = rec.state;
  const note = async (to, extra) => { const ev = await emit(deps, ctx, rec, state, to, extra); state = to; return ev; };
  if (state === 'SEND_IN_PROGRESS') await note('SEND_OUTCOME_UNKNOWN', { reason: 'RECOVERY_AFTER_INTERRUPTION' });
  const attempt = { recipient: rec.attempt_recipient || rec.stored_recipient, subject: rec.attempt_subject || rec.stored_subject, started_at: rec.started_at, body_hash: rec.attempt_body_hash || rec.body_hash };
  let found;
  try {
    const threads = await deps.gmail.search(G.buildSearchQuery(attempt));
    const cands = [];
    for (const t of threads || []) { const m = await deps.gmail.read(t.id); cands.push(G.toCandidate(m, L.bodyHash)); }
    found = S.reconcile(attempt, cands);
  } catch (e) {
    found = { outcome: 'RECONCILIATION_REQUIRED', code: 'SEARCH_FAILED' };
  }
  if (found.outcome === 'SENT') { await note('SENT', { reason: found.code, gmailMessageId: found.gmail_message_id }); return { outcome: 'SENT', via: 'RECONCILIATION', gmail_message_id: found.gmail_message_id }; }
  await note('RECONCILIATION_REQUIRED', { reason: found.code, error: found.ids ? 'candidates: ' + found.ids.join(',') : undefined, gmailMessageId: found.gmail_message_id });
  return { outcome: 'RECONCILIATION_REQUIRED', code: found.code };
}

// draft: stored draft + source facts ({stored_recipient, stored_subject, stored_body, validation_status, validated_draft_hash, source_email, stored,
//        auto_send_eligible, sensitive_review_required, fingerprint, url_set_key, destination_row}); folded: record from sendlog.fold() or undefined.
async function sendOne(draft, folded, ctx, deps) {
  const sendKey = S.sendKey(draft.fingerprint, draft.url_set_key);
  if (!sendKey) return { outcome: 'BLOCKED', failed: ['NO_SOURCE_FINGERPRINT'] };
  const dHash = S.draftHash(draft.stored_recipient, draft.stored_subject, draft.stored_body);
  const rec = Object.assign({}, draft, folded || {}, { send_key: sendKey, draft_hash: dHash, body_hash: L.bodyHash(draft.stored_body || ''), state: (folded && folded.state) || 'STORED' });
  // an interrupted or uncertain earlier attempt is reconciled first, never re-sent
  if (rec.state === 'SEND_IN_PROGRESS' || rec.state === 'SEND_OUTCOME_UNKNOWN') return reconcileAttempt(rec, ctx, deps);
  if (rec.state === 'RECONCILIATION_REQUIRED') return { outcome: 'BLOCKED', failed: ['UNRESOLVED_SEND_ATTEMPT'], send_key: sendKey };
  if (rec.state === 'SENT') { const c = S.preSendChecks(rec, ctx); return { outcome: 'BLOCKED', failed: c.failed, send_key: sendKey, duplicate_prevented: true }; }
  if (rec.state === 'SEND_FAILED' && (rec.retry_count || 0) >= MAX_RETRIES) return { outcome: 'BLOCKED', failed: ['RETRY_LIMIT_REACHED'], send_key: sendKey };
  if (rec.state === 'SEND_FAILED') return { outcome: 'BLOCKED', failed: ['RETRY_NEEDS_EXPLICIT_REASON'], send_key: sendKey };   // a human re-opens it (transition rules)
  if (rec.state === 'READY_TO_SEND' && (rec.retry_count || 0) >= MAX_RETRIES) return { outcome: 'BLOCKED', failed: ['RETRY_LIMIT_REACHED'], send_key: sendKey };
  if (rec.state === 'READY_TO_SEND' || rec.state === 'STORED') { /* proceed */ } else return { outcome: 'BLOCKED', failed: ['STATE_NOT_SENDABLE:' + rec.state], send_key: sendKey };

  const pre = Object.assign({}, rec, { state: 'READY_TO_SEND', open_attempt: false });
  const checks = S.preSendChecks(pre, ctx);
  if (!checks.ok) return { outcome: 'BLOCKED', failed: checks.failed, send_key: sendKey };

  try {
    if (rec.state === 'STORED') {
      const t = S.transition(Object.assign({}, rec, { stored: true }), 'READY_TO_SEND', { actor: 'agent', at: deps.now() });
      if (!t.ok) return { outcome: 'BLOCKED', failed: [t.code], send_key: sendKey };
      await emit(deps, ctx, rec, 'STORED', 'READY_TO_SEND', { reason: 'PRE_SEND_CHECKS_PASSED' });
    }
    await emit(deps, ctx, rec, 'READY_TO_SEND', 'SEND_IN_PROGRESS', { reason: 'ATTEMPT_RECORDED_BEFORE_SEND' });
  } catch (e) {
    return { outcome: 'TRACKING_WRITE_FAILED', send_key: sendKey, sent: false };   // nothing was sent
  }
  const started = deps.now();
  rec.started_at = started; rec.attempt_body_hash = rec.body_hash; rec.attempt_subject = rec.stored_subject; rec.attempt_recipient = rec.stored_recipient; rec.state = 'SEND_IN_PROGRESS';

  let res;
  try { res = await deps.gmail.send(G.buildSendRequest(rec)); }
  catch (err) {
    if (err && err.definite === true) {
      const n = (rec.retry_count || 0) + 1;
      try { await emit(deps, ctx, rec, 'SEND_IN_PROGRESS', 'SEND_FAILED', { reason: err.code || 'CONNECTOR_REJECTED', error: String(err.message || err).slice(0, 200), retryCount: n }); } catch (e) { /* recovery reconciles an open attempt */ }
      return { outcome: 'SEND_FAILED', send_key: sendKey, retry_count: n };
    }
    // timeout or anything not known to be "no message created": outcome unknown, reconcile, never retry
    try { await emit(deps, ctx, rec, 'SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', { reason: 'CONNECTOR_ERROR_AFTER_SEND_CALL', error: String(err && err.message ? err.message : err).slice(0, 200) }); rec.state = 'SEND_OUTCOME_UNKNOWN'; } catch (e) { /* state stays SEND_IN_PROGRESS, same recovery */ }
    return reconcileAttempt(rec, ctx, deps);
  }
  if (!res || !res.id) {   // a success without a message id is not confirmation
    try { await emit(deps, ctx, rec, 'SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', { reason: 'NO_MESSAGE_ID_RETURNED' }); rec.state = 'SEND_OUTCOME_UNKNOWN'; } catch (e) { /* same */ }
    return reconcileAttempt(rec, ctx, deps);
  }
  try { await emit(deps, ctx, rec, 'SEND_IN_PROGRESS', 'SENT', { gmailMessageId: res.id, gmailThreadId: res.threadId, reason: 'CONNECTOR_CONFIRMED' }); }
  catch (e) { return { outcome: 'SENT_TRACKING_FAILED', send_key: sendKey, gmail_message_id: res.id }; }   // the log still says SEND_IN_PROGRESS; recovery finds the message
  return { outcome: 'SENT', send_key: sendKey, gmail_message_id: res.id };
}

// Run every item; one record's failure never affects the others. Recovery of interrupted attempts runs first and never sends.
async function runBatch(items, foldedMap, ctx, deps) {
  const results = []; const sum = { examined: items.length, sent: 0, blocked: 0, failed: 0, reconciliation_required: 0, duplicates_prevented: 0, tracking_failures: 0, errors: 0 };
  for (const it of items) {
    let r;
    try { r = await sendOne(it, foldedMap.get(S.sendKey(it.fingerprint, it.url_set_key)), ctx, deps); } catch (e) { r = { outcome: 'ERROR', error: String(e && e.message ? e.message : e).slice(0, 120) }; }
    results.push(Object.assign({ fingerprint: it.fingerprint }, r));
    if (r.outcome === 'SENT') sum.sent += 1; else if (r.outcome === 'BLOCKED') { sum.blocked += 1; if (r.duplicate_prevented) sum.duplicates_prevented += 1; }
    else if (r.outcome === 'SEND_FAILED') sum.failed += 1; else if (r.outcome === 'RECONCILIATION_REQUIRED') sum.reconciliation_required += 1;
    else if (r.outcome === 'TRACKING_WRITE_FAILED' || r.outcome === 'SENT_TRACKING_FAILED') sum.tracking_failures += 1; else if (r.outcome === 'ERROR') sum.errors += 1;
  }
  return { summary: sum, results };
}

module.exports = { sendOne, reconcileAttempt, runBatch, MAX_RETRIES };
