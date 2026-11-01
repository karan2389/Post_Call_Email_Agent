'use strict';
// Phase 4 sender tests against MOCKED Gmail and a MOCKED send log (D-054). Synthetic data only (@example.com). No network, no Gmail,
// no spreadsheet. Run: node tests/unit/phase4-sender.test.js
const assert = require('assert');
const S = require('../../src/lib/sendstate');
const L = require('../../src/lib/sendlog');
const G = require('../../src/lib/gmail');
const X = require('../../src/lib/sender');

let n = 0; const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const SUBJ = 'Follow-up on your FlexiFunnels support call'; const BODY = 'Hi Test,\n\nThanks for your time today.\n\nWarm regards,\nSupport';

// ---- mocks ----
function mkEnv(o) {
  const opt = o || {}; let tick = 0; const base = Date.parse('2026-11-02T03:30:00Z');
  const env = { events: [], sent: [], sendCalls: 0, searchCalls: 0 };
  env.deps = {
    now: () => new Date(base + (tick++) * 1000).toISOString(),
    log: {
      events: () => env.events,
      append: async (e) => { if (opt.failAppendTo && opt.failAppendTo(e, env)) throw new Error('log write failed'); L.buildEventRow(e); env.events.push(e); },
    },
    gmail: {
      send: async (req) => {
        env.sendCalls += 1; env.lastRequest = req;
        const mode = typeof opt.sendMode === 'function' ? opt.sendMode(env.sendCalls, req) : (opt.sendMode || 'ok');
        const deliver = () => { const m = { id: 'gm' + (env.sent.length + 1), threadId: 'th' + (env.sent.length + 1), subject: req.subject, to: req.to[0], date: env.deps.now(), body: req.body }; env.sent.push(m); return m; };
        if (mode === 'ok') return deliver();
        if (mode === 'definite') { const e = new Error('invalid recipient'); e.definite = true; e.code = 'INVALID_RECIPIENT'; throw e; }
        if (mode === 'timeout_delivered') { deliver(); throw new Error('timeout'); }
        if (mode === 'timeout_not_delivered') throw new Error('timeout');
        if (mode === 'no_id') { deliver(); return {}; }
        throw new Error('unknown mode');
      },
      search: async () => { env.searchCalls += 1; if (opt.searchFails) throw new Error('search down'); return env.sent.map((m) => ({ id: m.id })); },
      read: async (id) => env.sent.find((m) => m.id === id),
    },
  };
  return env;
}
const draft = (i, o) => Object.assign({
  stored: true, stored_recipient: `customer${i}@example.com`, stored_subject: SUBJ, stored_body: BODY, validation_status: 'PASSED', source_email: `customer${i}@example.com`,
  auto_send_eligible: true, sensitive_review_required: false, fingerprint: `2026-10-30|1${i}:00|customer${i}@example.com`, url_set_key: 'u' + i, destination_row: i + 1,
  validated_draft_hash: S.draftHash(`customer${i}@example.com`, SUBJ, BODY),
}, o || {});
const ctxTest = (extra) => Object.assign({ runId: 'run-1', delivery_mode: 'test', internal_recipients: ['customer1@example.com', 'customer2@example.com', 'customer3@example.com'] }, extra || {});
const states = (env) => env.events.map((e) => e.to);
const folded = (env) => L.fold(env.events);
const key = (i) => S.sendKey(draft(i).fingerprint, draft(i).url_set_key);

