'use strict';
// Scores the outputs of the focused Phase 3 tests (D-044): files written by worker and validator sessions into OUT_DIR
// ({case}.analysis.json, .summary.json, .email.json, .validation.json) against tests/fixtures/p3/expected.json (written before
// the runs) plus the deterministic email checks. Synthetic data only. Usage: P3_OUT=<dir> node tests/unit/run-p3-focused.js
const fs = require('fs'); const path = require('path');
const c = require('./checks.js'); const P = require('../../src/lib/policy');
const ROOT = path.resolve(__dirname, '..', '..'); const OUT = process.env.P3_OUT;
if (!OUT) { console.error('set P3_OUT'); process.exit(2); }
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const exp = rd(path.join(ROOT, 'tests', 'fixtures', 'p3', 'expected.json'));
const policy = c.loadPolicy(); const rows = []; let fails = 0;
for (const id of Object.keys(exp).filter((k) => !k.startsWith('_'))) {
  const e = exp[id]; const f = []; const get = (s) => { const p = path.join(OUT, `${id}.${s}.json`); return fs.existsSync(p) ? rd(p) : null; };
  let meta;
  if (id === 'P2-10') { meta = rd(path.join(ROOT, 'tests', 'fixtures', 'P2-10', 'metadata.json')); }
  else { const m = rd(path.join(ROOT, 'tests', 'fixtures', 'p3', id, 'metadata.json')); meta = { 'Recording URL': m.fathom_urls.join(' '), 'Customer Name': m.greeting_name + ' Sample', 'Call lead by(who took the call)': m.support_agent_first_name }; }
  const analysis = get('analysis'); const email = get('email'); const val = get('validation');
  if (!analysis) f.push('analysis file missing');
  const review = analysis ? P.reviewDecision(analysis) : null;
  if (e.expect_review) {
    if (!review || review.reason !== e.expect_review || review.processing !== 'REVIEW_REQUIRED') f.push('expected REVIEW_REQUIRED ' + e.expect_review + ', got ' + JSON.stringify(review));
    if (email) f.push('an email was written although review is required');
  } else {
    if (review && review.processing) f.push('analysis led to ' + review.processing + '/' + review.reason + ' instead of an email');
    if (!email) f.push('email file missing');
    else {
      if (e.modes && !e.modes.includes(email.mode)) f.push('mode ' + email.mode + ' not in ' + e.modes.join('/'));
      const det = c.deterministicChecks({ email: { subject: email.subject, body_text: email.body_text, length_status: email.length_status, mode: email.mode, referenced_item_ids: email.referenced_item_ids || [], word_count_excluding_signature: email.word_count_excluding_signature }, meta, analysis, policy });
      det.issues.filter((i) => !['LENGTH_REVIEW_REQUIRED'].includes(i.code)).forEach((i) => f.push('deterministic ' + i.code + (i.detail ? ': ' + String(i.detail).slice(0, 80) : '')));
      const text = (email.subject || '') + '\n' + (email.body_text || '');
      (e.email_must_include || []).forEach((p) => { if (!new RegExp(p, 'i').test(text)) f.push('must include: ' + p); });
      (e.email_must_not_include || []).forEach((p) => { if (new RegExp(p, 'i').test(text)) f.push('must not include: ' + p); });
      if (e.email_words) { const w = det.wordCount; if (w < e.email_words[0] || w > e.email_words[1]) f.push('words ' + w + ' outside ' + e.email_words.join('-')); }
      if (!val) f.push('validation file missing'); else { if (val.outcome !== 'PASS') f.push('validator ' + val.outcome + ' ' + (val.issues || []).map((i) => i.code).join(',')); if (val.email_class === 'unsafe') f.push('email_class unsafe'); }
    }
    const a = e.analysis || {}; const items = (analysis && analysis.items) || [];
    const done = items.filter((i) => i.category === 'completed');
    if (a.completed_owner) { const bad = done.filter((i) => i.owner !== a.completed_owner); if (bad.length) f.push('completed items with owner other than ' + a.completed_owner + ': ' + bad.map((i) => i.id + '=' + i.owner).join(',')); }
    if (a.completed_owner_in) { const bad = done.filter((i) => !a.completed_owner_in.includes(i.owner)); if (bad.length) f.push('completed owner not in ' + a.completed_owner_in.join('/') + ': ' + bad.map((i) => i.id + '=' + i.owner).join(',')); }
    if (a.min_completed != null && done.length < a.min_completed) f.push('completed items ' + done.length + ' < ' + a.min_completed);
    if (a.max_completed != null && done.length > a.max_completed) f.push('completed items ' + done.length + ' > ' + a.max_completed);
    if (a.max_pending != null && items.filter((i) => /^pending_/.test(i.category)).length > a.max_pending) f.push('pending items present');
    if (a.pending_customer_with_relative_timeline && !items.some((i) => i.category === 'pending_customer_action' && i.timeline_reference === 'call_relative')) f.push('no pending customer item with a call-relative timeline');
    if (analysis && analysis.skip_recommendation && analysis.skip_recommendation.skip === true) f.push('analysis recommended skip: ' + analysis.skip_recommendation.reason_code);
  }
  rows.push(`${f.length ? 'FAIL' : 'PASS'}  ${id}${f.length ? '  ' + f.join(' | ') : ''}`); fails += f.length ? 1 : 0;
}
console.log(rows.join('\n')); console.log(`\n${rows.length - fails}/${rows.length} cases pass`); process.exit(fails ? 1 : 0);