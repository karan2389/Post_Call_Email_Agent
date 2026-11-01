'use strict';
// .env loader + read-only Brevo connectivity check tests (D-061). MOCKED HTTP and in-memory files only; fake key; no real request is possible.
// Run: node tests/unit/phase4-env.test.js
const assert = require('assert');
const E = require('../../src/lib/env');
const B = require('../../src/lib/brevo');
const C = require('../../src/brevo-check');

const KEY = 'xkeysib-FAKE-TEST-KEY-0000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ENVTXT = `# comment\nBREVO_API_KEY=${KEY}\nBREVO_SENDER_EMAIL=supportcore@flexifunnels.com\nBREVO_SENDER_NAME=Support Team | FlexiFunnels\n`;
const YAML = `email_provider:\n  active: brevo\n  brevo:\n    adapter_enabled: false\n    approved_sender_email: supportcore@flexifunnels.com\n    approved_sender_name: Support Team | FlexiFunnels\n    connectivity_check_authorised: AUTH\n    sender_verified_in_brevo: false\n    link_tracking_disabled_confirmed: false\nnext_block: 1\n`;
let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);

const res = (status, body, headers) => ({ status, headers: { get: (k) => (headers || {})[String(k).toLowerCase()] || null }, json: async () => { if (body === undefined) throw new Error('no json'); return body; } });
const mockFetch = (handler) => { const calls = []; const f = async (url, init) => { calls.push({ url, init: Object.assign({}, init, { signal: undefined }) }); return handler(url, init); }; f.calls = calls; return f; };
const memfs = (files) => ({ readFileSync: (p) => { const k = String(p).replace(/\\/g, '/').split('/').slice(-2).join('/'); const kk = k.endsWith('.env') ? '.env' : k; if (!(kk in files)) { const e = new Error('ENOENT secret-path'); e.code = 'ENOENT'; throw e; } return files[kk]; } });
const files = (auth, envtxt) => ({ 'config/run-settings.yaml': YAML.replace('AUTH', auth ? 'true' : 'false'), '.env': envtxt === undefined ? ENVTXT : envtxt });
const run = (o) => C.run(Object.assign({ argv: [], root: 'C:/repo', processEnv: {}, git: (a) => (a[0] === 'check-ignore' ? 0 : 1) }, o));
const clientFor = (f, env, cfg) => B.createClient({ fetch: f, env: env || { BREVO_API_KEY: KEY }, config: cfg || {}, timeoutMs: 40 });

