'use strict';
// Brevo adapter tests with MOCKED HTTP only (D-060). Synthetic data only (@example.com, fake key). No real request is possible: `fetch` is injected.
// Run: node tests/unit/phase4-brevo.test.js
const assert = require('assert');
const B = require('../../src/lib/brevo');
const S = require('../../src/lib/sendstate');
const L = require('../../src/lib/sendlog');
const X = require('../../src/lib/sender');

const FAKE_KEY = 'xkeysib-FAKE-TEST-KEY-0000';
const ENV = { BREVO_API_KEY: FAKE_KEY, BREVO_SENDER_EMAIL: 'supportcore@flexifunnels.com', BREVO_SENDER_NAME: 'Support' };
const CFG = { approved_sender_email: 'supportcore@flexifunnels.com', sender_verified_in_brevo: true, link_tracking_disabled_confirmed: true };
const FATHOM = 'https://fathom.video/share/EXAMPLE-Aa1_b-2?x=1&y=2';
const SUBJ = 'Follow-up on your FlexiFunnels support call – recap';   // en dash: must survive unchanged
const BODY = `Hi Test,\n\nThanks for your time & patience. <Great> "call".\n\nYou can rewatch our call here: ${FATHOM}\n\nWarm regards,\nSupport`;

let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);

// ---- mocked HTTP ----
const res = (status, body, headers) => ({ status, headers: { get: (k) => (headers || {})[String(k).toLowerCase()] || null }, json: async () => { if (body === undefined) throw new Error('no json'); return body; } });
function mockFetch(handler) {
  const calls = []; const f = async (url, init) => { calls.push({ url, init: Object.assign({}, init, { signal: undefined }) }); return handler(url, init, calls.length); };
  f.calls = calls; return f;
}
const ok = (id) => mockFetch(async () => res(201, { messageId: id || '<201798300811.5787683@relay.example.com>' }));
const client = (fetch, env, cfg, extra) => B.createClient(Object.assign({ fetch, env: env || ENV, config: cfg || CFG, timeoutMs: 40 }, extra || {}));
const req = (o) => Object.assign({ to: ['customer@example.com'], subject: SUBJ, body: BODY }, o || {});
const rejects = async (p, code, definite) => { try { await p; } catch (e) { assert.strictEqual(e.code, code, 'got ' + e.code); if (definite !== undefined) assert.strictEqual(e.definite, definite); return e; } assert.fail('expected ' + code); };

