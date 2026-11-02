'use strict';
// Gmail-only architecture tests (D-066): provider selection, strict Google-wrapper URL verification, post-send verification, approvals bound to
// recipient + draft hash. Synthetic data only (@example.com, fake Fathom ids). MOCKED Gmail, log and HTTP: no network, no email, no sheet.
// Run: node tests/unit/phase4-gmail-only.test.js
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const S = require('../../src/lib/sendstate'); const L = require('../../src/lib/sendlog'); const G = require('../../src/lib/gmail');
const X = require('../../src/lib/sender'); const U = require('../../src/lib/urlcheck'); const P = require('../../src/lib/provider'); const A = require('../../src/lib/approval');
const B = require('../../src/lib/brevo'); const C = require('../../src/brevo-check');

let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);
const FA = 'https://fathom.video/share/EXAMPLE-abc123'; const FB = 'https://fathom.video/share/EXAMPLE-def456';
const SUBJ = 'Follow-up on your FlexiFunnels support call'; const BODY = `Hi Test,\n\nYou can rewatch our call here:\n${FA}\n\nSecond part:\n${FB}\n\nWarm regards,\nSupport`;
const UST = '1793623527304000';
const wrap = (u, ust) => `https://www.google.com/url?q=${u}&source=gmail&ust=${ust || UST}&sa=E`;
const wrapEnc = (u) => `https://www.google.com/url?q=${encodeURIComponent(u)}&source=gmail&ust=${UST}&sa=E`;
const SENDER = 'Support Team <supportcore@flexifunnels.com>';
const CFG = { active: 'gmail', gmail_adapter_enabled: true, sender_address: 'supportcore@flexifunnels.com', sender_approved: true, pilot: { c1_authorised: true, c2_authorised: false, c3_authorised: false } };

// ---- mocks ----
function mkEnv(o) {
  const opt = o || {}; let tick = 0; const base = Date.parse('2026-11-02T03:30:00Z'); const env = { events: [], sent: [], sendCalls: 0, readCalls: 0, searchCalls: 0 };
  const deliver = (req) => {
    const body = opt.wrap === false ? req.body : req.body.split(FA).join(opt.wrapFn ? opt.wrapFn(FA) : wrap(FA)).split(FB).join(opt.wrapFn ? opt.wrapFn(FB) : wrap(FB));
    const m = { id: 'gm' + (env.sent.length + 1), subject: req.subject, to: opt.toOverride || req.to[0], from: opt.from === undefined ? SENDER : opt.from, date: env.deps.now(), body: opt.bodyOverride || body };
    if (opt.noFrom) delete m.from; env.sent.push(m); return m;
  };
  env.deps = {
    now: () => new Date(base + (tick++) * 1000).toISOString(),
    log: { events: () => env.events, append: async (e) => { L.buildEventRow(e); env.events.push(e); } },
    mail: {
      name: opt.name === undefined ? 'gmail' : opt.name,
      send: async (req) => {
        env.sendCalls += 1; env.lastRequest = req; const mode = opt.sendMode || 'ok';
        if (mode === 'ok') { const m = deliver(req); return { id: m.id, threadId: 'th' }; }
        if (mode === 'definite') { const e = new Error('rejected'); e.definite = true; e.code = 'CONNECTOR_REJECTED'; throw e; }
        if (mode === 'timeout_delivered') { deliver(req); throw new Error('timeout'); }
        if (mode === 'timeout_not_delivered') throw new Error('timeout');
        throw new Error('unknown mode');
      },
      search: async () => { env.searchCalls += 1; if (opt.searchFails) throw new Error('down'); return env.sent.map((m) => ({ id: m.id })); },
      read: async (id) => { env.readCalls += 1; if (opt.readFails) throw new Error('read down'); return env.sent.find((m) => m.id === id); },
    },
  };
  return env;
}
const draft = (i, o) => Object.assign({ stored: true, stored_recipient: `customer${i}@example.com`, stored_subject: SUBJ, stored_body: BODY, validation_status: 'PASSED', source_email: `customer${i}@example.com`,
  auto_send_eligible: true, sensitive_review_required: false, fingerprint: `2026-10-30|1${i}:00|customer${i}@example.com`, url_set_key: FA + '\n' + FB, destination_row: i + 1,
  validated_draft_hash: S.draftHash(`customer${i}@example.com`, SUBJ, BODY) }, o || {});