t('happy path: stored draft is sent once, unchanged, with the log written before the send', async () => {
  const env = mkEnv(); const d = draft(1);
  const r = await X.sendOne(d, undefined, ctxTest(), env.deps);
  assert.strictEqual(r.outcome, 'SENT'); assert.strictEqual(env.sendCalls, 1);
  assert.deepStrictEqual(states(env), ['READY_TO_SEND', 'SEND_IN_PROGRESS', 'SENT']);
  assert.deepStrictEqual(env.lastRequest, { to: ['customer1@example.com'], subject: SUBJ, body: BODY, includeSignature: false });   // text unchanged, plain text, single recipient
  assert.strictEqual(env.events[2].gmailMessageId, 'gm1'); assert.strictEqual(folded(env).get(key(1)).state, 'SENT');
});
t('blocked before any log or send: failed validation, sensitive review, dry_run, live without authorisation, unapproved test recipient, recipient mismatch', async () => {
  const env = mkEnv();
  const cases = [[draft(1, { validation_status: 'FAILED' }), ctxTest()], [draft(1, { sensitive_review_required: true }), ctxTest()], [draft(1), { runId: 'r', delivery_mode: 'dry_run' }],
    [draft(1), { runId: 'r', delivery_mode: 'live' }], [draft(9), ctxTest()], [draft(1, { source_email: 'other@example.com' }), ctxTest()], [draft(1, { stored_body: BODY + ' edited' }), ctxTest()]];
  for (const [d, c] of cases) { const r = await X.sendOne(d, undefined, c, env.deps); assert.strictEqual(r.outcome, 'BLOCKED'); }
  assert.strictEqual(env.sendCalls, 0); assert.strictEqual(env.events.length, 0);   // nothing was sent and nothing logged
});
t('invalid recipient address never reaches Gmail', async () => {
  const env = mkEnv(); const r = await X.sendOne(draft(1, { stored_recipient: 'not-an-email', source_email: 'not-an-email' }), undefined, ctxTest({ internal_recipients: ['not-an-email'] }), env.deps);
  assert.strictEqual(r.outcome, 'BLOCKED'); assert.ok(r.failed.includes('RECIPIENT_INVALID')); assert.strictEqual(env.sendCalls, 0);
});
t('log write failure BEFORE the send means no send', async () => {
  const env = mkEnv({ failAppendTo: (e) => e.to === 'SEND_IN_PROGRESS' }); const r = await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  assert.strictEqual(r.outcome, 'TRACKING_WRITE_FAILED'); assert.strictEqual(env.sendCalls, 0); assert.strictEqual(env.sent.length, 0);
});
t('duplicate execution: a second run never resends a SENT record and counts the duplicate prevented', async () => {
  const env = mkEnv(); await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  const again = await X.runBatch([draft(1)], folded(env), ctxTest({ runId: 'run-2' }), env.deps);
  assert.strictEqual(env.sendCalls, 1); assert.strictEqual(again.summary.duplicates_prevented, 1); assert.strictEqual(again.summary.sent, 0);
});
t('a changed draft never triggers a second email (same send key, different text)', async () => {
  const env = mkEnv(); await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  const edited = draft(1, { stored_body: BODY + ' (edited)', validated_draft_hash: S.draftHash('customer1@example.com', SUBJ, BODY + ' (edited)') });
  const r = await X.sendOne(edited, folded(env).get(key(1)), ctxTest({ runId: 'run-2' }), env.deps);
  assert.strictEqual(r.outcome, 'BLOCKED'); assert.ok(r.failed.includes('ALREADY_SENT')); assert.ok(r.failed.includes('DRAFT_CHANGED_AFTER_SEND')); assert.strictEqual(env.sendCalls, 1);
});
t('timeout after a delivered send: outcome unknown, reconciled to SENT with the message id, no retry', async () => {
  const env = mkEnv({ sendMode: 'timeout_delivered' }); const r = await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  assert.deepStrictEqual([r.outcome, r.via], ['SENT', 'RECONCILIATION']); assert.strictEqual(env.sendCalls, 1);
  assert.deepStrictEqual(states(env), ['READY_TO_SEND', 'SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', 'SENT']); assert.strictEqual(folded(env).get(key(1)).sent_message_id, 'gm1');
});
t('timeout with no evidence: RECONCILIATION_REQUIRED, never retried, and later runs stay blocked', async () => {
  const env = mkEnv({ sendMode: 'timeout_not_delivered' }); const r = await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  assert.deepStrictEqual([r.outcome, r.code], ['RECONCILIATION_REQUIRED', 'NO_EVIDENCE_FOUND']); assert.strictEqual(env.sendCalls, 1);
  const later = await X.sendOne(draft(1), folded(env).get(key(1)), ctxTest({ runId: 'run-2' }), env.deps);
  assert.strictEqual(later.outcome, 'BLOCKED'); assert.ok(later.failed.includes('UNRESOLVED_SEND_ATTEMPT')); assert.strictEqual(env.sendCalls, 1);
});
t('search failure during reconciliation also ends in RECONCILIATION_REQUIRED (never a retry)', async () => {
  const env = mkEnv({ sendMode: 'timeout_delivered', searchFails: true }); const r = await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  assert.deepStrictEqual([r.outcome, r.code], ['RECONCILIATION_REQUIRED', 'SEARCH_FAILED']); assert.strictEqual(env.sendCalls, 1);
});
t('success without a message id is not confirmation: reconciled, and the delivered message is found', async () => {
  const env = mkEnv({ sendMode: 'no_id' }); const r = await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  assert.deepStrictEqual([r.outcome, r.via], ['SENT', 'RECONCILIATION']); assert.strictEqual(env.sendCalls, 1);
});
t('definite connector rejection: SEND_FAILED with a retry count; no automatic retry; a human re-open is bounded by the retry limit', async () => {
  const env = mkEnv({ sendMode: 'definite' }); const r = await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  assert.deepStrictEqual([r.outcome, r.retry_count], ['SEND_FAILED', 1]);
  const again = await X.sendOne(draft(1), folded(env).get(key(1)), ctxTest({ runId: 'run-2' }), env.deps);
  assert.strictEqual(again.outcome, 'BLOCKED'); assert.ok(again.failed.includes('RETRY_NEEDS_EXPLICIT_REASON')); assert.strictEqual(env.sendCalls, 1);
  const rec = folded(env).get(key(1)); rec.state = 'READY_TO_SEND'; rec.retry_count = X.MAX_RETRIES;
  assert.ok((await X.sendOne(draft(1), rec, ctxTest({ runId: 'run-3' }), env.deps)).failed.includes('RETRY_LIMIT_REACHED'));
});
t('interrupted run: the log ends at SEND_IN_PROGRESS; recovery finds the delivered message and marks SENT without resending', async () => {
  const env = mkEnv({ failAppendTo: (e) => e.to === 'SENT' }); const r = await X.sendOne(draft(1), undefined, ctxTest(), env.deps);
  assert.strictEqual(r.outcome, 'SENT_TRACKING_FAILED'); assert.strictEqual(r.gmail_message_id, 'gm1');
  assert.strictEqual(L.unresolved(folded(env)).length, 1);
  env.deps.log.append = async (e) => { env.events.push(e); };   // the log works again in the next run
  const rec = await X.runBatch([draft(1)], folded(env), ctxTest({ runId: 'run-2' }), env.deps);
  assert.strictEqual(env.sendCalls, 1); assert.strictEqual(rec.results[0].outcome, 'SENT'); assert.strictEqual(folded(env).get(key(1)).state, 'SENT');
});
t('interrupted run with no message in Sent: RECONCILIATION_REQUIRED for a human, never an automatic resend', async () => {
  const env = mkEnv({ sendMode: 'timeout_not_delivered' });
  env.deps.log.append = async (e) => { if (e.to === 'SEND_OUTCOME_UNKNOWN' || e.to === 'RECONCILIATION_REQUIRED') throw new Error('crash'); env.events.push(e); };   // died right after the attempt row
  await assert.rejects(X.sendOne(draft(1), undefined, ctxTest(), env.deps), /crash/);   // the process would have died here
  assert.strictEqual(folded(env).get(key(1)).state, 'SEND_IN_PROGRESS');
  env.deps.log.append = async (e) => { env.events.push(e); };
  const r = await X.sendOne(draft(1), folded(env).get(key(1)), ctxTest({ runId: 'run-2' }), env.deps);
  assert.strictEqual(r.outcome, 'RECONCILIATION_REQUIRED'); assert.strictEqual(env.sendCalls, 1);
});
t('partial batch failure: one record failing does not stop or alter the others', async () => {
  const env = mkEnv({ sendMode: (call) => (call === 2 ? 'timeout_not_delivered' : 'ok') });
  const out = await X.runBatch([draft(1), draft(2), draft(3), draft(9)], new Map(), ctxTest(), env.deps);
  assert.deepStrictEqual(out.results.map((r) => r.outcome), ['SENT', 'RECONCILIATION_REQUIRED', 'SENT', 'BLOCKED']);
  assert.deepStrictEqual([out.summary.sent, out.summary.reconciliation_required, out.summary.blocked, out.summary.examined], [2, 1, 1, 4]);
});
t('a throwing dependency is contained: the batch continues and reports an error for that record only', async () => {
  const env = mkEnv(); const bad = draft(1); Object.defineProperty(bad, 'stored_recipient', { get() { throw new Error('boom'); } });
  const out = await X.runBatch([bad, draft(2)], new Map(), ctxTest(), env.deps);
  assert.strictEqual(out.results[0].outcome, 'ERROR'); assert.strictEqual(out.results[1].outcome, 'SENT');
});
t('the log only records valid transitions', async () => {
  const env = mkEnv(); await assert.rejects(async () => { await X.sendOne(draft(1), { state: 'SENT', sent_message_id: 'x' }, ctxTest(), env.deps).then((r) => { if (r.outcome !== 'BLOCKED') throw new Error('x'); }); throw new Error('expected block'); }, /expected block/);
});
t('send log rows: 19 exact headers, formulas neutralised, state and message id round-trip through fold', async () => {
  assert.strictEqual(L.HEADERS.length, 19); assert.strictEqual(L.checkHeaders(L.HEADERS).ok, true); assert.strictEqual(L.checkHeaders(L.HEADERS.slice(0, 18)).ok, false);
  const row = L.buildEventRow({ eventId: 'r-0001', at: '2026-11-02T09:00:00+05:30', sendKey: 'k', to: 'SENT', gmailMessageId: 'gm1', subject: '=SUM(1)', email: 'a@example.com', draftHash: 'h' });
  assert.strictEqual(row[L.COL['Email Subject']], "'=SUM(1)");
  const ev = L.parseEvents([L.HEADERS, row]); assert.strictEqual(ev.length, 1); assert.strictEqual(L.fold(ev).get('k').sent_message_id, 'gm1');
  assert.throws(() => L.buildEventRow({ sendKey: 'k' }));
});
t('request and search builders: plain text, one recipient, no cc/bcc/html/signature; narrow Sent query', async () => {
  const req = G.buildSendRequest(draft(1)); assert.deepStrictEqual(Object.keys(req).sort(), ['body', 'includeSignature', 'subject', 'to']);
  assert.throws(() => G.buildSendRequest(draft(1, { stored_recipient: 'bad' }))); assert.throws(() => G.buildSendRequest(draft(1, { stored_body: '' })));
  const q = G.buildSearchQuery({ recipient: 'A@Example.com', subject: 'Hello "x"', started_at: '2026-11-02T03:30:00Z' });
  assert.ok(q.startsWith('in:sent to:a@example.com subject:"Hello  x"') && /after:2026\/11\/01 before:2026\/11\/04$/.test(q), q);
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n += 1; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e)); process.exitCode = 1; } }
  console.log(`phase4 sender (mocked Gmail): ${n}/${tests.length} test groups passed`);
})();
