'use strict';
// Runs the Phase 2 harness over tests/fixtures/P2-* and tests/fixtures/adversarial/*.json against the stage outputs stored in
// tests/results/phase2/. Usage: node tests/unit/run-phase2.js   (exit code 1 if any case fails)
const fs = require('fs');
const path = require('path');
const c = require('./checks');

const FIX = path.join(c.ROOT, 'tests', 'fixtures');
// PHASE2_RESULTS=<folder under tests/results> selects another result set (e.g. phase2-proposed, the S-11 patch experiment);
// PHASE2_CASES=P2-01,P2-06 limits the cases; PHASE2_OWNER_RULE=performer applies the proposed owner rule for completed items.
const RES = path.join(c.ROOT, 'tests', 'results', process.env.PHASE2_RESULTS || 'phase2');
const ONLY = process.env.PHASE2_CASES ? process.env.PHASE2_CASES.split(',') : null;
// PHASE2_OWNER_RULE=legacy re-checks the ORIGINAL Phase 2 results (skills 1.2.0, owner of completed = support).
// PHASE2_ADV_BASE=<folder under tests/results> supplies the analysis/summary the adversarial drafts are judged against.
const LEGACY = process.env.PHASE2_OWNER_RULE === 'legacy';
const ADV_BASE = path.join(c.ROOT, 'tests', 'results', process.env.PHASE2_ADV_BASE || process.env.PHASE2_RESULTS || 'phase2');
const truth = c.readJson(path.join(FIX, 'ownership-truth.json'));
const policy = c.loadPolicy();
const exists = (p) => fs.existsSync(p);
const results = [];
const truthAudit = c.auditTruth(truth, FIX);
if (truthAudit.length) { console.log('OWNERSHIP TRUTH AUDIT FAILED:'); truthAudit.forEach((m) => console.log('   - ' + m)); } else { console.log('ownership-truth audit: every evidence line is verbatim in its transcript'); }

function semanticIssues(v) { return v && Array.isArray(v.issues) ? v.issues.map((i) => ({ code: i.code, detail: i.email_excerpt || i.explanation })) : []; }

const ADDED_AFTER_FIRST_RUN = ['P2-12', 'P2-13'];   // S-11 coverage fixtures: no results exist in the original run
const cases = fs.readdirSync(FIX).filter((d) => /^P2-\d+$/.test(d) && (!ONLY || ONLY.includes(d)) && !(LEGACY && ADDED_AFTER_FIRST_RUN.includes(d))).sort();
for (const id of cases) {
  const dir = path.join(FIX, id);
  const meta = c.readJson(path.join(dir, 'metadata.json'));
  const transcript = c.readText(path.join(dir, 'transcript.txt'));
  const histExp = path.join(FIX, '_history', '2026-10-31-before-ownership-update', id + '.expected.json');
  const exp = c.readJson(LEGACY && exists(histExp) ? histExp : path.join(dir, 'expected.json'));   // legacy = original results vs original expectations
  const out = path.join(RES, id);
  const r = { case: id, scenario: exp.scenario, checks: [], failures: [] };
  const fail = (m) => r.failures.push(m);

  // 1. eligibility
  const el = c.eligibility(meta, transcript);
  if (el.outcome !== exp.eligibility.outcome || el.reason_code !== exp.eligibility.reason_code) fail(`eligibility ${el.outcome}/${el.reason_code}, expected ${exp.eligibility.outcome}/${exp.eligibility.reason_code}`);
  r.eligibility = el;

  if (exp.analysis.run === false) { r.status = r.failures.length ? 'FAIL' : 'PASS'; r.note = 'stopped at eligibility; no skill run'; results.push(r); continue; }

  // 2. analysis
  const ap = path.join(out, 'analysis.json');
  if (!exists(ap)) { fail('analysis.json missing'); r.status = 'FAIL'; results.push(r); continue; }
  const analysis = c.readJson(ap);
  c.analysisChecks(analysis, transcript).forEach((m) => fail('analysis: ' + m));
  const cmp = c.compareAnalysis(analysis, exp);
  cmp.forEach((m) => fail('analysis vs expected: ' + m));
  r.conflicts = cmp.conflicts || [];
  if (!LEGACY) c.ownershipTruthChecks(id, analysis, truth).forEach((m) => fail(m));
  r.analysis = { skip: analysis.skip_recommendation.skip, reason: analysis.skip_recommendation.reason_code, items: (analysis.items || []).length };

  const mustSkip = exp.email.generated === false || (exp.email.generated === 'either' && analysis.skip_recommendation.skip);
  if (mustSkip) {
    if (exists(path.join(out, 'email.json'))) fail('email generated for a case that must be skipped');
    r.status = r.failures.length ? 'FAIL' : 'PASS';
    r.note = 'skipped as expected (' + analysis.skip_recommendation.reason_code + ')';
    results.push(r); continue;
  }

  // 3. summary, email, validation
  const sp = path.join(out, 'summary.json'); const ep = path.join(out, 'email.json'); const vp = path.join(out, 'validation.json');
  [sp, ep, vp].forEach((p) => { if (!exists(p)) fail(path.basename(p) + ' missing'); });
  if (!exists(sp) || !exists(ep) || !exists(vp)) { r.status = 'FAIL'; results.push(r); continue; }
  const summary = c.readJson(sp); const email = c.readJson(ep); const val = c.readJson(vp);
  c.summaryChecks(analysis, summary).forEach((m) => fail('summary: ' + m));
  if (!LEGACY) {
    const g = c.summaryGroundingChecks(analysis, summary, transcript);
    g.f.forEach((m) => fail('summary grounding: ' + m));
    r.ungrounded_terms_warning = g.warn;
  }
  const det = c.deterministicChecks({ email, meta, analysis, policy });
  det.issues.forEach((i) => fail(`deterministic ${i.code}: ${i.detail}`));
  const rep = (email.body_text.match(/\b([A-Za-z]{2,}) \1\b/gi) || []);
  if (rep.length) r.readability_warning = 'repeated word(s) in email: ' + rep.join('; ');   // warning only, not in validation-rules section 2
  if (det.claimedWordCount !== det.wordCount) r.note = `word count claimed ${det.claimedWordCount}, counted ${det.wordCount}`;
  c.compareEmail(email, JSON.stringify(analysis) + JSON.stringify(summary), exp).forEach((m) => fail('email vs expected: ' + m));
  const sem = semanticIssues(val);
  sem.forEach((i) => fail(`semantic ${i.code}: ${i.detail}`));
  const finalOutcome = det.issues.length || sem.length || val.outcome !== 'PASS' ? 'FAIL' : 'PASS';
  const wantOutcome = exp.validation_expected === 'PASS_IF_GENERATED' ? 'PASS' : exp.validation_expected;
  if (finalOutcome !== wantOutcome) fail(`validation ${finalOutcome}, expected ${wantOutcome}`);
  if (val.outcome === 'PASS' && sem.length) fail('validator returned PASS with a non-empty issue list');
  const pend = (analysis.items || []).filter((i) => /^pending_/.test(i.category)).map((i) => i.id).sort().join(',');
  if (val.pending_items_checked && [...val.pending_items_checked].sort().join(',') !== pend) fail('validator pending_items_checked differs from analysis pending items');
  r.email = { words: det.wordCount, length_status: det.lengthStatus, deterministic_issues: det.issues.length, semantic_issues: sem.length, validation: finalOutcome };
  r.status = r.failures.length ? 'FAIL' : 'PASS';
  results.push(r);
}

