'use strict';
// C0 pilot-preparation tests (D-068, D-070): candidate pool rules, allowlist validation, review card, approval binding, suppression, verified confidence.
// Synthetic data only (invented names, @acme-demo.test addresses). No network, no sheet, no mailbox. Run: node tests/unit/phase4-pilot.test.js
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const PL = require('../../src/lib/pilot'); const A = require('../../src/lib/approval'); const S = require('../../src/lib/sendstate'); const X = require('../../src/lib/sender'); const P = require('../../src/lib/provider'); const CF = require('../../src/lib/confidence');
const NZ = require('../../src/lib/normalize');

let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);
const NOW = '2026-11-02T03:00:00Z'; const SKILLS = 'ta=1.6.0;cs=1.4.1;eg=1.6.1;ev=1.5.0';
const rec = (i, o) => Object.assign({ sourceRow: String(15400 + i), customerName: 'Test Person ' + i, customerEmail: `person${i}@acme-demo.test`, callDate: '2026-10-30', callTime: `1${i}:00`, urls: [`https://fathom.video/share/EXAMPLE-pilot-000${i}`],
  subject: 'Follow-up on your support call', body: `Hi Test ${i},\n\nHere is your recording:\nhttps://fathom.video/share/EXAMPLE-pilot-000${i}\n\nWarm regards,\nSupport`, validationStatus: 'PASSED', processingStatus: 'DRAFT_READY', reasonCode: '',
  sensitive: false, transcriptHash: 'th' + i, skillVersions: SKILLS }, o || {});
const item = (o) => Object.assign({ id: 'I1', category: 'completed', owner: 'customer', evidence: ['quote'], confidence: 'high' }, o || {});
const analysis = (o) => Object.assign({ overall_confidence: 'high', transcript_quality: 'clear', generation_mode: 'full', items: [item(), item({ id: 'I2' }), item({ id: 'I3', category: 'explained', owner: 'support' })], sensitive_topics: [], analysis_notes: [], injection_attempt_detected: false, skip_recommendation: { skip: false } }, o || {});
const recordFor = (r, a, over) => { const c = PL.approvalCard(r); return Object.assign(CF.buildRecord(a || analysis(), { callRef: r.sourceRow, sendKey: c.send_key, draftHash: c.draft_hash, transcriptHash: r.transcriptHash, skillVersions: r.skillVersions, createdAt: '2026-11-02T00:00:00Z' }), over || {}); };
const pool = (rs, o) => PL.candidatePool(rs, Object.assign({ confidenceRecords: rs.map((r) => recordFor(r)), now: NOW }, o || {}));
const card = (r, x) => PL.approvalCard(r, Object.assign({ confidenceRecords: [recordFor(r)], now: NOW }, x || {}));
const codes = (p, ref) => (p.excluded.find((e) => e.call_ref === String(ref)) || {}).codes;