const key = (i) => S.sendKey(draft(i).fingerprint, draft(i).url_set_key);
const approval = (i, o) => A.createApproval(Object.assign({ send_key: key(i), recipient: `customer${i}@example.com`, draft_hash: S.draftHash(`customer${i}@example.com`, SUBJ, BODY), stage: 'C1', approved_by: 'Karan', approved_at: '2026-11-02T03:00:00Z', recording_permission_verified_by: 'Karan', dnc_lists_checked_by: 'Karan' }, o || {})).record;
const live = (approvals, extra) => P.sendContext(CFG, Object.assign({ runId: 'run-g', delivery_mode: 'live', live_authorized: true, approvals: approvals || [], now: '2026-11-02T03:10:00Z' }, extra || {}));
const states = (env) => env.events.map((e) => e.to);

// ---- 1-2. provider selection ----
t('Gmail-only selection: gmail is selected (enabled only when the adapter flag is true); no default and no fallback', () => {
  assert.deepStrictEqual(P.selectProvider(CFG), { name: 'gmail', enabled: true, fallback: false });
  assert.strictEqual(P.selectProvider({ active: 'gmail' }).enabled, false); assert.strictEqual(P.selectProvider({ active: ' GMAIL ', gmail_adapter_enabled: true }).name, 'gmail');
  for (const bad of [undefined, null, '', 'brevo', 'Brevo', 'gmail,brevo', 'sendgrid', 'gmail|brevo']) assert.throws(() => P.selectProvider({ active: bad }), (e) => /^PROVIDER_(NOT_CONFIGURED|NOT_ALLOWED)$/.test(e.code), String(bad));
  assert.throws(() => P.selectProvider({ active: 'gmail', allow_fallback: true }), (e) => e.code === 'PROVIDER_FALLBACK_NOT_ALLOWED');
});
t('Brevo is not selectable and not part of the Gmail readiness gates; Gmail readiness reports codes only', () => {
  assert.deepStrictEqual(P.gmailReadiness(CFG), []);
  assert.ok(P.gmailReadiness({ active: 'brevo', gmail_adapter_enabled: true, sender_address: 'supportcore@flexifunnels.com', sender_approved: true }).includes('PROVIDER_NOT_ALLOWED'));
  assert.deepStrictEqual(P.gmailReadiness(Object.assign({}, CFG, { gmail_adapter_enabled: false })), ['GMAIL_ADAPTER_DISABLED']);
  assert.deepStrictEqual(P.gmailReadiness(Object.assign({}, CFG, { sender_address: 'someone@flexifunnels.com' })), ['SENDER_ADDRESS_NOT_APPROVED']);
  assert.ok(!P.gmailReadiness(CFG).some((c) => /BREVO|TRACKING|API_KEY/.test(c)));
});
t('the real repo config selects Gmail, keeps every gate closed, and has Brevo retired', () => {
  const txt = fs.readFileSync(path.join(__dirname, '../../config/run-settings.yaml'), 'utf8'); const cfg = P.parseProviderConfig(txt);
  assert.strictEqual(cfg.active, 'gmail'); assert.strictEqual(cfg.allow_fallback, false); assert.deepStrictEqual(P.selectProvider(cfg), { name: 'gmail', enabled: false, fallback: false });
  assert.deepStrictEqual([cfg.customer_sending_authorised, cfg.internal_tests_authorised, cfg.pilot.c1_authorised, cfg.pilot.c2_authorised, cfg.pilot.c3_authorised], [false, false, false, false, false]);
  assert.ok(/^delivery_mode:\s*dry_run/m.test(txt) && /scheduled_execution:\s*false/.test(txt) && /^\s+writes_enabled:\s*false/m.test(txt));
  assert.ok(P.gmailReadiness(cfg).includes('GMAIL_ADAPTER_DISABLED'));
});
t('Brevo cannot send in the Gmail-only path: the sender blocks it before any log row or HTTP call; the Brevo check refuses --live', async () => {
  let http = 0; const f = async () => { http += 1; return { status: 201, headers: { get: () => null }, json: async () => ({ messageId: '<x@y>' }) }; };
  const brevo = B.createClient({ fetch: f, env: { BREVO_API_KEY: 'xkeysib-FAKE-0000', BREVO_SENDER_EMAIL: 'supportcore@flexifunnels.com' }, config: { approved_sender_email: 'supportcore@flexifunnels.com', sender_verified_in_brevo: true, link_tracking_disabled_confirmed: true } });
  const env = mkEnv(); env.deps.mail = brevo; const r = await X.sendOne(draft(1), undefined, live([approval(1)]), env.deps);
  assert.strictEqual(r.outcome, 'BLOCKED'); assert.deepStrictEqual(r.failed, ['PROVIDER_NOT_ALLOWED:brevo']); assert.strictEqual(http, 0); assert.strictEqual(env.events.length, 0);
  const yaml = 'email_provider:\n  active: gmail\n  brevo:\n    connectivity_check_authorised: true\n';
  const rep = await C.run({ argv: ['--live'], root: 'C:/r', processEnv: {}, git: (a) => (a[0] === 'check-ignore' ? 0 : 1), fetch: f, fs: { readFileSync: (p) => (String(p).endsWith('.yaml') ? yaml : 'BREVO_API_KEY=xkeysib-FAKE-0000\n') } });
  assert.strictEqual(rep.connectivity.code, 'PROVIDER_RETIRED'); assert.strictEqual(http, 0);
});
t('no automatic provider fallback: when Gmail fails, no other provider object is ever called', async () => {
  let other = 0; const env = mkEnv({ sendMode: 'definite' }); env.deps.brevo = { send: async () => { other += 1; return { id: 'b' }; } }; env.deps.gmail = undefined;
  const r = await X.sendOne(draft(1), undefined, live([approval(1)]), env.deps); assert.strictEqual(r.outcome, 'SEND_FAILED'); assert.strictEqual(other, 0); assert.strictEqual(env.sendCalls, 1);
});