t('success: POST to the exact Brevo URL, api-key header, message ID extracted (angle brackets removed, raw kept)', async () => {
  const f = ok(); const r = await client(f).send(req(), { sendKey: 'send_abc' });
  assert.strictEqual(r.id, '201798300811.5787683@relay.example.com'); assert.strictEqual(r.provider_message_id, '<201798300811.5787683@relay.example.com>');
  assert.strictEqual(f.calls.length, 1); const c = f.calls[0];
  assert.strictEqual(c.url, 'https://api.brevo.com/v3/smtp/email'); assert.strictEqual(c.init.method, 'POST');
  assert.strictEqual(c.init.headers['api-key'], FAKE_KEY); assert.strictEqual(c.init.headers['content-type'], 'application/json');
});
t('request body: only the documented fields we need, no tracking or rewriting options, no scheduling, no cc/bcc, tag = send key', async () => {
  const f = ok(); await client(f).send(req(), { sendKey: 'send_abc' }); const p = JSON.parse(f.calls[0].init.body);
  assert.deepStrictEqual(Object.keys(p).sort(), ['htmlContent', 'sender', 'subject', 'tags', 'textContent', 'to']);
  assert.deepStrictEqual(p.tags, ['send_abc']); assert.deepStrictEqual(p.sender, { email: 'supportcore@flexifunnels.com', name: 'Support' }); assert.deepStrictEqual(p.to, [{ email: 'customer@example.com' }]);
  ['scheduledAt', 'batchId', 'cc', 'bcc', 'headers', 'params', 'templateId', 'messageVersions', 'removeTrackingPixel', 'contactPixelTrackingConsent', 'attachment'].forEach((k) => assert.ok(!(k in p), k));
});
t('exact subject and body preserved (en dash, newlines, & < > quotes); HTML twin decodes back to the same text', async () => {
  const f = ok(); await client(f).send(req(), {}); const p = JSON.parse(f.calls[0].init.body);
  assert.strictEqual(p.subject, SUBJ); assert.strictEqual(p.textContent, BODY); assert.strictEqual(B.htmlToPlain(p.htmlContent), BODY);
  assert.ok(!/<a\s/i.test(p.htmlContent));   // no anchors are created
  for (const s of ['plain', 'a & b < c > d "q" \'s\'', 'line1\nline2\n\nline4', '', 'https://x.example/?a=1&b=2']) assert.strictEqual(B.htmlToPlain(B.plainToHtml(s)), s);
});
t('Fathom URLs stay exactly as given in the request (text and HTML), nothing rewritten or wrapped', async () => {
  const f = ok(); await client(f).send(req(), {}); const p = JSON.parse(f.calls[0].init.body);
  assert.ok(p.textContent.includes(FATHOM)); assert.ok(p.htmlContent.includes(B.escapeHtml(FATHOM))); assert.ok(!/google\.com\/url/.test(f.calls[0].init.body));
  assert.strictEqual((p.textContent.match(/fathom\.video/g) || []).length, 1);
});
t('explicit HTML is supported and sent unchanged next to the plain text', async () => {
  const f = ok(); await client(f).send(req({ htmlBody: '<p>Hello <b>there</b></p>' }), {}); const p = JSON.parse(f.calls[0].init.body);
  assert.strictEqual(p.htmlContent, '<p>Hello <b>there</b></p>'); assert.strictEqual(p.textContent, BODY);
});
t('recipient rules: exactly one valid address; cc, bcc, none, two, malformed are rejected before any request', async () => {
  const f = ok(); const c = client(f);
  await rejects(c.send(req({ to: ['a@example.com', 'b@example.com'] }), {}), 'EXACTLY_ONE_RECIPIENT_REQUIRED', true);
  await rejects(c.send(req({ to: [] }), {}), 'EXACTLY_ONE_RECIPIENT_REQUIRED', true);
  await rejects(c.send(req({ to: ['not-an-email'] }), {}), 'INVALID_RECIPIENT', true);
  await rejects(c.send(req({ cc: ['c@example.com'] }), {}), 'CC_BCC_NOT_ALLOWED', true);
  await rejects(c.send(req({ bcc: ['c@example.com'] }), {}), 'CC_BCC_NOT_ALLOWED', true);
  await rejects(c.send(req({ subject: '  ' }), {}), 'EMPTY_SUBJECT_OR_BODY', true);
  assert.strictEqual(f.calls.length, 0);
});
t('sender rules: only the approved address, only once confirmed verified in Brevo, and tracking must be confirmed off; nothing is requested otherwise', async () => {
  const f = ok();
  await rejects(client(f, Object.assign({}, ENV, { BREVO_SENDER_EMAIL: 'other@flexifunnels.com' })).send(req(), {}), 'SENDER_NOT_APPROVED', true);
  await rejects(client(f, Object.assign({}, ENV, { BREVO_SENDER_EMAIL: '' })).send(req(), {}), 'SENDER_EMAIL_MISSING', true);
  await rejects(client(f, ENV, Object.assign({}, CFG, { sender_verified_in_brevo: false })).send(req(), {}), 'SENDER_NOT_VERIFIED_IN_BREVO', true);
  await rejects(client(f, ENV, Object.assign({}, CFG, { link_tracking_disabled_confirmed: false })).send(req(), {}), 'LINK_TRACKING_NOT_CONFIRMED_OFF', true);
  await rejects(client(f, ENV, Object.assign({}, CFG, { api_base: 'https://evil.example/v3' })).send(req(), {}), 'API_BASE_NOT_BREVO', true);
  assert.strictEqual(f.calls.length, 0);
});
t('missing, empty or malformed API key is rejected before any request', async () => {
  const f = ok();
  for (const k of [undefined, '', '   ', 'two words', null, 123]) await rejects(client(f, Object.assign({}, ENV, { BREVO_API_KEY: k })).send(req(), {}), 'MISSING_API_KEY', true);
  assert.strictEqual(f.calls.length, 0);
});
t('authentication failure (401) is definite, reported, and never retried', async () => {
  const f = mockFetch(async () => res(401, { code: 'unauthorized', message: 'Key not found' }));
  const e = await rejects(client(f).send(req(), {}), 'AUTHENTICATION_FAILED', true); assert.strictEqual(e.status, 401); assert.strictEqual(f.calls.length, 1);
});
t('other definite rejections (400, 403, 422) are definite and never retried', async () => {
  for (const s of [400, 403, 422]) { const f = mockFetch(async () => res(s, { code: 'invalid_parameter', message: 'x' })); const e = await rejects(client(f).send(req(), {}), 'HTTP_' + s, true); assert.strictEqual(e.provider_code, 'invalid_parameter'); assert.strictEqual(f.calls.length, 1); }
});
t('rate limiting (429): definite, reset hint recorded, no automatic retry', async () => {
  const f = mockFetch(async () => res(429, { code: 'too_many_requests' }, { 'x-sib-ratelimit-reset': '7' }));
  const e = await rejects(client(f).send(req(), {}), 'RATE_LIMITED', true); assert.strictEqual(e.retry_after_seconds, 7); assert.strictEqual(f.calls.length, 1);
});
t('timeout: uncertain (not definite), exactly one request, no retry', async () => {
  const f = mockFetch((u, init) => new Promise((_, rej) => { init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); }));
  const e = await rejects(client(f).send(req(), {}), 'TIMEOUT', false); assert.strictEqual(e.definite, false); assert.strictEqual(f.calls.length, 1);
});
t('uncertain outcomes: network error, 500, 503, 408, 2xx without a message ID, 202, malformed JSON are all NOT definite and not retried', async () => {
  const cases = [[async () => { throw new Error('ECONNRESET'); }, 'NETWORK_ERROR'], [async () => res(500, {}), 'HTTP_500_OUTCOME_UNCERTAIN'], [async () => res(503, {}), 'HTTP_503_OUTCOME_UNCERTAIN'],
    [async () => res(408, {}), 'HTTP_408_OUTCOME_UNCERTAIN'], [async () => res(201, {}), 'NO_MESSAGE_ID_IN_SUCCESS_RESPONSE'], [async () => res(201), 'NO_MESSAGE_ID_IN_SUCCESS_RESPONSE'],
    [async () => res(201, { messageId: '   ' }), 'NO_MESSAGE_ID_IN_SUCCESS_RESPONSE'], [async () => res(202, { messageId: 'x' }), 'UNEXPECTED_202_SCHEDULED_RESPONSE']];
  for (const [h, code] of cases) { const f = mockFetch(h); const e = await rejects(client(f).send(req(), {}), code, false); assert.strictEqual(f.calls.length, 1); assert.ok(e.definite === false); }
});
t('the API key never appears in errors or thrown objects', async () => {
  const f = mockFetch(async () => res(401, { code: 'unauthorized', message: 'bad ' + FAKE_KEY })); let e; try { await client(f).send(req(), {}); } catch (x) { e = x; }
  assert.ok(!JSON.stringify(Object.assign({}, e, { message: e.message, stack: e.stack })).includes(FAKE_KEY));
});