t('pool: a PASSED + DRAFT_READY, single-recipient, medium/high-confidence, non-sensitive record is eligible with its send key, recipient and draft hash', () => {
  const rs = [rec(1), rec(2)]; const p = PL.candidatePool(rs, { confidenceRecords: [recordFor(rs[0]), recordFor(rs[1], analysis({ overall_confidence: 'medium' }))], now: NOW });
  assert.strictEqual(p.eligible.length, 2); assert.strictEqual(p.excluded.length, 0);
  const e = p.eligible[0]; assert.ok(/^send_[0-9a-f]{24}$/.test(e.send_key)); assert.strictEqual(e.recipient, 'person1@acme-demo.test'); assert.strictEqual(e.draft_hash, S.draftHash('person1@acme-demo.test', rec(1).subject, rec(1).body));
});
t('pool exclusions, each with its own code: validation, draft status, recipient problems, sensitivity, deferred calls, missing text/URL, synthetic address', () => {
  const bad = [[{ validationStatus: 'REVIEW_REQUIRED' }, 'VALIDATION_NOT_PASSED'], [{ processingStatus: 'REVIEW_REQUIRED' }, 'NOT_DRAFT_READY'], [{ customerEmail: 'a@acme-demo.test, b@acme-demo.test' }, 'RECIPIENT_NOT_SINGLE_ADDRESS'],
    [{ customerEmail: 'a@acme-demo.test b@acme-demo.test' }, 'RECIPIENT_NOT_SINGLE_ADDRESS'], [{ customerEmail: '' }, 'RECIPIENT_MISSING'], [{ customerEmail: 'not-an-email' }, 'RECIPIENT_INVALID'],
    [{ sensitive: true }, 'SENSITIVE_TOPIC'], [{ sensitive: undefined }, 'SENSITIVE_STATUS_NOT_AVAILABLE'],
    [{ subject: '' }, 'DRAFT_TEXT_MISSING'], [{ urls: [] }, 'NO_RECORDING_URL'], [{ customerEmail: 'x@example.com' }, 'SYNTHETIC_RECIPIENT'], [{ sourceRow: 15453 }, 'DEFERRED_CALL'], [{ sourceRow: '15454' }, 'DEFERRED_CALL']];
  bad.forEach(([o, code], i) => { const p = pool([rec(1, Object.assign({ sourceRow: 'r' + i }, o))]); assert.strictEqual(p.eligible.length, 0, code); assert.ok(p.excluded[0].codes.includes(code), code + ' got ' + p.excluded[0].codes); });
  assert.strictEqual(pool([rec(1, { callDate: '' })]).excluded[0].codes.includes('NO_SOURCE_FINGERPRINT'), true);
});
t('confidence in the pool is read only from a verified record (D-070): low, missing, unverifiable, stale, tampered, mismatched or conflicting records all exclude the draft', () => {
  const r1 = rec(1); const good = recordFor(r1); const run = (records, r) => PL.candidatePool([r || r1], { confidenceRecords: records, now: NOW });
  assert.strictEqual(run([good]).eligible.length, 1);
  const low = (a) => run([recordFor(r1, a)]).excluded[0].codes;
  assert.deepStrictEqual(low(analysis({ overall_confidence: 'low' })), ['CONFIDENCE_TOO_LOW']); assert.deepStrictEqual(low(analysis({ transcript_quality: 'partly_garbled' })), ['CONFIDENCE_TOO_LOW']);
  assert.deepStrictEqual(low(analysis({ items: [item({ confidence: 'low' })] })), ['CONFIDENCE_TOO_LOW']);
  assert.deepStrictEqual(run([]).excluded[0].codes, ['CONFIDENCE_NOT_AVAILABLE']); assert.deepStrictEqual(PL.candidatePool([r1], { now: NOW }).excluded[0].codes, ['CONFIDENCE_NOT_AVAILABLE']);
  assert.deepStrictEqual(run([Object.assign({}, good, { derived: 'high', evidence: Object.assign({}, good.evidence, { low: 2 }) })]).excluded[0].codes, ['CONFIDENCE_INTEGRITY_FAILED']);   // hand-edited record
  assert.deepStrictEqual(run([good], rec(1, { body: r1.body + ' edited' })).excluded[0].codes, ['CONFIDENCE_DRAFT_CHANGED']);   // same call and send key, but the record is bound to the exact draft hash
  assert.deepStrictEqual(run([good], rec(1, { subject: 'Another subject' })).excluded[0].codes, ['CONFIDENCE_DRAFT_CHANGED']);
  assert.deepStrictEqual(PL.candidatePool([r1], { confidenceRecords: [good], now: '2026-12-01T00:00:00Z' }).excluded[0].codes, ['CONFIDENCE_EXPIRED']);
  assert.deepStrictEqual(run([good], rec(1, { transcriptHash: 'other' })).excluded[0].codes, ['CONFIDENCE_TRANSCRIPT_MISMATCH']); assert.deepStrictEqual(run([good], rec(1, { skillVersions: 'ta=9' })).excluded[0].codes, ['CONFIDENCE_SKILL_VERSIONS_MISMATCH']);
  assert.deepStrictEqual(run([good], rec(1, { sourceRow: '15499' })).excluded[0].codes.filter((c) => c.startsWith('CONFIDENCE')), ['CONFIDENCE_CALL_MISMATCH']);
  const cc = PL.approvalCard(r1); const medium = CF.buildRecord(analysis({ overall_confidence: 'medium' }), { callRef: r1.sourceRow, sendKey: cc.send_key, draftHash: cc.draft_hash, transcriptHash: r1.transcriptHash, skillVersions: r1.skillVersions, createdAt: '2026-11-02T01:00:00Z' });
  assert.deepStrictEqual(run([good, medium]).excluded[0].codes, ['CONFIDENCE_CONFLICT']);   // two valid records for the same draft that disagree: fail closed
  assert.strictEqual(run([good, good]).eligible.length, 1);   // identical duplicates are harmless
});
t('deferred calls 15453 and 15454 are excluded even when everything else passes; the exclusion list is the default', () => {
  assert.deepStrictEqual(PL.DEFERRED_SOURCE_ROWS, ['15453', '15454']);
  const p = pool([rec(1, { sourceRow: '15453' }), rec(2, { sourceRow: '15454' }), rec(3)]); assert.deepStrictEqual(p.eligible.map((e) => e.call_ref), ['15403']); assert.deepStrictEqual(codes(p, '15453'), ['DEFERRED_CALL']);
});
t('suppressed recipients (exact address or whole domain) and calls already in the Send Log are excluded', () => {
  const k1 = S.sendKey(NZ.fingerprint('2026-10-30', '11:00', 'person1@acme-demo.test'), NZ.urlSetKey(rec(1).urls));
  const p = pool([rec(1), rec(2), rec(3), rec(4)], { suppressed: ['Person2@acme-demo.test', '@other-demo.test'], inSendLog: new Set([k1]) });
  assert.ok(codes(p, 15401).includes('ALREADY_IN_SEND_LOG')); assert.deepStrictEqual(codes(p, 15402), ['RECIPIENT_SUPPRESSED']); assert.deepStrictEqual(p.eligible.map((e) => e.call_ref), ['15403', '15404']);
  assert.ok(PL.isSuppressed('anyone@other-demo.test', ['@other-demo.test'])); assert.ok(!PL.isSuppressed('anyone@other-demo.test', ['@demo.test'])); assert.ok(!PL.isSuppressed('', ['@x']));
});
t('the pool is deterministic: the same input in any order gives the same ordered output', () => {
  const rs = [rec(3), rec(1), rec(2), rec(4)]; const a = pool(rs).eligible.map((e) => e.call_ref); const b = pool(rs.slice().reverse()).eligible.map((e) => e.call_ref);
  assert.deepStrictEqual(a, b); assert.deepStrictEqual(a, ['15401', '15402', '15403', '15404']);
});
t('allowlist validation: at most five, distinct, in the pool, no test keys, not empty; nothing is created by the module', () => {
  const rs = [1, 2, 3, 4, 5, 6, 7].map((i) => rec(i)); const p = pool(rs); const keys = p.eligible.map((e) => e.send_key);
  assert.strictEqual(PL.validateAllowlist(keys.slice(0, 5), p).ok, true);
  const codesOf = (l) => PL.validateAllowlist(l, p).issues.map((i) => i.code);
  assert.ok(codesOf(keys.slice(0, 6)).includes('ALLOWLIST_OVER_CAP')); assert.ok(codesOf([keys[0], keys[0]]).includes('ALLOWLIST_DUPLICATE')); assert.ok(codesOf(['send_000000000000000000000000']).includes('ALLOWLIST_KEY_NOT_IN_POOL'));
  assert.ok(codesOf(['test_abc']).includes('ALLOWLIST_TEST_KEY')); assert.ok(codesOf([]).includes('ALLOWLIST_EMPTY')); assert.strictEqual(PL.validateAllowlist(keys, p, 15).ok, true);   // the C2 cap (15) is a parameter; the C1 default stays 5
  assert.strictEqual(PL.C1_MAX, 5); assert.deepStrictEqual(Object.keys(PL).sort(), ['C1_MAX', 'DEFERRED_SOURCE_ROWS', 'approvalCard', 'candidatePool', 'isSuppressed', 'renderCard', 'singleRecipient', 'validateAllowlist']);
});
t('review card carries every field the approver must see (confidence from the verified record only); rendering includes the full body and all identifiers', () => {
  const c = card(rec(1), { stage: 'C1' }); const need = ['customer_name', 'recipient', 'call_ref', 'subject', 'body', 'fathom_urls', 'validation_status', 'confidence', 'confidence_status', 'sensitive_topic', 'send_key', 'draft_hash'];
  need.forEach((k) => assert.ok(c[k] !== undefined && c[k] !== null && c[k] !== '', k)); assert.strictEqual(c.approvable, true); assert.strictEqual(c.confidence_status, 'VERIFIED'); assert.strictEqual(c.generation_mode, 'full');
  assert.deepStrictEqual(c.binding, { send_key: c.send_key, recipient: c.recipient, draft_hash: c.draft_hash });
  assert.deepStrictEqual(c.attestations_required, ['RECORDING_PERMISSION_VERIFIED', 'DNC_LISTS_CHECKED']);   // the approver states both for this recipient (D-075)
  assert.ok(PL.renderCard(c).includes(`APPROVE C1 ${c.send_key} ${c.draft_hash} RECORDING_PERMISSION_VERIFIED DNC_LISTS_CHECKED`));
  const txt = PL.renderCard(c); [c.customer_name, c.recipient, c.call_ref, c.subject, c.body, c.fathom_urls[0], 'PASSED', 'high', 'VERIFIED', 'Sensitive topic: NO', c.send_key, c.draft_hash].forEach((s) => assert.ok(txt.includes(s), s));
});
t('a card is not approvable when anything is off: failed validation, low/missing/stale confidence, sensitive, unknown sensitivity, suppressed, bad recipient; a self-declared confidence on the row is ignored', () => {
  for (const o of [{ validationStatus: 'FAILED' }, { sensitive: true }, { sensitive: undefined }, { customerEmail: 'a@acme-demo.test, b@acme-demo.test' }]) assert.strictEqual(card(rec(1, o)).approvable, false, JSON.stringify(o));
  const r = rec(1); assert.strictEqual(PL.approvalCard(Object.assign({}, r, { overall_confidence: 'high' }), { now: NOW }).approvable, false);   // no record: not approvable
  assert.strictEqual(PL.approvalCard(r, { confidenceRecords: [recordFor(r, analysis({ overall_confidence: 'low' }))], now: NOW }).approvable, false);
  assert.strictEqual(PL.approvalCard(r, { confidenceRecords: [recordFor(r)], now: '2026-12-31T00:00:00Z' }).confidence_status, 'CONFIDENCE_EXPIRED');
  assert.strictEqual(card(rec(1), { suppressed: ['person1@acme-demo.test'] }).approvable, false);
});
t('approval is bound to the card: any change to recipient, subject or body changes the hash and invalidates the approval; no bulk form exists', () => {
  const c = card(rec(1)); const ap = A.createApproval({ send_key: c.send_key, recipient: c.recipient, draft_hash: c.draft_hash, stage: 'C1', approved_by: 'Karan', approved_at: '2026-11-02T03:00:00Z', recording_permission_verified_by: 'Karan', dnc_lists_checked_by: 'Karan' }).record;
  const ctx = { authorised_stages: ['C1'], now: '2026-11-02T03:10:00Z' }; assert.strictEqual(A.checkApproval([ap], c.binding, ctx).ok, true);
  for (const o of [{ body: rec(1).body + ' ' }, { subject: rec(1).subject + '!' }, { customerEmail: 'person1b@acme-demo.test' }]) {
    const c2 = PL.approvalCard(rec(1, o)); const res = A.checkApproval([ap], c2.binding, ctx); assert.strictEqual(res.ok, false, JSON.stringify(o)); assert.ok(/^APPROVAL_(DRAFT_CHANGED|RECIPIENT_MISMATCH|REQUIRED)$/.test(res.code), res.code);
  }
  assert.strictEqual(A.createApproval([{ send_key: c.send_key }]).ok, false); assert.strictEqual(A.createApproval(undefined).ok, false);   // no list or bulk approval
  assert.ok(!Object.keys(A).concat(Object.keys(PL)).some((k) => /bulk|approveAll|autoApprove/i.test(k)));
});
t('suppression blocks a live send even with a valid approval, before any log row or send call', async () => {
  const c = card(rec(1)); const ap = A.createApproval({ send_key: c.send_key, recipient: c.recipient, draft_hash: c.draft_hash, stage: 'C1', approved_by: 'Karan', approved_at: '2026-11-02T03:00:00Z', recording_permission_verified_by: 'Karan', dnc_lists_checked_by: 'Karan' }).record;
  let sends = 0; const events = []; const deps = { now: () => '2026-11-02T03:30:00Z', log: { events: () => events, append: async (e) => { events.push(e); } }, mail: { name: 'gmail', send: async () => { sends += 1; return { id: 'x' }; } } };
  const d = { stored: true, stored_recipient: c.recipient, stored_subject: c.subject, stored_body: c.body, validation_status: 'PASSED', source_email: c.recipient, auto_send_eligible: true, sensitive_review_required: false, fingerprint: '2026-10-30|11:00|' + c.recipient, url_set_key: 'u', destination_row: 2, validated_draft_hash: c.draft_hash };
  const key = S.sendKey(d.fingerprint, d.url_set_key); const ap2 = Object.assign({}, ap, { send_key: key });
  const cfg = { active: 'gmail', gmail_adapter_enabled: true, sender_address: 'supportcore@flexifunnels.com', sender_approved: true, pilot: { c1_authorised: true } };
  const ctx = P.sendContext(cfg, { runId: 'r', delivery_mode: 'live', live_authorized: true, approvals: [ap2], now: '2026-11-02T03:10:00Z', suppressed: ['@acme-demo.test'] });
  const r = await X.sendOne(d, undefined, ctx, deps); assert.strictEqual(r.outcome, 'BLOCKED'); assert.ok(r.failed.includes('RECIPIENT_SUPPRESSED')); assert.strictEqual(sends, 0); assert.strictEqual(events.length, 0);
});
t('source guarantees: pilot.js performs no file, network or environment access and writes no allowlist', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/lib/pilot.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/require\(['"](fs|https?|net|child_process)['"]\)|process\.env|writeFile|fetch\(/.test(src));
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n += 1; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)); process.exitCode = 1; } }
  console.log(`phase4 pilot (C0 preparation): ${n}/${tests.length} test groups passed`);
})();