// ---- 3-6. URL extraction and verification ----
t('original URL extraction from the observed wrapper (plain, percent-encoded q, &amp; separators, trailing punctuation)', () => {
  assert.deepStrictEqual(U.extractUrls(`a ${wrap(FA)}. b <${FB}> c (${FA}),`), [wrap(FA), FB, FA]);
  assert.deepStrictEqual(U.parseGoogleWrapper(wrap(FA)), { kind: 'wrapper', ok: true, destination: FA, ust: UST, expires_at: '2026-11-02T12:45:27.304Z' });
  assert.strictEqual(U.parseGoogleWrapper(wrapEnc(FA)).destination, FA);
  assert.strictEqual(U.parseGoogleWrapper(wrap(FA).replace(/&/g, '&amp;')).destination, FA);
  const q = 'https://fathom.video/share/EXAMPLE-q?t=1&s=2'; assert.strictEqual(U.parseGoogleWrapper(wrap(q)).destination, q);   // an unencoded & inside q is still read correctly
  assert.deepStrictEqual(U.parseGoogleWrapper(FA), { kind: 'not_wrapper' });
});
t('canonical equality is distinct from delivered representation: plain and wrapped both verify, each reported as what it is', () => {
  const v = U.verifyDeliveredUrls(`x ${wrap(FA)} y ${FB}`, [FA, FB]);
  assert.strictEqual(v.ok, true); assert.deepStrictEqual(v.items.map((i) => [i.representation, i.canonical_match, i.destination]), [['google_wrapper', true, FA], ['plain', true, FB]]);
  assert.strictEqual(v.wrapper_expires_at, '2026-11-02T12:45:27.304Z'); assert.ok(/may expire/.test(v.note));
  assert.strictEqual(U.verifyDeliveredUrls(FA, [FA]).items[0].representation, 'plain');
});
t('malformed or unknown wrappers are rejected (never trusted, never unwrapped)', () => {
  const bad = [`https://www.google.com/url?q=${FA}&source=gmail&sa=E`, `https://www.google.com/url?q=${FA}&source=other&ust=${UST}&sa=E`, `https://www.google.com/url?q=${FA}&source=gmail&ust=abc&sa=E`,
    `http://www.google.com/url?q=${FA}&source=gmail&ust=${UST}&sa=E`, `https://google.com/url?q=${FA}&source=gmail&ust=${UST}&sa=E`, `https://www.google.com/url?q=${FA}&source=gmail&ust=${UST}&sa=E&x=1`,
    `https://www.google.com/url?q=%E0%A4%A&source=gmail&ust=${UST}&sa=E`, `https://www.google.com/url?q=javascript:alert(1)&source=gmail&ust=${UST}&sa=E`, `https://www.google.com/url?q=not a url&source=gmail&ust=${UST}&sa=E`,
    `https://www.google.com/url?q=${wrap(FA)}&source=gmail&ust=${UST}&sa=E`, `https://www.google.com/url?source=gmail&ust=${UST}&sa=E`, `https://www.google.com/url?q=&source=gmail&ust=${UST}&sa=E`, `https://www.google.de/url?q=${FA}&sa=t`];
  for (const u of bad) { const r = U.parseGoogleWrapper(u); assert.strictEqual(r.kind, 'wrapper', u); assert.strictEqual(r.ok, false, u); const v = U.verifyDeliveredUrls('see ' + u, [FA]); assert.strictEqual(v.ok, false, u); }
  const u = bad[0]; assert.strictEqual(U.unwrapGoogleLinks('see ' + u), 'see ' + u);   // a malformed wrapper stays untouched
});
t('mismatched destinations are rejected: other id, extra query, lookalike host, case change, scheme change, swapped order, missing or extra URL', () => {
  const cases = [[wrap('https://fathom.video/share/EXAMPLE-zzz999'), [FA]], [wrap(FA + '?x=1'), [FA]], [wrap('https://fathom.video.evil.example/share/EXAMPLE-abc123'), [FA]], [wrap(FA.toUpperCase()), [FA]], [wrap(FA.replace('https', 'http')), [FA]],
    [`${wrap(FB)} ${wrap(FA)}`, [FA, FB]], [wrap(FA), [FA, FB]], [`${wrap(FA)} ${wrap(FB)}`, [FA]], ['no links at all', [FA]], [`${FA} https://evil.example/x`, [FA]]];
  for (const [d, c] of cases) assert.strictEqual(U.verifyDeliveredUrls(d, c).ok, false, d);
  assert.ok(U.verifyDeliveredUrls(wrap('https://fathom.video/share/EXAMPLE-zzz999'), [FA]).codes.includes('URL_DESTINATION_MISMATCH'));
  assert.ok(U.verifyDeliveredUrls(wrap(FA), [FA, FB]).codes.includes('URL_COUNT_MISMATCH')); assert.strictEqual(U.verifyDeliveredUrls('no urls', []).ok, true);
});
t('the stored validated draft is never rewritten; wrapper expiry is reported, not assumed valid', () => {
  const stored = BODY; const before = S.draftHash('a@example.com', SUBJ, stored); U.verifyDeliveredUrls(wrap(FA), [FA]); U.unwrapGoogleLinks(wrap(FA)); assert.strictEqual(S.draftHash('a@example.com', SUBJ, stored), before); assert.ok(!stored.includes('google.com'));
  assert.strictEqual(U.wrapperExpired('2026-11-02T12:45:27.304Z', '2026-11-02T12:00:00Z'), false); assert.strictEqual(U.wrapperExpired('2026-11-02T12:45:27.304Z', '2026-11-03T00:00:00Z'), true); assert.strictEqual(U.wrapperExpired(null, '2026-11-02T00:00:00Z'), true);
  assert.strictEqual(U.expiryOf('1793623527304'), '2026-11-02T12:45:27.304Z'); assert.strictEqual(U.expiryOf('0'), null);
});
t('reconciliation candidates are URL-verified: a valid wrapper reconciles, a mismatched or malformed one cannot', () => {
  const at = { recipient: 'customer1@example.com', subject: SUBJ, started_at: '2026-11-02T03:30:05Z', body_hash: L.bodyHash(BODY), expected_from: 'supportcore@flexifunnels.com' };
  const msg = (body, o) => Object.assign({ id: 'm1', subject: SUBJ, to: 'customer1@example.com', from: SENDER, date: '2026-11-02T03:30:10Z', body }, o || {});
  const delivered = BODY.split(FA).join(wrap(FA)).split(FB).join(wrapEnc(FB));
  assert.deepStrictEqual(S.reconcile(at, [G.toCandidate(msg(delivered), L.bodyHash, [FA, FB])]).outcome, 'SENT');
  const wrong = S.reconcile(at, [G.toCandidate(msg(BODY.split(FA).join(wrap('https://fathom.video/share/EXAMPLE-zzz999'))), L.bodyHash, [FA, FB])]); assert.deepStrictEqual([wrong.outcome, wrong.code], ['RECONCILIATION_REQUIRED', 'BODY_MISMATCH']);
  const malformed = S.reconcile(at, [G.toCandidate(msg(BODY.split(FA).join(`https://www.google.com/url?q=${FA}&sa=E`)), L.bodyHash, [FA, FB])]); assert.strictEqual(malformed.code, 'BODY_MISMATCH');
  assert.strictEqual(S.reconcile(at, [G.toCandidate(msg(delivered, { from: 'Evil <evil@example.com>' }), L.bodyHash, [FA, FB])]).code, 'FROM_MISMATCH');
  assert.strictEqual(S.reconcile(at, [G.toCandidate(msg(delivered, { from: undefined }), L.bodyHash, [FA, FB])]).code, 'FROM_NOT_VERIFIED');
  assert.strictEqual(S.reconcile(at, [G.toCandidate(msg(delivered, { to: 'other@example.com' }), L.bodyHash, [FA, FB])]).code, 'NO_MATCH_OTHER_MAIL_PRESENT');
});