t('parser: names, quotes, comments, export, BOM, CRLF; values exact', () => {
  const p = E.parseEnv('\uFEFFexport BREVO_API_KEY="abc def"  # c\r\nBREVO_SENDER_EMAIL = a@b.co # c\r\nBREVO_SENDER_NAME=\'Q | R\'\r\n');
  assert.deepStrictEqual(p.values, { BREVO_API_KEY: 'abc def', BREVO_SENDER_EMAIL: 'a@b.co', BREVO_SENDER_NAME: 'Q | R' }); assert.deepStrictEqual(p.issues, []);
});
t('parser: unexpected names ignored and reported by name only; duplicates dropped (never last-wins); malformed lines never echoed', () => {
  const p = E.parseEnv(`OTHER_SECRET=topsecret\nBREVO_API_KEY=${KEY}\nBREVO_API_KEY=second\nthis is ${KEY} garbage\nBREVO_SENDER_NAME="unterminated\n`);
  assert.ok(!('OTHER_SECRET' in p.values) && !('BREVO_API_KEY' in p.values));
  const codes = p.issues.map((i) => i.code).sort(); assert.deepStrictEqual(codes, ['DUPLICATE_NAME_DROPPED', 'MALFORMED_VALUE', 'UNEXPECTED_NAME_IGNORED', 'UNPARSEABLE_LINE']);
  const dump = JSON.stringify(p.issues); assert.ok(!dump.includes(KEY) && !dump.includes('topsecret') && !dump.includes('garbage') && !dump.includes('second') && !dump.includes('unterminated'));
});
t('loadEnv: file values loaded, real process env wins, process.env is never modified, missing/unreadable file reported without the error text', () => {
  const before = JSON.stringify(process.env);
  const a = E.loadEnv({ fs: memfs({ '.env': ENVTXT }), file: 'C:/repo/.env', processEnv: { BREVO_SENDER_NAME: 'From process' } });
  assert.strictEqual(a.env.BREVO_API_KEY, KEY); assert.strictEqual(a.env.BREVO_SENDER_NAME, 'From process'); assert.deepStrictEqual(a.sources, { BREVO_API_KEY: 'file', BREVO_SENDER_EMAIL: 'file', BREVO_SENDER_NAME: 'process' });
  assert.strictEqual(JSON.stringify(process.env), before);
  const m = E.loadEnv({ fs: memfs({}), file: 'C:/repo/.env', processEnv: {} }); assert.deepStrictEqual(m.env, {}); assert.deepStrictEqual(m.issues, [{ code: 'ENV_FILE_MISSING' }]); assert.ok(!JSON.stringify(m).includes('secret-path'));
  const u = E.loadEnv({ fs: { readFileSync: () => { throw Object.assign(new Error('EACCES ' + KEY), { code: 'EACCES' }); } }, file: 'x', processEnv: {} }); assert.deepStrictEqual(u.issues, [{ code: 'ENV_FILE_UNREADABLE' }]); assert.ok(!JSON.stringify(u).includes(KEY));
  assert.deepStrictEqual(E.loadEnv({ fs: memfs({ '.env': 'BREVO_API_KEY=\n' }), file: 'C:/repo/.env' }).env, {});   // empty value = not present
});
t('describeEnv returns booleans only; redact removes the key from any text', () => {
  const d = E.describeEnv({ BREVO_API_KEY: KEY, BREVO_SENDER_EMAIL: '', BREVO_SENDER_NAME: 'x' }); assert.deepStrictEqual(d, { BREVO_API_KEY: true, BREVO_SENDER_EMAIL: false, BREVO_SENDER_NAME: true });
  assert.ok(!E.redact(`boom ${KEY} boom ${KEY}`, { BREVO_API_KEY: KEY }).includes(KEY));
});
t('connectivity: exactly one GET https://api.brevo.com/v3/account, api-key header, no body; 200 => CONNECTED, result holds codes only', async () => {
  const f = mockFetch(async () => res(200, { email: 'private@example.com', plan: [{ type: 'free' }] })); const r = await clientFor(f).checkConnectivity();
  assert.deepStrictEqual(r, { ok: true, status: 200, code: 'CONNECTED', request_made: true });
  assert.strictEqual(f.calls.length, 1); const c = f.calls[0]; assert.strictEqual(c.url, 'https://api.brevo.com/v3/account'); assert.strictEqual(c.init.method, 'GET'); assert.strictEqual(c.init.body, undefined); assert.strictEqual(c.init.headers['api-key'], KEY);
  assert.ok(!JSON.stringify(r).includes('private@example.com'));
});
t('connectivity: failures return codes, never throw, never retry, never include the key (401, 403, 429, 500, network, timeout)', async () => {
  const cases = [[async () => res(401, { message: 'bad ' + KEY }), 'AUTHENTICATION_FAILED', 401], [async () => res(403, {}), 'HTTP_403', 403], [async () => res(429, {}), 'RATE_LIMITED', 429], [async () => res(500, {}), 'HTTP_500', 500],
    [async () => { throw new Error('ECONNRESET ' + KEY); }, 'NETWORK_ERROR', null]];
  for (const [h, code, status] of cases) { const f = mockFetch(h); const r = await clientFor(f).checkConnectivity(); assert.deepStrictEqual([r.ok, r.code, r.status, r.request_made], [false, code, status, true]); assert.strictEqual(f.calls.length, 1); assert.ok(!JSON.stringify(r).includes(KEY)); }
  const f = mockFetch((u, init) => new Promise((_, rej) => { init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))); }));
  const r = await clientFor(f).checkConnectivity(); assert.deepStrictEqual([r.ok, r.code, f.calls.length], [false, 'TIMEOUT', 1]);
});
t('connectivity: no key or a redirected base URL => no request at all; sender/tracking gates do not block a read-only check', async () => {
  for (const [env, cfg, code] of [[{}, {}, 'MISSING_API_KEY'], [{ BREVO_API_KEY: 'two words' }, {}, 'MISSING_API_KEY'], [{ BREVO_API_KEY: KEY }, { api_base: 'https://evil.example/v3' }, 'API_BASE_NOT_BREVO']]) {
    const f = mockFetch(async () => res(200, {})); const r = await clientFor(f, env, cfg).checkConnectivity(); assert.deepStrictEqual([r.ok, r.code, r.request_made, f.calls.length], [false, code, false, 0]);
  }
  const f = mockFetch(async () => res(200, {})); assert.strictEqual((await clientFor(f, { BREVO_API_KEY: KEY }, { sender_verified_in_brevo: false, link_tracking_disabled_confirmed: false }).checkConnectivity()).ok, true);
});
t('checkConnectivity cannot send: the client has no path from it to POST /smtp/email', async () => {
  const f = mockFetch(async () => res(200, {})); await clientFor(f).checkConnectivity(); await clientFor(f).checkConnectivity();
  assert.ok(f.calls.every((c) => c.init.method === 'GET' && !/smtp\/email$/.test(c.url)));
});
t('sender name gate: once an approved name is on record, a different BREVO_SENDER_NAME blocks sending; absent approved name changes nothing', () => {
  const env = { BREVO_API_KEY: KEY, BREVO_SENDER_EMAIL: 'supportcore@flexifunnels.com', BREVO_SENDER_NAME: 'Support Team | FlexiFunnels' };
  const cfg = { approved_sender_email: 'supportcore@flexifunnels.com', sender_verified_in_brevo: true, link_tracking_disabled_confirmed: true };
  assert.deepStrictEqual(B.readiness(env, cfg), []); assert.deepStrictEqual(B.readiness(env, Object.assign({ approved_sender_name: 'Support Team | FlexiFunnels' }, cfg)), []);
  assert.deepStrictEqual(B.readiness(Object.assign({}, env, { BREVO_SENDER_NAME: 'Other' }), Object.assign({ approved_sender_name: 'Support Team | FlexiFunnels' }, cfg)), ['SENDER_NAME_NOT_APPROVED']);
});
t('CLI offline report: no request, booleans/codes only, key absent from the whole report; sender checks pass; gates still closed', async () => {
  const f = mockFetch(async () => res(200, {})); const r = await run({ fs: memfs(files(false)), fetch: f });
  assert.strictEqual(f.calls.length, 0); assert.strictEqual(r.request_made, false); assert.ok(!JSON.stringify(r).includes(KEY));
  assert.deepStrictEqual(r.variables_present, { BREVO_API_KEY: true, BREVO_SENDER_EMAIL: true, BREVO_SENDER_NAME: true });
  assert.deepStrictEqual([r.sender_email_matches_approved, r.sender_name_matches_approved, r.env_ignored_by_git, r.env_tracked_by_git, r.connectivity_check_authorised], [true, true, true, false, false]);
  assert.deepStrictEqual(r.send_readiness_blockers, ['SENDER_NOT_VERIFIED_IN_BREVO', 'LINK_TRACKING_NOT_CONFIRMED_OFF']);
});
t('CLI --live is refused while connectivity_check_authorised is false: zero requests', async () => {
  const f = mockFetch(async () => res(200, {})); const r = await run({ argv: ['--live'], fs: memfs(files(false)), fetch: f });
  assert.deepStrictEqual(r.connectivity, { ok: false, code: 'CONNECTIVITY_CHECK_NOT_AUTHORISED', request_made: false }); assert.strictEqual(f.calls.length, 0); assert.strictEqual(r.request_made, false);
});
t('CLI --live with the gate open: one GET /account only; refused if .env is tracked or not ignored, or fetch is missing', async () => {
  const f = mockFetch(async () => res(200, {})); const r = await run({ argv: ['--live'], fs: memfs(files(true)), fetch: f });
  assert.strictEqual(r.connectivity.code, 'CONNECTED'); assert.strictEqual(r.request_made, true); assert.strictEqual(f.calls.length, 1); assert.ok(f.calls[0].url.endsWith('/v3/account') && f.calls[0].init.method === 'GET'); assert.ok(!JSON.stringify(r).includes(KEY));
  const g1 = mockFetch(async () => res(200, {})); const a = await run({ argv: ['--live'], fs: memfs(files(true)), fetch: g1, git: () => 1 }); assert.strictEqual(a.connectivity.code, 'ENV_FILE_NOT_PROTECTED'); assert.strictEqual(g1.calls.length, 0);
  const g2 = mockFetch(async () => res(200, {})); const b = await run({ argv: ['--live'], fs: memfs(files(true)), fetch: g2, git: () => 0 }); assert.strictEqual(b.connectivity.code, 'ENV_FILE_NOT_PROTECTED'); assert.strictEqual(g2.calls.length, 0);
  assert.strictEqual((await run({ argv: ['--live'], fs: memfs(files(true)), fetch: undefined })).connectivity.code, 'NO_FETCH_AVAILABLE');
});
t('CLI --live with a wrong key reports the code only; a missing .env reports blockers without a request', async () => {
  const f = mockFetch(async () => res(401, { message: 'bad ' + KEY })); const r = await run({ argv: ['--live'], fs: memfs(files(true)), fetch: f }); assert.strictEqual(r.connectivity.code, 'AUTHENTICATION_FAILED'); assert.ok(!JSON.stringify(r).includes(KEY));
  const g = mockFetch(async () => res(200, {})); const m = await run({ argv: ['--live'], fs: memfs({ 'config/run-settings.yaml': YAML.replace('AUTH', 'true') }), fetch: g });
  assert.strictEqual(m.connectivity.code, 'MISSING_API_KEY'); assert.strictEqual(g.calls.length, 0); assert.deepStrictEqual(m.env_file_issues, [{ code: 'ENV_FILE_MISSING' }]);
});
t('the real repo config keeps the sending gates closed (adapter, customer sending, live mode) and records the approved name', () => {
  const fs = require('fs'); const txt = fs.readFileSync(require('path').join(__dirname, '../../config/run-settings.yaml'), 'utf8'); const cfg = C.brevoConfig(txt);
  assert.deepStrictEqual([cfg.approved_sender_name, cfg.connectivity_check_authorised, cfg.adapter_enabled], ['Support Team | FlexiFunnels', false, false]);
  assert.ok(/^delivery_mode:\s*dry_run/m.test(txt)); assert.ok(/customer_sending_authorised:\s*false/.test(txt)); assert.ok(/^\s+writes_enabled:\s*false/m.test(txt)); assert.ok(/scheduled_execution:\s*false/.test(txt));
});
t('source guarantees: env.js and brevo-check.js contain no write to process.env, no network call of their own, and the adapter still never reads process.env', () => {
  const fs = require('fs'); const p = (f) => fs.readFileSync(require('path').join(__dirname, '../../src', f), 'utf8');
  for (const f of ['lib/env.js', 'lib/brevo.js']) assert.ok(!/process\.env\s*(\[|\.)/.test(p(f).replace(/\/\/.*$/gm, '')), f);
  assert.ok(!/process\.env\s*\[[^\]]*\]\s*=/.test(p('brevo-check.js')) && !/https?:\/\/api\.brevo/.test(p('brevo-check.js')));
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n += 1; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e)); process.exitCode = 1; } }
  console.log(`phase4 env+connectivity (mocked HTTP): ${n}/${tests.length} test groups passed`);
})();
