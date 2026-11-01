'use strict';
// Unit tests for the Phase 3 helpers in src/ (OD-38, D-039). Synthetic data only: obviously fake names, @example.com
// addresses, EXAMPLE tokens. No spreadsheet, no network. Run: node tests/unit/phase3.test.js
const assert = require('assert');
const N = require('../../src/lib/normalize');
const E = require('../../src/lib/eligibility');
const D = require('../../src/lib/destination');
const P = require('../../src/lib/policy');

let n = 0;
const t = (name, fn) => { fn(); n += 1; };
const U = (x) => `https://fathom.video/share/EXAMPLE${x}`;

t('date normalisation', () => {
  assert.strictEqual(N.normalizeDate('October 31, 2026'), '2026-10-31');
  assert.strictEqual(N.normalizeDate('  October 14 , 2022 '), '2022-10-14');
  assert.strictEqual(N.normalizeDate('Oct 5, 2026'), '2026-10-05');
  assert.strictEqual(N.normalizeDate('2026-10-31'), '2026-10-31');
  assert.strictEqual(N.normalizeDate('February 30, 2026'), null);
  assert.strictEqual(N.normalizeDate(''), null);
  assert.strictEqual(N.normalizeDate('31/10/2026'), null);
});
t('time normalisation', () => {
  assert.strictEqual(N.normalizeTime('06:00 PM'), '18:00');
  assert.strictEqual(N.normalizeTime('8:30 AM'), '08:30');
  assert.strictEqual(N.normalizeTime('12:00 AM'), '00:00');
  assert.strictEqual(N.normalizeTime('12:15 PM'), '12:15');
  assert.strictEqual(N.normalizeTime('11:00 PM'), '23:00');
  assert.strictEqual(N.normalizeTime('19:05'), '19:05');
  assert.strictEqual(N.normalizeTime('13:00 PM'), null);
  assert.strictEqual(N.normalizeTime(''), null);
  assert.strictEqual(N.normalizeTime('evening'), null);
});
t('email normalisation', () => {
  assert.deepStrictEqual(N.normalizeEmail('  Test.User@Example.COM '), { value: 'test.user@example.com', valid: true, reason: null });
  assert.strictEqual(N.normalizeEmail('').reason, 'MISSING_CUSTOMER_EMAIL');
  assert.strictEqual(N.normalizeEmail('a@example.com, b@example.com').reason, 'INVALID_CUSTOMER_EMAIL');
});
t('recording URLs (D-025)', () => {
  const r = N.parseRecordingUrls(` ${U('A')}\n${U('B')}/ ${U('A')} `);
  assert.deepStrictEqual(r.urls, [U('A'), U('B')]); assert.strictEqual(r.duplicatesRemoved, 1);
  assert.deepStrictEqual(N.parseRecordingUrls(`${U('A')} https://example.com/x`).invalidPositions, [2]);
  assert.strictEqual(N.parseRecordingUrls('   ').empty, true);
  assert.strictEqual(N.urlSetKey([U('B'), U('A')]), N.urlSetKey([U('A'), U('B')]));
});
t('fingerprint', () => {
  assert.strictEqual(N.fingerprint('2026-10-31', '18:00', 'a@example.com'), '2026-10-31|18:00|a@example.com');
  assert.strictEqual(N.fingerprint('2026-10-31', null, 'a@example.com'), null);
});
t('Asia/Kolkata dates', () => {
  assert.strictEqual(N.kolkataDate(new Date('2026-10-31T19:00:00Z')), '2026-11-01'); // 00:30 IST next day
  assert.strictEqual(N.kolkataDate(new Date('2026-11-01T03:30:00Z')), '2026-11-01');
  assert.strictEqual(N.kolkataIso(new Date('2026-11-01T03:30:00Z')), '2026-11-01T09:00:00+05:30');
  assert.strictEqual(N.addDays('2026-03-01', -1), '2026-02-28');
  assert.strictEqual(N.daysBetween('2026-10-31', '2026-11-02'), 2);
});
t('sha256 is stable and UTF-8', () => {
  assert.strictEqual(N.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notStrictEqual(N.sha256('a–b'), N.sha256('a-b'));
});

const ctx = { targetDate: '2026-10-31', runDate: '2026-11-01', lookbackDays: 0, maxFollowupAgeDays: 7, fathomShareabilityConfirmed: true, deliveryMode: 'dry_run' };
const rec = (o) => Object.assign({ callDate: 'October 31, 2026', callTime: '7:00 PM', customerName: 'Test One', email: 'one@example.com', recordingUrl: U('1'), recordingSent: 'No', meetingNotes: '' }, o);
t('eligibility', () => {
  assert.strictEqual(E.prelim(rec(), ctx).outcome, 'ELIGIBLE_PRELIM');
  assert.strictEqual(E.prelim(rec({ callDate: 'October 29, 2026' }), ctx).outcome, 'OUT_OF_WINDOW');
  assert.strictEqual(E.prelim(rec({ callDate: '' }), ctx).reason_code, 'MISSING_CALL_DATETIME');
  assert.strictEqual(E.prelim(rec({ callTime: '' }), ctx).reason_code, 'MISSING_CALL_DATETIME');
  assert.strictEqual(E.prelim(rec({ meetingNotes: 'Call cancel' }), ctx).reason_code, 'CALL_CANCELLED');
  assert.strictEqual(E.prelim(rec({ meetingNotes: 'customer not came' }), ctx).reason_code, 'CUSTOMER_NO_SHOW');
  assert.strictEqual(E.prelim(rec({ recordingSent: 'Yes' }), ctx).reason_code, 'RECORDING_ALREADY_SENT');
  assert.strictEqual(E.prelim(rec({ recordingSent: 'sent?' }), ctx).reason_code, 'RECORDING_SENT_STATUS_UNCLEAR');
  assert.strictEqual(E.prelim(rec({ recordingSent: '' }), ctx).outcome, 'ELIGIBLE_PRELIM');
  assert.strictEqual(E.prelim(rec({ customerName: ' ' }), ctx).reason_code, 'MISSING_CUSTOMER_NAME');
  assert.strictEqual(E.prelim(rec({ email: '' }), ctx).reason_code, 'MISSING_CUSTOMER_EMAIL');
  assert.strictEqual(E.prelim(rec({ email: 'nope' }), ctx).reason_code, 'INVALID_CUSTOMER_EMAIL');
  assert.strictEqual(E.prelim(rec({ recordingUrl: '' }), ctx).reason_code, 'MISSING_FATHOM_URL');
  assert.strictEqual(E.prelim(rec({ recordingUrl: `${U('1')} http://bad` }), ctx).reason_code, 'INVALID_FATHOM_URL');
  assert.strictEqual(E.prelim(rec(), Object.assign({}, ctx, { fathomShareabilityConfirmed: false })).reason_code, 'FATHOM_NOT_SHAREABLE');
  assert.strictEqual(E.prelim(rec(), Object.assign({}, ctx, { runDate: '2026-11-20' })).reason_code, 'CALL_TOO_OLD');
  const multi = E.prelim(rec({ recordingUrl: `${U('1')}\n${U('2')}` }), ctx);
  assert.deepStrictEqual(multi.urls, [U('1'), U('2')]);
  assert.strictEqual(multi.fingerprint, '2026-10-31|19:00|one@example.com');
});
t('transcript checks', () => {
  assert.strictEqual(E.transcriptCheck('', { minChars: 600 }).reason_code, 'MISSING_TRANSCRIPT');
  assert.strictEqual(E.transcriptCheck('short', { minChars: 600 }).reason_code, 'TRANSCRIPT_TOO_SHORT');
  assert.strictEqual(E.transcriptCheck('x'.repeat(50000), { minChars: 600 }).reason_code, 'TRANSCRIPT_POSSIBLY_TRUNCATED');
  const ok = E.transcriptCheck('x'.repeat(700), { minChars: 600 });
  assert.strictEqual(ok.outcome, 'ELIGIBLE'); assert.strictEqual(ok.transcriptHash.length, 64);
});

const base = { callDate: '2026-10-31', callTime: '19:00', customerName: 'Test One', customerEmail: 'one@example.com', supportAgent: 'Agent A', urls: [U('1')], runId: 'r1', skillVersions: 'ta=1.4.0', lastUpdatedAt: '2026-11-01T09:00:00+05:30', sourceRow: 1 };
t('storage rules', () => {
  const ok = D.buildRow(Object.assign({}, base, { emailSubject: 'S – x', emailBody: 'Hi\nBody', wordCount: 2, validationStatus: 'PASSED', processingStatus: 'DRAFT_READY', draftCreatedAt: '2026-11-01T09:00:00+05:30' }));
  assert.strictEqual(ok.length, 21); assert.strictEqual(ok[7], 'S – x'); assert.strictEqual(ok[6], '1');
  assert.throws(() => D.buildRow(Object.assign({}, base, { emailBody: 'x', emailSubject: 'y', validationStatus: 'FAILED', processingStatus: 'FAILED' })));
  assert.throws(() => D.buildRow(Object.assign({}, base, { validationStatus: 'REVIEW_REQUIRED', processingStatus: 'DRAFT_READY', emailBody: 'x', emailSubject: 'y' })));
  assert.throws(() => D.buildRow(Object.assign({}, base, { validationStatus: 'PASSED', processingStatus: 'REVIEW_REQUIRED' })));
  assert.throws(() => D.buildRow(Object.assign({}, base, { validationStatus: 'REVIEW_REQUIRED', processingStatus: 'REVIEW_REQUIRED', reasonCode: 'SENSITIVE_TOPIC_REQUIRES_HUMAN', emailBody: 'x', emailSubject: 'y' })));
  const lr = D.buildRow(Object.assign({}, base, { validationStatus: 'REVIEW_REQUIRED', processingStatus: 'REVIEW_REQUIRED', reasonCode: 'LENGTH_REVIEW_REQUIRED', emailBody: 'x', emailSubject: 'y', wordCount: 400 }));
  assert.strictEqual(lr[8], 'x');
  const sk = D.buildRow(Object.assign({}, base, { validationStatus: 'NOT_RUN', processingStatus: 'DEFERRED', reasonCode: 'MISSING_TRANSCRIPT' }));
  assert.strictEqual(sk[8], ''); assert.strictEqual(D.buildRow(Object.assign({}, base, { customerName: '=SUM(1)', validationStatus: 'NOT_RUN', processingStatus: 'SKIPPED' }))[2], "'=SUM(1)");
});
t('header check', () => {
  assert.strictEqual(D.checkHeaders(D.HEADERS).ok, true);
  assert.strictEqual(D.checkHeaders([]).ok, false);
  const swapped = D.HEADERS.slice(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.strictEqual(D.checkHeaders(swapped).diffs.length, 2);
  assert.strictEqual(D.checkHeaders(D.HEADERS.concat(['extra'])).ok, false);
  assert.strictEqual(D.HEADERS[20], 'Source Row (reference only)'); assert.strictEqual(D.HEADERS.length, 21);
});

// ---- idempotency and collision planning ----
const drow = (o) => D.buildRow(Object.assign({}, base, o));
const sheet = (...rows) => [D.HEADERS, ...rows];
const src = (key, time, urls, email) => ({ key, fingerprint: N.fingerprint('2026-10-31', time, email || 'one@example.com'), urlKey: N.urlSetKey(urls) });
const draft = (time, urls, extra) => drow(Object.assign({ callTime: time, urls, emailSubject: 's', emailBody: 'b', wordCount: 5, validationStatus: 'PASSED', processingStatus: 'DRAFT_READY' }, extra));
const flagged = (time, urls, notes) => drow({ callTime: time, urls, validationStatus: 'NOT_RUN', processingStatus: 'REVIEW_REQUIRED', reasonCode: 'FINGERPRINT_COLLISION', notes });
const act = (plans, key) => plans.find((p) => p.key === key).action;

t('plan: new, already processed, separate calls', () => {
  const p = D.plan([src('a', '19:00', [U('1')]), src('b', '20:00', [U('2')])], D.parseDestination(sheet(draft('19:00', [U('1')]))));
  assert.strictEqual(act(p, 'a'), 'NOOP_ALREADY_PROCESSED'); assert.strictEqual(act(p, 'b'), 'PROCESS_NEW');
  assert.strictEqual(D.plan([src('a', '19:00', [U('1')])], D.parseDestination([D.HEADERS])).length, 1);
});
t('plan: deferred and failed rows update in place and keep history', () => {
  const d = drow({ validationStatus: 'NOT_RUN', processingStatus: 'DEFERRED', reasonCode: 'MISSING_TRANSCRIPT' });
  const p = D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(d)));
  assert.strictEqual(p[0].action, 'PROCESS_UPDATE'); assert.strictEqual(p[0].rowNumber, 2); assert.ok(p[0].history.startsWith('previous: DEFERRED/MISSING_TRANSCRIPT'));
  const t2 = D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(drow({ validationStatus: 'NOT_RUN', processingStatus: 'SKIPPED', reasonCode: 'CALL_CANCELLED' }))));
  assert.strictEqual(t2[0].action, 'NOOP_TERMINAL');
});
t('plan: URL set differs from a stored draft is a collision, never an overwrite', () => {
  const p = D.plan([src('a', '19:00', [U('9')])], D.parseDestination(sheet(draft('19:00', [U('1')]))));
  assert.strictEqual(p[0].action, 'FLAG_COLLISION_APPEND');
});
t('plan: source collision is flagged once and then recognised', () => {
  const group = [src('a', '19:00', [U('1')]), src('b', '19:00', [U('2')])];
  assert.deepStrictEqual(D.plan(group, D.parseDestination([D.HEADERS])).map((x) => x.action), ['FLAG_COLLISION_APPEND', 'FLAG_COLLISION_APPEND']);
  const rows = sheet(flagged('19:00', [U('1')], 'x'), flagged('19:00', [U('2')], 'x'));
  assert.deepStrictEqual(D.plan(group, D.parseDestination(rows)).map((x) => x.action), ['NOOP_COLLISION_ROW_EXISTS', 'NOOP_COLLISION_ROW_EXISTS']);
  const same = [src('a', '19:00', [U('1')]), src('b', '19:00', [U('1')])];
  const sameRows = sheet(flagged('19:00', [U('1')], 'x'), flagged('19:00', [U('1')], 'x'));
  assert.deepStrictEqual(D.plan(same, D.parseDestination(sameRows)).map((x) => x.action), ['NOOP_COLLISION_ROW_EXISTS', 'NOOP_COLLISION_ROW_EXISTS']);
  assert.deepStrictEqual(D.plan(same, D.parseDestination([D.HEADERS])).map((x) => x.action), ['FLAG_COLLISION_APPEND', 'FLAG_COLLISION_APPEND']);
});
t('plan: a collision group that grew or cannot be told apart is reported, not expanded', () => {
  const grew = [src('a', '19:00', [U('1')]), src('b', '19:00', [U('2')]), src('c', '19:00', [U('3')])];
  const rows = sheet(flagged('19:00', [U('1')], 'x'), flagged('19:00', [U('2')], 'x'));
  const p = D.plan(grew, D.parseDestination(rows));
  assert.strictEqual(act(p, 'c'), 'FLAG_COLLISION_APPEND'); // one new, distinguishable record: the single allowed append
  const noUrls = [src('a', '19:00', []), src('b', '19:00', []), src('c', '19:00', [])];
  const rows2 = sheet(flagged('19:00', [], 'x'), flagged('19:00', [], 'x'));
  assert.ok(D.plan(noUrls, D.parseDestination(rows2)).every((x) => x.action === 'REPORT_ONLY'));
});
t('plan: resolution markers (OD-46 proposal)', () => {
  const sep = D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(flagged('19:00', [U('1')], 'RESOLVED: SEPARATE by lead'))));
  assert.strictEqual(sep[0].action, 'PROCESS_UPDATE');
  const dup = D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(flagged('19:00', [U('1')], 'RESOLVED: DUPLICATE'))));
  assert.strictEqual(dup[0].action, 'RESOLVED_DUPLICATE');
  const open = D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(flagged('19:00', [U('1')], 'x'))));
  assert.strictEqual(open[0].action, 'NOOP_COLLISION_ROW_EXISTS');
});
t('plan: a review-required row without a draft is left for the human, not reprocessed', () => {
  const r = drow({ validationStatus: 'NOT_RUN', processingStatus: 'REVIEW_REQUIRED', reasonCode: 'SENSITIVE_TOPIC_REQUIRES_HUMAN' });
  assert.strictEqual(D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(r)))[0].action, 'NOOP_REVIEW_PENDING');
});
t('plan: ambiguous association is reported', () => {
  const two = sheet(draft('19:00', [U('1')]), draft('19:00', [U('1')]));
  assert.strictEqual(D.plan([src('a', '19:00', [U('1')])], D.parseDestination(two))[0].action, 'REPORT_ONLY');
});
t('review policy (OD-11, D-044 coverage first)', () => {
  assert.strictEqual(P.reviewDecision({ sensitive_topics: ['refund'] }).reason, 'SENSITIVE_TOPIC_REQUIRES_HUMAN');
  assert.strictEqual(P.reviewDecision({ sensitive_topics: ['refund'] }).processing, 'REVIEW_REQUIRED');
  // ownership uncertainty no longer blocks; quality-based skips are superseded by a neutral fallback
  const own = P.reviewDecision({ sensitive_topics: [], ownership_review_required: true, generation_mode: 'conservative' });
  assert.strictEqual(own.processing, null); assert.strictEqual(own.mode, 'conservative');
  const low = P.reviewDecision({ sensitive_topics: [], skip_recommendation: { skip: true, reason_code: 'ANALYSIS_LOW_CONFIDENCE' } });
  assert.strictEqual(low.processing, null); assert.strictEqual(low.mode, 'neutral_fallback');
  const inc = P.reviewDecision({ sensitive_topics: [], skip_recommendation: { skip: true, reason_code: 'TRANSCRIPT_INCOMPLETE' } });
  assert.strictEqual(inc.processing, null); assert.strictEqual(inc.mode, 'neutral_fallback');
  // genuine skips stay skips
  assert.strictEqual(P.reviewDecision({ sensitive_topics: [], skip_recommendation: { skip: true, reason_code: 'CUSTOMER_NO_SHOW' } }).processing, 'SKIPPED');
  assert.strictEqual(P.reviewDecision({ sensitive_topics: [], skip_recommendation: { skip: true, reason_code: 'INSUFFICIENT_CONTENT' } }).processing, 'SKIPPED');
  assert.strictEqual(P.reviewDecision({ sensitive_topics: [], skip_recommendation: { skip: true, reason_code: 'NOT_A_SUPPORT_CALL' } }).processing, 'SKIPPED');
  // mode selection
  assert.strictEqual(P.reviewDecision({ sensitive_topics: [], generation_mode: 'full', skip_recommendation: { skip: false } }).mode, 'full');
  assert.strictEqual(P.reviewDecision({ sensitive_topics: [], transcript_quality: 'substantially_garbled', skip_recommendation: { skip: false } }).mode, 'neutral_fallback');
  assert.strictEqual(P.reviewDecision({ sensitive_topics: [], transcript_quality: 'partly_garbled', skip_recommendation: { skip: false } }).mode, 'conservative');
  assert.strictEqual(P.reviewDecision(null).processing, 'FAILED');
});
t('short transcripts are not rejected by length (floor only)', () => {
  assert.strictEqual(E.transcriptCheck('Support: Hi. Customer: my coupon failed. Support: I enabled it, try now. Customer: works, thanks.', { minChars: 40 }).outcome, 'ELIGIBLE');
  assert.strictEqual(E.transcriptCheck('ok', { minChars: 40 }).reason_code, 'TRANSCRIPT_TOO_SHORT');
});
t('plan: rows stored under the retired quality skip are superseded in place', () => {
  const sk = drow({ validationStatus: 'NOT_RUN', processingStatus: 'SKIPPED', reasonCode: 'ANALYSIS_LOW_CONFIDENCE' });
  const p1 = D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(sk)));
  assert.strictEqual(p1[0].action, 'PROCESS_UPDATE'); assert.ok(p1[0].history.startsWith('previous: SKIPPED/ANALYSIS_LOW_CONFIDENCE'));
  const rv = drow({ validationStatus: 'NOT_RUN', processingStatus: 'REVIEW_REQUIRED', reasonCode: 'ANALYSIS_LOW_CONFIDENCE' });
  assert.strictEqual(D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(rv)))[0].action, 'PROCESS_UPDATE');
  const sens = drow({ validationStatus: 'NOT_RUN', processingStatus: 'REVIEW_REQUIRED', reasonCode: 'SENSITIVE_TOPIC_REQUIRES_HUMAN' });
  assert.strictEqual(D.plan([src('a', '19:00', [U('1')])], D.parseDestination(sheet(sens)))[0].action, 'NOOP_REVIEW_PENDING');
});
t('exact transcript extraction from a recorded connector result (D-043)', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path'); const T = require('../../src/lib/transcript');
  const cell = 'Support: namaste \u2013 aapka domain connect karte hain.\nCustomer: ji, \u0939\u093e\u0901 \u2013 done.'; // Devanagari, en dash, newline
  const result = JSON.stringify({ range: "'Calls DONE'!AB99999", values: [[cell]] });
  const other = JSON.stringify({ range: "'Calls DONE'!AB88888", values: [['other']] });
  const lines = [{ message: { content: [{ type: 'tool_result', content: other }] } }, { message: { content: [{ type: 'tool_result', content: result }] } }, { message: { content: [{ type: 'text', text: 'x' }] } }].map((o) => JSON.stringify(o)).join('\n');
  const f = path.join(os.tmpdir(), 'p3-extract-test.jsonl'); fs.writeFileSync(f, lines, 'utf8');
  const r = T.extractCell(f, 99999);
  assert.strictEqual(r.found, true); assert.strictEqual(r.text, cell); assert.strictEqual(T.transcriptHash(r.text), N.sha256(cell));
  assert.strictEqual(T.extractCell(f, 12345).found, false);
  const empty = path.join(os.tmpdir(), 'p3-extract-test2.jsonl'); fs.writeFileSync(empty, JSON.stringify({ message: { content: [{ type: 'tool_result', content: JSON.stringify({ range: "'Calls DONE'!AB77777" }) }] } }), 'utf8');
  const e = T.extractCell(empty, 77777); assert.strictEqual(e.found, true); assert.strictEqual(e.text, '');
  fs.unlinkSync(f); fs.unlinkSync(empty);
});
console.log(`phase3 helpers: ${n} test groups passed`);
