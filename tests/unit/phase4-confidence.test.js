'use strict';
// Confidence artifact tests (D-070): derivation, record build/verify, fail-closed behaviour, privacy. Synthetic data only. No file or network access.
// Run: node tests/unit/phase4-confidence.test.js
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const CF = require('../../src/lib/confidence');

let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);
const NOW = '2026-11-02T03:00:00Z';
const item = (o) => Object.assign({ id: 'I1', category: 'completed', owner: 'customer', evidence: ['verbatim quote'], confidence: 'high' }, o || {});
const analysis = (o) => Object.assign({ overall_confidence: 'high', transcript_quality: 'clear', generation_mode: 'full', items: [item(), item({ id: 'I2' }), item({ id: 'I3', category: 'explained', owner: 'support' })], sensitive_topics: [], analysis_notes: [], injection_attempt_detected: false, skip_recommendation: { skip: false } }, o || {});
const CTX = { callRef: '15401', sendKey: 'send_aaaaaaaaaaaaaaaaaaaaaaaa', draftHash: 'dh0123456789abcdef012345', transcriptHash: 'th1', skillVersions: 'ta=1.6.0;cs=1.4.1;eg=1.6.1;ev=1.5.0', createdAt: '2026-11-02T00:00:00Z' };
const EXP = { callRef: '15401', sendKey: CTX.sendKey, draftHash: CTX.draftHash, transcriptHash: 'th1', skillVersions: CTX.skillVersions, now: NOW };
const rec = (a, c) => CF.buildRecord(a || analysis(), Object.assign({}, CTX, c || {}));
const derived = (a) => CF.deriveConfidence(a).derived;