// adversarial drafts: the checks and the validator must reject every one
const advDir = path.join(FIX, 'adversarial');
if (exists(advDir) && !ONLY) {
  for (const f of fs.readdirSync(advDir).filter((x) => x.endsWith('.json') && !(LEGACY && /^ADV-1[0-2]/.test(x))).sort()) {
    const adv = c.readJson(path.join(advDir, f));
    const base = adv.base_case;
    const meta = c.readJson(path.join(FIX, base, 'metadata.json'));
    const analysis = c.readJson(path.join(ADV_BASE, base, 'analysis.json'));
    const det = c.deterministicChecks({ email: adv.email, meta, analysis, policy });
    const vp = path.join(RES, 'adversarial', adv.id + '.validation.json');
    const r = { case: adv.id, scenario: 'ADVERSARIAL: ' + adv.description, failures: [] };
    let sem = [];
    if (exists(vp)) sem = semanticIssues(c.readJson(vp)); else r.failures.push('semantic validation result missing');
    const codes = new Set([...det.issues.map((i) => i.code), ...sem.map((i) => i.code)]);
    const rejected = codes.size > 0 && (det.issues.length > 0 || (exists(vp) && c.readJson(vp).outcome === 'FAIL'));
    if (!rejected) r.failures.push('draft was NOT rejected');
    (adv.expected_codes || []).forEach((code) => { if (!codes.has(code)) r.failures.push('expected code not raised: ' + code); });
    (adv.expected_semantic_codes || []).forEach((code) => { if (!sem.some((i) => i.code === code)) r.failures.push('semantic validator missed: ' + code); });
    r.raised = [...codes];
    r.status = r.failures.length ? 'FAIL' : 'PASS';
    results.push(r);
  }
}

const pass = results.filter((r) => r.status === 'PASS').length;
results.truth_audit_failures = truthAudit;
fs.mkdirSync(RES, { recursive: true });
fs.writeFileSync(path.join(RES, ONLY ? 'test-results.partial.json' : 'test-results.json'), JSON.stringify({ generated_for: 'phase2 synthetic dry run', total: results.length, passed: pass, truth_audit_failures: truthAudit, results }, null, 2) + '\n');
results.forEach((r) => {
  console.log(`${r.status}  ${r.case}  ${r.scenario}${r.note ? '  [' + r.note + ']' : ''}`);
  r.failures.forEach((m) => console.log('        - ' + m));
  (r.conflicts || []).forEach((m) => console.log('        ~ EXPECTATION CONFLICT (not edited, needs approval): ' + m));
  if (r.readability_warning) console.log('        ? readability (warning only): ' + r.readability_warning);
  if (r.ungrounded_terms_warning && r.ungrounded_terms_warning.length) console.log('        ? heuristic: transcript words in summary but not in analysis: ' + r.ungrounded_terms_warning.join(', '));
});
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length && !truthAudit.length ? 0 : 1);