// ---- 4. delivery verification, sending ----
t('live send, individually approved: log before send, Gmail wraps the URLs, verified on read-back (recipient, From, subject, body, URL destinations), then SENT', async () => {
  const env = mkEnv(); const r = await X.sendOne(draft(1), undefined, live([approval(1)]), env.deps);
  assert.strictEqual(r.outcome, 'SENT'); assert.strictEqual(env.sendCalls, 1); assert.deepStrictEqual(states(env), ['READY_TO_SEND', 'SEND_IN_PROGRESS', 'SENT']);
  assert.deepStrictEqual(env.lastRequest, { to: ['customer1@example.com'], subject: SUBJ, body: BODY, includeSignature: false });   // the stored text goes out unchanged
  assert.ok(env.sent[0].body.includes('https://www.google.com/url?q=')); assert.strictEqual(env.events[2].gmailMessageId, 'gm1'); assert.strictEqual(env.events[2].reason, 'PROVIDER_CONFIRMED:gmail');
});
t('a Gmail message ID alone is not proof: wrong From, missing From, wrong recipient, edited body, mismatched URL destination or unreadable message => RECONCILIATION_REQUIRED, never SENT, never resent', async () => {
  const cases = [[{ from: 'Evil <evil@example.com>' }, 'FROM_MISMATCH'], [{ noFrom: true }, 'FROM_NOT_VERIFIED'], [{ toOverride: 'other@example.com' }, 'NO_MATCH_OTHER_MAIL_PRESENT'],
    [{ bodyOverride: BODY + ' EDITED' }, 'BODY_MISMATCH'], [{ wrapFn: (u) => wrap('https://fathom.video/share/EXAMPLE-zzz999') }, 'BODY_MISMATCH'], [{ readFails: true }, 'SEARCH_FAILED']];
  for (const [o, code] of cases) {
    const env = mkEnv(o); const r = await X.sendOne(draft(1), undefined, live([approval(1)]), env.deps);
    assert.deepStrictEqual([r.outcome, r.code], ['RECONCILIATION_REQUIRED', code], JSON.stringify(o)); assert.strictEqual(env.sendCalls, 1);
    assert.deepStrictEqual(states(env).slice(0, 4), ['READY_TO_SEND', 'SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', 'RECONCILIATION_REQUIRED']);
    const later = await X.sendOne(draft(1), L.fold(env.events).get(key(1)), live([approval(1)], { runId: 'run-g2' }), env.deps); assert.strictEqual(later.outcome, 'BLOCKED'); assert.strictEqual(env.sendCalls, 1);
  }
});
t('uncertain Gmail outcome: timeout after delivery reconciles to SENT (wrapped URLs verified); timeout without message => RECONCILIATION_REQUIRED; exactly one send, no retry', async () => {
  const a = mkEnv({ sendMode: 'timeout_delivered' }); const ra = await X.sendOne(draft(1), undefined, live([approval(1)]), a.deps);
  assert.deepStrictEqual([ra.outcome, ra.via], ['SENT', 'RECONCILIATION']); assert.strictEqual(a.sendCalls, 1); assert.deepStrictEqual(states(a), ['READY_TO_SEND', 'SEND_IN_PROGRESS', 'SEND_OUTCOME_UNKNOWN', 'SENT']);
  const b = mkEnv({ sendMode: 'timeout_not_delivered' }); const rb = await X.sendOne(draft(1), undefined, live([approval(1)]), b.deps);
  assert.deepStrictEqual([rb.outcome, rb.code], ['RECONCILIATION_REQUIRED', 'NO_EVIDENCE_FOUND']); assert.strictEqual(b.sendCalls, 1);
  const again = await X.sendOne(draft(1), L.fold(b.events).get(key(1)), live([approval(1)], { runId: 'run-g2' }), b.deps); assert.strictEqual(again.outcome, 'BLOCKED'); assert.strictEqual(b.sendCalls, 1);
});
t('a definite rejection is SEND_FAILED with exactly one attempt; a later run does not retry it automatically', async () => {
  const env = mkEnv({ sendMode: 'definite' }); const r = await X.sendOne(draft(1), undefined, live([approval(1)]), env.deps); assert.deepStrictEqual([r.outcome, r.retry_count], ['SEND_FAILED', 1]);
  const again = await X.sendOne(draft(1), L.fold(env.events).get(key(1)), live([approval(1)], { runId: 'run-g2' }), env.deps); assert.strictEqual(again.outcome, 'BLOCKED'); assert.strictEqual(env.sendCalls, 1);
});
t('duplicate-send protection: a second run (and a batch containing the same call twice) sends nothing more', async () => {
  const env = mkEnv(); await X.sendOne(draft(1), undefined, live([approval(1)]), env.deps);
  const again = await X.runBatch([draft(1)], L.fold(env.events), live([approval(1)], { runId: 'run-g2' }), env.deps); assert.strictEqual(env.sendCalls, 1); assert.strictEqual(again.summary.duplicates_prevented, 1);
  const e2 = mkEnv(); const folded = new Map(); const b = await X.runBatch([draft(2), draft(2)], folded, live([approval(2)]), e2.deps);
  assert.strictEqual(e2.sendCalls, 1, JSON.stringify(b.summary));
});
t('test mode is unchanged by the migration: own test key, internal recipient, marked text, no approval needed, real key untouched', async () => {
  const env = mkEnv(); const ctx = P.sendContext(CFG, { runId: 'run-t', delivery_mode: 'test', internal_recipients: ['karan.s@flexifunnels.com'], test_recipient: 'karan.s@flexifunnels.com' });
  const r = await X.sendOne(draft(1), undefined, ctx, env.deps); assert.strictEqual(r.outcome, 'SENT'); assert.strictEqual(ctx.require_approval, false);
  assert.deepStrictEqual(env.lastRequest.to, ['karan.s@flexifunnels.com']); assert.ok(env.lastRequest.subject.startsWith('INTERNAL TEST - ')); assert.ok(r.send_key.startsWith('test_') && r.send_key !== key(1)); assert.ok(!L.fold(env.events).has(key(1)));
});