t('how confidence is calculated: clean, fully evidenced, mostly-high analysis => high; clean but with uncertainty (few highs, uncertain owner, notes) => medium', () => {
  assert.strictEqual(derived(analysis()), 'high');
  assert.strictEqual(derived(analysis({ items: [item(), item({ id: 'I2', confidence: 'medium' }), item({ id: 'I3', confidence: 'medium' })] })), 'medium');   // 1/3 high
  assert.strictEqual(derived(analysis({ items: [item(), item({ id: 'I2', owner: 'uncertain' })] })), 'medium');
  assert.strictEqual(derived(analysis({ analysis_notes: ['short unreadable stretch'] })), 'medium');
  assert.strictEqual(derived(analysis({ overall_confidence: 'medium' })), 'medium');   // the model's declaration lowers, it never raises
});
t('evidence that weakens the result forces low: garbled transcript, non-full mode, low item, item without evidence, no items, sensitive topic, injection attempt, skip, declared low or invalid', () => {
  const cases = [[{ transcript_quality: 'partly_garbled' }, 'TRANSCRIPT_NOT_CLEAR'], [{ transcript_quality: 'substantially_garbled' }, 'TRANSCRIPT_NOT_CLEAR'], [{ generation_mode: 'conservative' }, 'GENERATION_MODE_NOT_FULL'], [{ generation_mode: 'neutral_fallback' }, 'GENERATION_MODE_NOT_FULL'],
    [{ items: [item({ confidence: 'low' })] }, 'LOW_CONFIDENCE_ITEMS'], [{ items: [item({ confidence: 'bogus' })] }, 'LOW_CONFIDENCE_ITEMS'], [{ items: [item({ evidence: [] })] }, 'ITEMS_WITHOUT_EVIDENCE'], [{ items: [item({ evidence: ['  '] })] }, 'ITEMS_WITHOUT_EVIDENCE'],
    [{ items: [item({ evidence: undefined })] }, 'ITEMS_WITHOUT_EVIDENCE'], [{ items: [] }, 'NO_ITEMS'], [{ items: undefined }, 'NO_ITEMS'], [{ sensitive_topics: ['refund'] }, 'SENSITIVE_TOPICS_PRESENT'], [{ injection_attempt_detected: true }, 'INJECTION_ATTEMPT_DETECTED'],
    [{ skip_recommendation: { skip: true } }, 'SKIP_RECOMMENDED'], [{ overall_confidence: 'low' }, 'DECLARED_LOW'], [{ overall_confidence: 'certain' }, 'DECLARED_CONFIDENCE_INVALID'], [{ overall_confidence: undefined }, 'DECLARED_CONFIDENCE_INVALID']];
  for (const [o, code] of cases) { const d = CF.deriveConfidence(analysis(o)); assert.strictEqual(d.derived, 'low', code); assert.ok(d.reasons.includes(code), code + ' got ' + d.reasons); }
  assert.strictEqual(CF.deriveConfidence(null).derived, 'low'); assert.strictEqual(CF.deriveConfidence({}).derived, 'low');
});
t('a record holds identifiers, counts and hashes only: no transcript text, quotes, names or addresses; the analysis itself is not stored', () => {
  const a = analysis({ items: [item({ evidence: ['the secret customer sentence'], description: 'Customer Jane Roe enabled it' })], customer_sentiment: 'positive', sentiment_evidence: 'thanks Jane' });
  const r = rec(a); const text = JSON.stringify(r);
  assert.ok(!/secret customer sentence|Jane|Roe|enabled it|thanks/.test(text)); assert.ok(!/@/.test(text)); assert.deepStrictEqual(Object.keys(r.evidence).sort(), ['analysis_notes_count', 'generation_mode', 'high', 'injection_attempt', 'item_count', 'items_without_evidence', 'low', 'medium', 'sensitive_topic_count', 'skip_recommended', 'transcript_quality', 'uncertain_owner']);
  assert.ok(/^[0-9a-f]{32}$/.test(r.analysis_hash) && /^[0-9a-f]{32}$/.test(r.integrity));
});
t('a valid record verifies when it matches the exact call, send key, draft hash, transcript hash and skill versions, and is fresh', () => {
  const v = CF.verifyRecord(rec(), EXP); assert.deepStrictEqual(v, { ok: true, code: null, derived: 'high' });
  assert.deepStrictEqual(CF.resolveConfidence([rec()], EXP).derived, 'high');
});
t('fail closed: every mismatch or defect gives a specific code and no confidence', () => {
  const r = rec(); const v = (rr, e) => CF.verifyRecord(rr, Object.assign({}, EXP, e || {})).code;
  assert.strictEqual(v(r, { draftHash: 'different' }), 'CONFIDENCE_DRAFT_CHANGED'); assert.strictEqual(v(r, { transcriptHash: 'th2' }), 'CONFIDENCE_TRANSCRIPT_MISMATCH'); assert.strictEqual(v(r, { transcriptHash: '' }), 'CONFIDENCE_TRANSCRIPT_MISMATCH');
  assert.strictEqual(v(r, { skillVersions: 'ta=1.7.0' }), 'CONFIDENCE_SKILL_VERSIONS_MISMATCH'); assert.strictEqual(v(r, { callRef: '15402' }), 'CONFIDENCE_CALL_MISMATCH'); assert.strictEqual(v(r, { sendKey: 'send_bbbbbbbbbbbbbbbbbbbbbbbb' }), 'CONFIDENCE_SEND_KEY_MISMATCH');
  assert.strictEqual(v(r, { now: '2026-11-17T00:00:01Z' }), 'CONFIDENCE_EXPIRED'); assert.strictEqual(v(r, { now: '2026-11-15T00:00:00Z' }), null); assert.strictEqual(v(r, { now: '2026-11-17T00:00:01Z', maxAgeDays: 30 }), null);
  assert.strictEqual(v(r, { now: '2026-11-01T00:00:00Z' }), 'CONFIDENCE_FROM_THE_FUTURE'); assert.strictEqual(v(r, { now: 'not a date' }), 'CONFIDENCE_TIME_INVALID'); assert.strictEqual(v(r, { now: undefined }), 'CONFIDENCE_TIME_INVALID');
  for (const bad of [null, undefined, {}, [], 'x', Object.assign({}, r, { schema: 'ConfidenceRecord/0' }), Object.assign({}, r, { send_key: '' }), Object.assign({}, r, { evidence: null }), Object.assign({}, r, { integrity: undefined })]) assert.strictEqual(CF.verifyRecord(bad, EXP).ok, false);
});
t('tampering is detected: editing the level, the evidence counts, the identifiers or the timestamp breaks integrity; a re-sealed forged level is caught by re-derivation', () => {
  const r = rec(analysis({ overall_confidence: 'low' })); assert.strictEqual(r.derived, 'low');
  assert.strictEqual(CF.verifyRecord(Object.assign({}, r, { derived: 'high' }), EXP).code, 'CONFIDENCE_INTEGRITY_FAILED');
  assert.strictEqual(CF.verifyRecord(Object.assign({}, rec(), { evidence: Object.assign({}, rec().evidence, { low: 3 }) }), EXP).code, 'CONFIDENCE_INTEGRITY_FAILED');
  assert.strictEqual(CF.verifyRecord(Object.assign({}, rec(), { created_at: '2026-11-02T02:00:00Z' }), EXP).code, 'CONFIDENCE_INTEGRITY_FAILED');
  // forged but re-sealed: claim high on evidence that derives low (recompute the seal the same way the module does)
  const forged = Object.assign({}, r, { derived: 'high', computed: 'high' }); const sealed = CF.buildRecord(analysis(), CTX); forged.integrity = undefined;
  assert.notStrictEqual(CF.verifyRecord(Object.assign({}, forged, { integrity: sealed.integrity }), EXP).ok, true);
  const lowRec = rec(analysis({ items: [item({ confidence: 'low' })] })); const lifted = Object.assign({}, lowRec, { derived: 'medium' }); assert.strictEqual(CF.verifyRecord(lifted, EXP).ok, false);
});
t('conflicts and missing records: none => NOT_AVAILABLE; a good record next to a stale one still resolves; two valid records that disagree => CONFLICT; other calls\' records are ignored', () => {
  assert.strictEqual(CF.resolveConfidence([], EXP).code, 'CONFIDENCE_NOT_AVAILABLE'); assert.strictEqual(CF.resolveConfidence(undefined, EXP).code, 'CONFIDENCE_NOT_AVAILABLE'); assert.strictEqual(CF.resolveConfidence('x', EXP).code, 'CONFIDENCE_NOT_AVAILABLE');
  const good = rec(); const stale = rec(undefined, { draftHash: 'old-draft-hash-000000000000' }); assert.strictEqual(CF.resolveConfidence([stale, good], EXP).derived, 'high');
  assert.strictEqual(CF.resolveConfidence([stale], EXP).code, 'CONFIDENCE_DRAFT_CHANGED');
  const medium = rec(analysis({ overall_confidence: 'medium' }), { createdAt: '2026-11-02T01:00:00Z' }); assert.strictEqual(CF.resolveConfidence([good, medium], EXP).code, 'CONFIDENCE_CONFLICT');
  assert.strictEqual(CF.resolveConfidence([rec(undefined, { sendKey: 'send_bbbbbbbbbbbbbbbbbbbbbbbb' })], EXP).code, 'CONFIDENCE_NOT_AVAILABLE');
  assert.deepStrictEqual(CF.parseRecords('not json'), []); assert.deepStrictEqual(CF.parseRecords('{"a":1}'), []); assert.strictEqual(CF.parseRecords(JSON.stringify([good])).length, 1);
});
t('the module is pure: no file, network or environment access', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/lib/confidence.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/require\(['"](fs|https?|net|child_process)['"]\)|process\.env|writeFile|fetch\(/.test(src));
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n += 1; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)); process.exitCode = 1; } }
  console.log(`phase4 confidence: ${n}/${tests.length} test groups passed`);
})();