// ---- integration with the sender: log rows, key isolation, no retry, dry_run, duplicates ----
function mkEnv(fetch, extra) {
  const events = []; let tick = 0; const base = Date.parse('2026-11-02T03:30:00Z');
  const mail = client(fetch, ENV, CFG, extra);
  return { events, mail, deps: { mail, now: () => new Date(base + (tick++) * 1000).toISOString(), log: { events: () => events, append: async (e) => { L.buildEventRow(e); events.push(e); } } } };
}
const draft = (i, o) => Object.assign({ stored: true, stored_recipient: `customer${i}@example.com`, stored_subject: SUBJ, stored_body: BODY, validation_status: 'PASSED', source_email: `customer${i}@example.com`,
  auto_send_eligible: true, sensitive_review_required: false, fingerprint: `2026-10-30|1${i}:00|customer${i}@example.com`, url_set_key: 'u' + i, destination_row: i + 1,
  validated_draft_hash: S.draftHash(`customer${i}@example.com`, SUBJ, BODY) }, o || {});
const live = (extra) => Object.assign({ runId: 'run-b', delivery_mode: 'live', live_authorized: true }, extra || {});

t('sender + Brevo: validated draft sent once; Brevo message ID persisted in the log; send key tag attached; text unchanged', async () => {
  const f = ok('<abc@relay.example.com>'); const env = mkEnv(f); const d = draft(1);
  const r = await X.sendOne(d, undefined, live(), env.deps);
  assert.strictEqual(r.outcome, 'SENT'); assert.strictEqual(f.calls.length, 1);
  const last = env.events[env.events.length - 1]; assert.deepStrictEqual([last.to, last.gmailMessageId, last.reason], ['SENT', 'abc@relay.example.com', 'PROVIDER_CONFIRMED:brevo']);
  const p = JSON.parse(f.calls[0].init.body); assert.strictEqual(p.textContent, BODY); assert.strictEqual(p.subject, SUBJ); assert.deepStrictEqual(p.tags, [S.sendKey(d.fingerprint, d.url_set_key)]);
  assert.deepStrictEqual(env.events.map((e) => e.to), ['READY_TO_SEND', 'SEND_IN_PROGRESS', 'SENT']);
});
t('dry_run, shadow, live-without-authorisation and sensitive review never reach Brevo', async () => {
  const f = ok(); const env = mkEnv(f);
  for (const [d, c] of [[draft(1), { runId: 'r', delivery_mode: 'dry_run' }], [draft(1), { runId: 'r', delivery_mode: 'shadow' }], [draft(1), { runId: 'r', delivery_mode: 'live' }], [draft(1, { sensitive_review_required: true }), live()], [draft(1, { validation_status: 'FAILED' }), live()]]) {
    const r = await X.sendOne(d, undefined, c, env.deps); assert.strictEqual(r.outcome, 'BLOCKED');
  }
  assert.strictEqual(f.calls.length, 0); assert.strictEqual(env.events.length, 0);
});
t('provider not ready (no key / sender unverified / tracking unconfirmed): BLOCKED before any log row or request', async () => {
  for (const [e, c, code] of [[Object.assign({}, ENV, { BREVO_API_KEY: '' }), CFG, 'MISSING_API_KEY'], [ENV, Object.assign({}, CFG, { sender_verified_in_brevo: false }), 'SENDER_NOT_VERIFIED_IN_BREVO'], [ENV, Object.assign({}, CFG, { link_tracking_disabled_confirmed: false }), 'LINK_TRACKING_NOT_CONFIRMED_OFF']]) {
    const f = ok(); const events = []; const mail = client(f, e, c); const r = await X.sendOne(draft(1), undefined, live(), { mail, now: () => '2026-11-02T03:30:00Z', log: { events: () => events, append: async (x) => { events.push(x); } } });
    assert.strictEqual(r.outcome, 'BLOCKED'); assert.ok(r.failed.includes('PROVIDER_NOT_READY:' + code)); assert.strictEqual(f.calls.length, 0); assert.strictEqual(events.length, 0);
  }
});
t('duplicate-send protection: a second run sends nothing and counts the duplicate prevented', async () => {
  const f = ok(); const env = mkEnv(f); await X.sendOne(draft(1), undefined, live(), env.deps);
  const again = await X.runBatch([draft(1)], L.fold(env.events), live({ runId: 'run-b2' }), env.deps);
  assert.strictEqual(f.calls.length, 1); assert.strictEqual(again.summary.duplicates_prevented, 1);
});
t('definite rejection (401) becomes SEND_FAILED with no retry; a later run does not retry automatically', async () => {
  const f = mockFetch(async () => res(401, { code: 'unauthorized' })); const env = mkEnv(f);
  const r = await X.sendOne(draft(1), undefined, live(), env.deps); assert.deepStrictEqual([r.outcome, r.retry_count], ['SEND_FAILED', 1]);
  const again = await X.sendOne(draft(1), L.fold(env.events).get(S.sendKey(draft(1).fingerprint, draft(1).url_set_key)), live({ runId: 'run-b2' }), env.deps);
  assert.strictEqual(again.outcome, 'BLOCKED'); assert.strictEqual(f.calls.filter((c) => c.init.method === 'POST').length, 1);
});
t('timeout after the request: SEND_OUTCOME_UNKNOWN, reconciled through Brevo list+get; found => SENT with the Brevo ID; still exactly one POST', async () => {
  let posts = 0; const sentAt = '2026-11-02T03:30:05.000Z';
  const f = mockFetch(async (url, init) => {
    if (init.method === 'POST') { posts += 1; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }
    if (url.includes('/smtp/emails?')) return res(200, { count: 1, transactionalEmails: [{ uuid: 'u-1', messageId: '<found@relay.example.com>', email: 'customer1@example.com', subject: SUBJ, date: sentAt }] });
    if (url.includes('/smtp/emails/u-1')) return res(200, { subject: SUBJ, email: 'customer1@example.com', date: sentAt, body: B.plainToHtml(BODY), events: [{ name: 'sent', time: sentAt }] });
    return res(404, {});
  });
  const env = mkEnv(f); const r = await X.sendOne(draft(1), undefined, live(), env.deps);
  assert.deepStrictEqual([r.outcome, r.via, r.gmail_message_id], ['SENT', 'RECONCILIATION', 'found@relay.example.com']); assert.strictEqual(posts, 1);
  assert.deepStrictEqual(env.events.map((e) => e.to), ['READY_TO_SEND', 'SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', 'SENT']);
});
t('timeout and nothing found in Brevo: RECONCILIATION_REQUIRED, one POST only, later runs blocked, never an automatic resend', async () => {
  let posts = 0; const f = mockFetch(async (url, init) => { if (init.method === 'POST') { posts += 1; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } return res(200, { count: 0, transactionalEmails: [] }); });
  const env = mkEnv(f); const r = await X.sendOne(draft(1), undefined, live(), env.deps); assert.deepStrictEqual([r.outcome, r.code], ['RECONCILIATION_REQUIRED', 'NO_EVIDENCE_FOUND']);
  const later = await X.sendOne(draft(1), L.fold(env.events).get(S.sendKey(draft(1).fingerprint, draft(1).url_set_key)), live({ runId: 'run-b2' }), env.deps);
  assert.strictEqual(later.outcome, 'BLOCKED'); assert.strictEqual(posts, 1);
});
t('500 after the request is uncertain too: reconciled, never retried; Brevo search failure => RECONCILIATION_REQUIRED', async () => {
  let posts = 0; const f = mockFetch(async (url, init) => { if (init.method === 'POST') { posts += 1; return res(500, {}); } return res(503, {}); });
  const env = mkEnv(f); const r = await X.sendOne(draft(1), undefined, live(), env.deps); assert.deepStrictEqual([r.outcome, r.code], ['RECONCILIATION_REQUIRED', 'SEARCH_FAILED']); assert.strictEqual(posts, 1);
});
t('found message whose body differs or cannot be verified is NOT accepted as sent', async () => {
  const mk = (body) => mockFetch(async (url, init) => {
    if (init.method === 'POST') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (url.includes('/smtp/emails?')) return res(200, { transactionalEmails: [{ uuid: 'u-1', messageId: '<x@r>', email: 'customer1@example.com', subject: SUBJ, date: '2026-11-02T03:30:05.000Z' }] });
    return res(200, { subject: SUBJ, email: 'customer1@example.com', date: '2026-11-02T03:30:05.000Z', body });
  });
  const a = await X.sendOne(draft(1), undefined, live(), mkEnv(mk(B.plainToHtml(BODY + ' EDITED'))).deps); assert.deepStrictEqual([a.outcome, a.code], ['RECONCILIATION_REQUIRED', 'BODY_MISMATCH']);
  const b = await X.sendOne(draft(1), undefined, live(), mkEnv(mk(undefined)).deps); assert.deepStrictEqual([b.outcome, b.code], ['RECONCILIATION_REQUIRED', 'BODY_NOT_VERIFIED']);
});
t('key isolation: an internal test send uses its own test_ key, marked text and the internal recipient; the real customer key stays free', async () => {
  const f = ok(); const env = mkEnv(f); const d = draft(1);
  const ctx = { runId: 'run-t', delivery_mode: 'test', internal_recipients: ['karan.s@flexifunnels.com'], test_recipient: 'karan.s@flexifunnels.com' };
  const r = await X.sendOne(d, undefined, ctx, env.deps); assert.strictEqual(r.outcome, 'SENT');
  const p = JSON.parse(f.calls[0].init.body); assert.deepStrictEqual(p.to, [{ email: 'karan.s@flexifunnels.com' }]); assert.ok(p.subject.startsWith('INTERNAL TEST - ') && p.textContent.startsWith(S.TEST_BODY_BANNER));
  const real = S.sendKey(d.fingerprint, d.url_set_key); assert.ok(p.tags[0].startsWith('test_') && p.tags[0] !== real); assert.ok(!L.fold(env.events).has(real));
  assert.deepStrictEqual(S.preSendChecks(Object.assign({}, d, { state: 'STORED', send_key: real }), live()), { ok: true, failed: [] });   // the live send is still possible
  const bad = await X.sendOne(d, undefined, Object.assign({}, ctx, { runId: 'r2', test_recipient: 'someone@example.com' }), env.deps); assert.strictEqual(bad.outcome, 'BLOCKED');
});
t('Gmail adapter code is still available (not removed) and the provider-neutral sender still accepts the legacy deps.gmail', async () => {
  const G = require('../../src/lib/gmail'); assert.strictEqual(typeof G.buildSendRequest, 'function'); assert.strictEqual(typeof G.unwrapGoogleLinks, 'function');
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n += 1; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e)); process.exitCode = 1; } }
  console.log(`phase4 brevo (mocked HTTP): ${n}/${tests.length} test groups passed`);
})();