// ---- 6. approvals ----
t('approval is bound to send key, exact recipient and draft hash; every other combination is refused before any log row or send', async () => {
  const env = mkEnv(); const none = await X.sendOne(draft(1), undefined, live([]), env.deps); assert.ok(none.failed.includes('APPROVAL_REQUIRED'));
  const other = await X.sendOne(draft(1), undefined, live([approval(2)]), env.deps); assert.ok(other.failed.includes('APPROVAL_REQUIRED'));   // an approval for another call does not count
  const wrongRecipient = await X.sendOne(draft(1), undefined, live([approval(1, { recipient: 'someone.else@example.com' })]), env.deps); assert.ok(wrongRecipient.failed.includes('APPROVAL_RECIPIENT_MISMATCH'));
  const stage = await X.sendOne(draft(1), undefined, P.sendContext(Object.assign({}, CFG, { pilot: { c1_authorised: false } }), { runId: 'r', delivery_mode: 'live', live_authorized: true, approvals: [approval(1)], now: '2026-11-02T03:10:00Z' }), env.deps); assert.ok(stage.failed.includes('APPROVAL_STAGE_NOT_ACTIVE'));
  const c2 = await X.sendOne(draft(1), undefined, live([approval(1, { stage: 'C2' })]), env.deps); assert.ok(c2.failed.includes('APPROVAL_STAGE_NOT_ACTIVE'));   // C2 not authorised in this config
  for (const r of [none, other, wrongRecipient, stage, c2]) assert.strictEqual(r.outcome, 'BLOCKED');
  assert.strictEqual(env.sendCalls, 0); assert.strictEqual(env.events.length, 0);
});
t('approval invalidation after draft modification: an edited (even re-validated) draft needs a new approval; the old one never carries over', async () => {
  const edited = BODY.replace('Warm regards', 'Kind regards'); const d = draft(1, { stored_body: edited, validated_draft_hash: S.draftHash('customer1@example.com', SUBJ, edited) });
  const env = mkEnv(); const r = await X.sendOne(d, undefined, live([approval(1)]), env.deps);
  assert.strictEqual(r.outcome, 'BLOCKED'); assert.ok(r.failed.includes('APPROVAL_DRAFT_CHANGED')); assert.strictEqual(env.sendCalls, 0); assert.strictEqual(env.events.length, 0);
  const renew = approval(1, { draft_hash: S.draftHash('customer1@example.com', SUBJ, edited), approved_at: '2026-11-02T03:05:00Z' });
  assert.strictEqual((await X.sendOne(d, undefined, live([approval(1), renew]), env.deps)).outcome, 'SENT');   // the newest approval for the same key is the one checked
  const subj = draft(1, { stored_subject: SUBJ + '!', validated_draft_hash: S.draftHash('customer1@example.com', SUBJ + '!', BODY) }); assert.ok((await X.sendOne(subj, undefined, live([approval(1)]), mkEnv().deps)).failed.includes('APPROVAL_DRAFT_CHANGED'));
});
t('approval rules: revoked, expired, test keys, missing approver or hash, invalid stage, per-stage caps (C1 5, C2 15), duplicates', () => {
  const ctx = { authorised_stages: ['C1', 'C2'], now: '2026-11-02T03:10:00Z', stage_sent_counts: {} }; const rec = { send_key: key(1), recipient: 'customer1@example.com', draft_hash: S.draftHash('customer1@example.com', SUBJ, BODY) };
  assert.strictEqual(A.checkApproval([approval(1)], rec, ctx).ok, true);
  assert.strictEqual(A.checkApproval([Object.assign({}, approval(1), { revoked: true })], rec, ctx).code, 'APPROVAL_REVOKED');
  assert.strictEqual(A.checkApproval([approval(1, { expires_at: '2026-11-02T03:09:00Z' })], rec, ctx).code, 'APPROVAL_EXPIRED');
  assert.strictEqual(A.checkApproval([approval(1)], rec, Object.assign({}, ctx, { stage_sent_counts: { C1: 5 } })).code, 'APPROVAL_STAGE_CAP_REACHED'); assert.strictEqual(A.checkApproval([approval(1, { stage: 'C2' })], rec, Object.assign({}, ctx, { stage_sent_counts: { C2: 15 } })).code, 'APPROVAL_STAGE_CAP_REACHED');
  assert.strictEqual(A.checkApproval([approval(1)], Object.assign({}, rec, { send_key: 'test_abc' }), ctx).code, 'APPROVAL_INVALID_SEND_KEY');
  for (const bad of [{ send_key: 'test_abc' }, { recipient: 'nope' }, { draft_hash: '' }, { stage: 'C3' }, { stage: 'C0' }, { approved_by: ' ' }, { approved_at: 'x' }]) assert.strictEqual(A.createApproval(Object.assign({ send_key: key(1), recipient: 'a@example.com', draft_hash: 'h', stage: 'C1', approved_by: 'K', approved_at: '2026-11-02T03:00:00Z', recording_permission_verified_by: 'K', dnc_lists_checked_by: 'K' }, bad)).ok, false, JSON.stringify(bad));
  const six = [1, 2, 3, 4, 5, 6].map((i) => ({ send_key: 'send_' + i, stage: 'C1', approved_by: 'K', approved_at: 'x' })); assert.ok(A.validateApprovalSet(six).issues.some((i) => i.code === 'STAGE_CAP_EXCEEDED'));
  assert.ok(A.validateApprovalSet([six[0], six[0]]).issues.some((i) => i.code === 'DUPLICATE_ACTIVE_APPROVAL')); assert.strictEqual(A.validateApprovalSet(six.slice(0, 5)).ok, true); assert.deepStrictEqual(A.parseApprovals('not json'), []);
});
t('per-stage cap is enforced at send time and approvals are never created for dry_run/shadow sends', async () => {
  const env = mkEnv(); const r = await X.sendOne(draft(1), undefined, live([approval(1)], { stage_sent_counts: { C1: 5 } }), env.deps); assert.ok(r.failed.includes('APPROVAL_STAGE_CAP_REACHED')); assert.strictEqual(env.sendCalls, 0);
  const d = await X.sendOne(draft(1), undefined, P.sendContext(CFG, { runId: 'r', delivery_mode: 'dry_run', approvals: [approval(1)] }), env.deps); assert.ok(d.failed.includes('MODE_DOES_NOT_PERMIT_SEND')); assert.strictEqual(env.sendCalls, 0);
});
t('sensitive review, failed validation and invalid recipient still block, even with a valid approval (rules not weakened)', async () => {
  const env = mkEnv();
  for (const d of [draft(1, { sensitive_review_required: true }), draft(1, { validation_status: 'FAILED' }), draft(1, { auto_send_eligible: false }), draft(1, { source_email: 'other@example.com' })]) { const r = await X.sendOne(d, undefined, live([approval(1)]), env.deps); assert.strictEqual(r.outcome, 'BLOCKED'); }
  assert.strictEqual(env.sendCalls, 0); assert.strictEqual(env.events.length, 0);
});
t('source guarantees: no auto-approval path, provider.js reads no environment, no Brevo reference in the Gmail path modules', () => {
  const rd = (f) => fs.readFileSync(path.join(__dirname, '../../src/lib', f), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/process\.env/.test(rd('provider.js')) && !/process\.env/.test(rd('approval.js')) && !/process\.env/.test(rd('urlcheck.js')));
  for (const f of ['provider.js', 'urlcheck.js', 'approval.js', 'gmail.js', 'sendstate.js']) assert.ok(!/brevo/i.test(rd(f)), f);
  assert.ok(!/require\(['"]\.\/brevo['"]\)/.test(rd('sender.js')));
});

t('per-email attestations (D-075): an approval needs the approver\'s statement that recording permission was verified and the recipient was checked against all do-not-contact lists; without both it cannot be created and a record lacking them never counts at send time', async () => {
  const base = { send_key: key(1), recipient: 'customer1@example.com', draft_hash: S.draftHash('customer1@example.com', SUBJ, BODY), stage: 'C1', approved_by: 'Karan', approved_at: '2026-11-02T03:00:00Z' };
  for (const [o, code] of [[{}, 'APPROVAL_RECORDING_PERMISSION_ATTESTATION_REQUIRED'], [{ recording_permission_verified_by: ' ', dnc_lists_checked_by: 'K' }, 'APPROVAL_RECORDING_PERMISSION_ATTESTATION_REQUIRED'], [{ recording_permission_verified_by: 'K' }, 'APPROVAL_DNC_ATTESTATION_REQUIRED'], [{ recording_permission_verified_by: 'K', dnc_lists_checked_by: '' }, 'APPROVAL_DNC_ATTESTATION_REQUIRED']]) assert.strictEqual(A.createApproval(Object.assign({}, base, o)).code, code, JSON.stringify(o));
  const ok = A.createApproval(Object.assign({}, base, { recording_permission_verified_by: 'Priya', dnc_lists_checked_by: 'Sam' })); assert.deepStrictEqual(ok.record.attestations, { recording_permission_verified_by: 'Priya', dnc_lists_checked_by: 'Sam' });
  const legacy = Object.assign({}, approval(1)); delete legacy.attestations;   // an old-style record, or one edited by hand
  const env = mkEnv(); const r = await X.sendOne(draft(1), undefined, live([legacy]), env.deps); assert.strictEqual(r.outcome, 'BLOCKED'); assert.ok(r.failed.includes('APPROVAL_ATTESTATION_MISSING')); assert.strictEqual(env.sendCalls, 0); assert.strictEqual(env.events.length, 0);
  const half = Object.assign({}, approval(1), { attestations: { recording_permission_verified_by: 'Priya', dnc_lists_checked_by: '' } }); assert.strictEqual(A.checkApproval([half], { send_key: key(1), recipient: 'customer1@example.com', draft_hash: half.draft_hash }, { authorised_stages: ['C1'], now: '2026-11-02T03:10:00Z' }).code, 'APPROVAL_ATTESTATION_MISSING');
  assert.strictEqual((await X.sendOne(draft(1), undefined, live([approval(1)]), mkEnv().deps)).outcome, 'SENT');   // with both attestations the send proceeds
});
t('secrets hygiene (D-069): .env.example holds placeholders only, no tracked file has a real-shaped Brevo key, and the Gmail send path never reads the environment or .env', () => {
  const root = path.join(__dirname, '../..'); const ex = fs.readFileSync(path.join(root, '.env.example'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  assert.ok(ex.every((l) => /^[A-Za-z_][A-Za-z0-9_]*=\s*$/.test(l)), 'every uncommented assignment must be empty'); assert.ok(!/xkeysib-[A-Za-z0-9]{20,}/.test(fs.readFileSync(path.join(root, '.env.example'), 'utf8')));
  const tracked = require('child_process').spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  const bad = tracked.filter((f) => { try { return /xkeysib-[A-Za-z0-9]{32,}/.test(fs.readFileSync(path.join(root, f), 'latin1')); } catch (e) { return false; } }); assert.deepStrictEqual(bad, []);
  assert.ok(!tracked.some((f) => /(^|\/)\.env$/.test(f)));
  for (const f of ['sender.js', 'provider.js', 'gmail.js', 'urlcheck.js', 'approval.js', 'pilot.js', 'sendstate.js', 'sendlog.js']) { const s = fs.readFileSync(path.join(root, 'src/lib', f), 'utf8').replace(/\/\/.*$/gm, ''); assert.ok(!/process\.env|\.env['"]|BREVO|require\(['"]\.\/(brevo|env)['"]\)/.test(s), f); }
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n += 1; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)); process.exitCode = 1; } }
  console.log(`phase4 gmail-only: ${n}/${tests.length} test groups passed`);
})();
