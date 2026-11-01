'use strict';
// Reference sender for Phase 4 (D-054): the exact sequence a session follows to send ONE stored, validated draft, written as code so that
// every failure path can be tested against mocked Gmail and log dependencies. No network here: `deps` is injected.
//   deps.log:   { events() -> array of events so far, append(event) -> throws if the row could not be written }
//   deps.mail (alias deps.gmail): { name?, send(request, {sendKey}) -> {id, threadId?}, buildQuery?(attempt), search(query) -> [{id}], read(id) -> {id, subject, to, date, body} }
//   Any mail provider (Gmail connector, Brevo) implements this; `send` throws err.definite === true only for "no message was created".
//   deps.now(): ISO timestamp (Asia/Kolkata)
// Rules enforced: the durable SEND_IN_PROGRESS event is written BEFORE the Gmail call and a failed write means no send; only a failure the
// connector reports as "no message created" (err.definite === true) counts as SEND_FAILED; every other error, including a timeout, is an
// unknown outcome that is reconciled and never retried; the text sent is the stored text unchanged. Not exactly-once (see docs/phase4-idempotency.md).

const S = require('./sendstate');
const L = require('./sendlog');
const G = require('./gmail');
const U = require('./urlcheck');

const MAX_RETRIES = 2;

async function emit(deps, ctx, rec, from, to, extra) {
  const x = extra || {};
  const ev = { eventId: L.nextEventId(ctx.runId, deps.log.events()), at: deps.now(), runId: ctx.runId, sendKey: rec.send_key, draftHash: x.draftHash || rec.draft_hash,
    fingerprint: rec.fingerprint, destinationRow: rec.destination_row, email: rec.log_email || rec.stored_recipient || rec.recipient, subject: rec.log_subject || rec.stored_subject || rec.subject,
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
  const attempt = { recipient: rec.attempt_recipient || rec.stored_recipient, subject: rec.attempt_subject || rec.stored_subject, started_at: rec.started_at, body_hash: rec.attempt_body_hash || rec.body_hash,
    expected_from: ctx.sender_address || undefined };   // actual From must equal the approved sender whenever the context names it (D-066)
  const canonicalUrls = rec.canonical_urls || (ctx.sender_address ? U.extractUrls(rec.attempt_body_text || rec.stored_body) : undefined);   // delivered URLs are verified against the validated draft
  let found;
  try {
    const mail = deps.mail || deps.gmail;   // provider-neutral (D-060); Gmail is the only provider in the Gmail-only architecture (D-066)
    const threads = await mail.search(typeof mail.buildQuery === 'function' ? mail.buildQuery(attempt) : G.buildSearchQuery(attempt));
    const cands = [];
    for (const t of threads || []) { const m = await mail.read(t.id); cands.push(G.toCandidate(m, L.bodyHash, canonicalUrls)); }
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
  let sendKey = S.sendKey(draft.fingerprint, draft.url_set_key);
  if (!sendKey) return { outcome: 'BLOCKED', failed: ['NO_SOURCE_FINGERPRINT'] };
  const testing = ctx.delivery_mode === 'test' && ctx.test_recipient;   // explicit internal test: own send key, marked text, internal recipient
  if (testing) sendKey = S.testSendKey(sendKey, ctx.test_recipient);
  const dHash = S.draftHash(draft.stored_recipient, draft.stored_subject, draft.stored_body);
  const rec = Object.assign({}, draft, folded || {}, { send_key: sendKey, draft_hash: dHash, body_hash: L.bodyHash(testing ? S.testEnvelope(draft, ctx.test_recipient).body : (draft.stored_body || '')), state: (folded && folded.state) || 'STORED' });
  if (testing) { const e0 = S.testEnvelope(draft, ctx.test_recipient); rec.log_email = e0.to; rec.log_subject = e0.subject; }   // every log row of a test carries the internal address and marked subject
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
  const prov = deps.mail || deps.gmail;
  if (ctx.provider_policy === 'gmail_only' && !(prov && prov.name === 'gmail')) return { outcome: 'BLOCKED', failed: ['PROVIDER_NOT_ALLOWED:' + String((prov && prov.name) || 'unknown')], send_key: sendKey };   // Gmail only, no fallback (D-066)
  if (prov && typeof prov.readiness === 'function') { const bad = prov.readiness(); if (bad.length) return { outcome: 'BLOCKED', failed: bad.map((c) => 'PROVIDER_NOT_READY:' + c), send_key: sendKey }; }   // nothing logged, nothing sent

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
  const env = testing ? S.testEnvelope(rec, ctx.test_recipient) : null;
  rec.attempt_body_text = env ? env.body : rec.stored_body; if (ctx.sender_address) rec.canonical_urls = U.extractUrls(rec.attempt_body_text);
  rec.started_at = started; rec.attempt_body_hash = rec.body_hash; rec.attempt_subject = env ? env.subject : rec.stored_subject; rec.attempt_recipient = env ? env.to : rec.stored_recipient; rec.state = 'SEND_IN_PROGRESS';

  let res;
  const mail = deps.mail || deps.gmail;
  try { res = await mail.send(G.buildSendRequest(rec, ctx), { sendKey }); }   // sendKey lets a provider attach it as internal metadata (never in the email text)
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
  if (ctx.verify_after_send === true) {   // a message ID is not proof (D-066): read the sent message back and check recipient, From, subject, body and URLs
    let verdict;
    try {
      const m = await mail.read(res.id);
      verdict = S.reconcile({ recipient: rec.attempt_recipient, subject: rec.attempt_subject, started_at: started, body_hash: rec.attempt_body_hash, expected_from: ctx.sender_address },
        [G.toCandidate(Object.assign({}, m, { id: res.id }), L.bodyHash, rec.canonical_urls)]);
    } catch (e) { verdict = { outcome: 'RECONCILIATION_REQUIRED', code: 'POST_SEND_READ_FAILED' }; }
    if (verdict.outcome !== 'SENT') {
      try { await emit(deps, ctx, rec, 'SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', { reason: 'POST_SEND_VERIFICATION_FAILED:' + verdict.code, gmailMessageId: res.id }); rec.state = 'SEND_OUTCOME_UNKNOWN'; } catch (e) { /* same recovery */ }
      return reconcileAttempt(rec, ctx, deps);   // never a resend: search, verify, or hand to a human
    }
  }
  try { await emit(deps, ctx, rec, 'SEND_IN_PROGRESS', 'SENT', { gmailMessageId: res.id, gmailThreadId: res.threadId, reason: mail.name ? 'PROVIDER_CONFIRMED:' + mail.name : 'CONNECTOR_CONFIRMED' }); }
  catch (e) { return { outcome: 'SENT_TRACKING_FAILED', send_key: sendKey, gmail_message_id: res.id }; }   // the log still says SEND_IN_PROGRESS; recovery finds the message
  return { outcome: 'SENT', send_key: sendKey, gmail_message_id: res.id };
}

// Run every item; one record's failure never affects the others. Recovery of interrupted attempts runs first and never sends.
async function runBatch(items, foldedMap, ctx, deps) {
  const results = []; const sum = { examined: items.length, sent: 0, blocked: 0, failed: 0, reconciliation_required: 0, duplicates_prevented: 0, tracking_failures: 0, errors: 0 };
  for (const it of items) {
    let r;
    // the log is re-read before every item, so the same call appearing twice in one batch cannot be sent twice (D-066); a snapshot passed in is the fallback
    let k = S.sendKey(it.fingerprint, it.url_set_key); if (k && ctx.delivery_mode === 'test' && ctx.test_recipient) k = S.testSendKey(k, ctx.test_recipient);
    const fresh = L.fold(deps.log.events()); const folded = (k && fresh.get(k)) || foldedMap.get(k) || foldedMap.get(S.sendKey(it.fingerprint, it.url_set_key));
    try { r = await sendOne(it, folded, ctx, deps); } catch (e) { r = { outcome: 'ERROR', error: String(e && e.message ? e.message : e).slice(0, 120) }; }
    results.push(Object.assign({ fingerprint: it.fingerprint }, r));
    if (r.outcome === 'SENT') sum.sent += 1; else if (r.outcome === 'BLOCKED') { sum.blocked += 1; if (r.duplicate_prevented) sum.duplicates_prevented += 1; }
    else if (r.outcome === 'SEND_FAILED') sum.failed += 1; else if (r.outcome === 'RECONCILIATION_REQUIRED') sum.reconciliation_required += 1;
    else if (r.outcome === 'TRACKING_WRITE_FAILED' || r.outcome === 'SENT_TRACKING_FAILED') sum.tracking_failures += 1; else if (r.outcome === 'ERROR') sum.errors += 1;
  }
  return { summary: sum, results };
}

module.exports = { sendOne, reconcileAttempt, runBatch, MAX_RETRIES };