// D-078: low-confidence drafts enter the pool only when the user's explicit option is passed; default stays medium/high
{
  const PL = require('../../src/lib/pilot'); const CF = require('../../src/lib/confidence'); const S = require('../../src/lib/sendstate'); const N = require('../../src/lib/normalize');
  const a = { items: [{ id: 'I1', category: 'explained', confidence: 'low', evidence: ['x'], owner: 'support' }], transcript_quality: 'partly_garbled', mode: 'conservative' };
  const rec = { sourceRow: 1, customerName: 'Test', customerEmail: 'a@sample.test', callDate: '2026-11-01', callTime: '09:00', urls: ['https://fathom.video/share/x'], subject: 's', body: 'b', validationStatus: 'PASSED', processingStatus: 'DRAFT_READY', sensitive: false, transcriptHash: 'h', skillVersions: 'v' };
  const fp = N.fingerprint('2026-11-01', '09:00', 'a@sample.test'); const key = S.sendKey(fp, N.urlSetKey(rec.urls)); const dh = S.draftHash('a@sample.test', 's', 'b');
  const now = '2026-11-02T10:00:00+05:30'; const r = CF.buildRecord(a, { callRef: '1', sendKey: key, draftHash: dh, transcriptHash: 'h', skillVersions: 'v', createdAt: now });
  const base = { confidenceRecords: [r], now, inSendLog: new Set() };
  const synth = Object.assign({}, rec, { customerEmail: 'a@sample.test' });
  const off = PL.candidatePool([synth], base); const on = PL.candidatePool([synth], Object.assign({ allowLowWithReview: true }, base));
  require('assert').strictEqual(off.eligible.length, 0); require('assert').strictEqual(on.eligible.length, 1); console.log('ok - low confidence enters the pool only with the explicit option');
}
