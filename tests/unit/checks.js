'use strict';
// Phase 2 test harness: deterministic checks from docs/validation-rules.md section 2, eligibility rules E1, E2, E5-E9, E11, E16
// from docs/pipeline.md, and comparison of stage outputs with tests/fixtures/*/expected.json.
// No dependencies, no network, no credentials. Reads only synthetic files in this repository.
// This is a TEST harness. Whether the runbook may use helper scripts is OD-38 (open).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FATHOM_RE = /^https:\/\/fathom\.video\/share\/[A-Za-z0-9_-]+$/;

const readText = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
const readJson = (p) => JSON.parse(readText(p));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

// ---- policy (limited YAML subset used by config/email_policy.yaml) -------------------------------------------------
function loadPolicy() {
  const t = readText(path.join(ROOT, 'config', 'email_policy.yaml'));
  const num = (k) => Number((t.match(new RegExp('^' + k + ':\\s*(\\d+)', 'm')) || [])[1]);
  const banned = [];
  const lines = t.split(/\r?\n/);
  let mode = '';
  const sig = [];
  lines.forEach((l) => {
    if (/^banned_phrases:/.test(l)) { mode = 'banned'; return; }
    if (/^signature_block:/.test(l)) { mode = 'sig'; return; }
    if (/^\S/.test(l)) { mode = ''; return; }
    if (mode === 'banned') { const m = l.match(/^\s+-\s+"(.*)"/); if (m) banned.push(m[1].toLowerCase()); }
    if (mode === 'sig') sig.push(l.replace(/^ {2}/, ''));
  });
  return {
    subjectMin: num('subject_min_chars'), subjectMax: num('subject_max_chars'),
    minWords: num('min_words'), fallbackMin: num('fallback_min_words') || 30, maxWords: num('max_words'),
    preferredMax: num('preferred_max_words') || num('max_words'), permittedMax: num('permitted_max_words') || num('max_words'),
    reviewAbove: num('human_review_above_words') || num('max_words'),
    banned, signatureTemplate: sig.join('\n').trim(),
  };
}

// ---- eligibility (rule-based subset, before any analysis) ----------------------------------------------------------
function parseRecordingUrls(cell) {
  const tokens = String(cell || '').split(/\s+/).filter(Boolean);
  const out = [];
  tokens.forEach((t) => { if (!out.includes(t)) out.push(t); });
  return out;
}

function eligibility(meta, transcript) {
  const notes = String(meta['Meeting Notes'] || '');
  if (/call\s*cancel/i.test(notes)) return { outcome: 'SKIP', reason_code: 'CALL_CANCELLED', rule: 'E1' };
  if (/customer\s+not\s+came|no[- ]?show/i.test(notes)) return { outcome: 'SKIP', reason_code: 'CUSTOMER_NO_SHOW', rule: 'E2' };
  const sent = String(meta['Recording Sent'] || '').trim().toLowerCase();
  if (sent === 'yes') return { outcome: 'SKIP', reason_code: 'RECORDING_ALREADY_SENT', rule: 'E16' };
  if (sent && sent !== 'no') return { outcome: 'SKIP', reason_code: 'RECORDING_SENT_STATUS_UNCLEAR', rule: 'E17' };
  if (!String(meta['Customer Name'] || '').trim()) return { outcome: 'DEFER', reason_code: 'MISSING_CUSTOMER_NAME', rule: 'E5' };
  const email = String(meta['Email'] || '').trim();
  if (!email) return { outcome: 'DEFER', reason_code: 'MISSING_CUSTOMER_EMAIL', rule: 'E6' };
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return { outcome: 'DEFER', reason_code: 'INVALID_CUSTOMER_EMAIL', rule: 'E7' };
  const urls = parseRecordingUrls(meta['Recording URL']);
  if (!urls.length) return { outcome: 'DEFER', reason_code: 'MISSING_FATHOM_URL', rule: 'E8' };
  if (urls.some((u) => !FATHOM_RE.test(u))) return { outcome: 'DEFER', reason_code: 'INVALID_FATHOM_URL', rule: 'E9' };
  if (!String(transcript || '').trim()) return { outcome: 'DEFER', reason_code: 'MISSING_TRANSCRIPT', rule: 'E11' };
  return { outcome: 'ELIGIBLE', reason_code: null, rule: null };
}

// ---- deterministic email checks (validation-rules.md section 2) ----------------------------------------------------
function wordsExcludingSignature(body, firstSignatureLine) {
  const idx = body.lastIndexOf(firstSignatureLine);
  const text = idx >= 0 ? body.slice(0, idx) : body;
  return text.split(/\s+/).filter(Boolean).length;
}

function deterministicChecks({ email, meta, analysis, policy }) {
  const issues = [];
  const add = (code, detail) => issues.push({ code, detail });
  const subject = email.subject || '';
  const body = email.body_text || '';
  const fathom = parseRecordingUrls(meta['Recording URL']);
  const nameParts = String(meta['Customer Name']).trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const first = nameParts[0].length === 1 && nameParts.length > 1 ? nameParts.join(' ') : nameParts[0]; // OD-32: title-case; an initial is not a greeting name
  const agentFirst = String(meta['Call lead by(who took the call)']).trim().split(/\s+/)[0];
  const signature = policy.signatureTemplate.replace('{support_agent_first_name}', agentFirst);

  // URLs
  const found = (body.match(/https?:\/\/[^\s)>\]]+/g) || []).map((u) => u.replace(/[.,;]+$/, ''));
  const missing = fathom.filter((u) => !found.includes(u));
  if (missing.length) add('FATHOM_URL_MISSING', missing.join(' '));
  const extra = found.filter((u) => !fathom.includes(u));
  const repeated = found.filter((u, i) => found.indexOf(u) !== i);
  if (extra.length || repeated.length) add('FATHOM_URL_MISMATCH', [...extra, ...repeated].join(' '));
  if (!missing.length && !extra.length) {
    const order = found.filter((u) => fathom.includes(u));
    if (order.join('|') !== fathom.join('|')) add('RECORDING_ORDER_MISMATCH', order.join(' > '));
  }
  if (extra.length) add('UNAPPROVED_LINK', extra.join(' '));
  const lines = body.split('\n');
  if (fathom.length > 1) {
    fathom.forEach((u, i) => {
      const line = lines.find((l) => l.includes(u)) || '';
      if (!new RegExp('^\\s*Part ' + (i + 1) + ':\\s*' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$').test(line)) {
        add('RECORDING_SEGMENT_LABELS_MISSING', `segment ${i + 1}`);
      }
    });
  } else if (/\bPart \d+\b/.test(body)) {
    add('RECORDING_SEGMENT_LABELS_MISSING', 'Part label used with a single recording');
  }

  // greeting / subject
  if (!new RegExp('^Hi ' + first + ',').test(lines[0] || '')) add('NAME_MISMATCH', lines[0] || '(empty)');
  const sl = [...subject].length;
  if (!subject || sl < policy.subjectMin || sl > policy.subjectMax || /\[|\]|\{\{|\}\}|TBD/i.test(subject) ||
      (subject === subject.toUpperCase() && /[A-Z]/.test(subject)) || /\p{Extended_Pictographic}/u.test(subject)) {
    add('SUBJECT_INVALID', `${sl} chars: ${subject}`);
  }

  // length, placeholders, banned, contacts, signature, format
  const wc = wordsExcludingSignature(body, signature.split('\n')[0]);
  const legacyMode = process.env.PHASE2_OWNER_RULE === 'legacy';
  let lengthStatus = 'within_preferred';
  if (legacyMode) {
    if (wc < policy.minWords || wc > policy.maxWords) add('LENGTH_OUT_OF_RANGE', `${wc} words (policy ${policy.minWords}-${policy.maxWords})`);
  } else {
    // policy D-031: <=250 normal; 251-350 permitted when needed; >350 needs human review (not a PASS)
    const minW = email.mode === 'neutral_fallback' ? policy.fallbackMin : policy.minWords;
    if (wc < minW) add('LENGTH_OUT_OF_RANGE', `${wc} words (minimum ${minW})`);
    else if (wc > policy.reviewAbove) { lengthStatus = 'review_required'; add('LENGTH_REVIEW_REQUIRED', `${wc} words, above ${policy.reviewAbove}: human review`); }
    else if (wc > policy.preferredMax) lengthStatus = 'above_preferred';
    if (email.length_status !== undefined && email.length_status !== lengthStatus) add('LENGTH_STATUS_MISMATCH', `declared ${email.length_status}, counted ${lengthStatus} (${wc} words)`);
    if (email.length_status === undefined) add('LENGTH_STATUS_MISSING', 'EmailDraft has no length_status');
    // unanchored relative time words are banned (call-date policy)
    const bare = (body.match(/\b(today|tonight|tomorrow|yesterday|this morning|this evening|this afternoon)\b/gi) || []);
    if (bare.length) add('RELATIVE_TIME_UNANCHORED', [...new Set(bare.map((x) => x.toLowerCase()))].join(', '));
    // fabricated customer intent: specific wishes, feelings and urgency need a basis in the analysis (heuristic backing the semantic check)
    if (analysis) {
      const blob = JSON.stringify([analysis.issues, analysis.items, analysis.sentiment_evidence]).toLowerCase();
      const claims = [
        [/\byou (were|felt|are) (unhappy|upset|angry|disappointed)\b/i, /\b(unhappy|upset|angry|disappointed|frustrat\w*)\b/],
        [/\byou wanted (to )?(switch|cancel|upgrade|downgrade|a refund|compensation)\b/i, /\b(switch|cancel\w*|upgrade|downgrade|refund|compensation)\b/],
        [/\burgent(ly)?\b/i, /\burgent(ly)?\b/],
        [/\byou wanted (this|it|that) (fixed|resolved|sorted)\b/i, /\b(fix|fixed|sorted|hope|hoped|hoping|resolved|resolution|resolve)\b/],
      ];
      claims.forEach(([em, basis]) => { const m = body.match(em); if (m && !basis.test(blob)) add('UNSUPPORTED_CUSTOMER_INTENT', 'email says "' + m[0] + '" but the analysis records no such intent'); });
    }
  }
  if (/\[[^\]]*\]|\{\{|\}\}|<[A-Za-z ]+>|\bTBD\b|\bXXX\b|Lorem/.test(subject + '\n' + body)) add('PLACEHOLDER_PRESENT', 'placeholder-like text');
  const lower = (subject + '\n' + body).toLowerCase();
  policy.banned.forEach((p) => { if (lower.includes(p)) add('BANNED_PHRASE', p); });
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(body) || /(?:\+\d[\d\s-]{8,}\d|\b\d{10}\b)/.test(body)) add('UNAPPROVED_CONTACT_DETAIL', 'email address or phone number in body');
  if (!body.trimEnd().endsWith(signature)) add('SIGNATURE_MISSING', 'configured signature block not at the end');
  if (/\*\*|^#{1,6}\s|<\/?(html|p|b|br|div)\b/im.test(body)) add('FORMAT_INVALID', 'markdown or HTML');
  if (/\u00e2\u20ac|\u00c3[\u0080-\u00bf]|\ufffd/.test(subject + '\n' + body)) add('FORMAT_INVALID', 'mojibake / broken UTF-8 in subject or body');

  // cross-reference with the analysis
  if (analysis && analysis.items) {
    const ids = new Set(analysis.items.map((i) => i.id));
    const ref = new Set(email.referenced_item_ids || []);
    analysis.items.filter((i) => /^pending_/.test(i.category) && i.confidence !== 'low' && !ref.has(i.id)) // low-confidence items are intentionally not stated (D-044)
      .forEach((i) => add('PENDING_ITEM_NOT_REFERENCED', i.id));
    [...ref].filter((r) => !ids.has(r)).forEach((r) => add('UNKNOWN_REFERENCED_ITEM', r));
    // heuristic for invented timing: time words must come from a stated timeline
    let timelines = analysis.items.map((i) => norm(i.stated_timeline || '')).join(' | ');
    // a timeline spoken in Hindi/Hinglish may legitimately appear translated in the English email
    const tr = [[/कल|\bkal\b/, 'tomorrow'], [/आज|\baaj\b/, 'today'], [/रात|\braat\b/, 'tonight'], [/सुबह|\bsubah\b/, 'morning']];
    tr.forEach(([re, w]) => { if (re.test(timelines)) timelines += ' | ' + w; });
    ['soon', 'shortly', 'today', 'tomorrow', 'tonight', 'right away', 'immediately', 'asap', 'by end of day', 'within \\d+ (hours?|days?)']
      .forEach((w) => {
        const m = lower.match(new RegExp('\\b(' + w + ')\\b'));
        if (m && !timelines.includes(m[1])) add('TIME_WORD_NOT_IN_TIMELINE', m[1]);
      });
  }
  return { issues, wordCount: wc, claimedWordCount: email.word_count_excluding_signature, lengthStatus };
}

// ---- structural checks of analysis and summary against the transcript ----------------------------------------------
const CAT = ['discussed', 'explained', 'completed', 'pending_customer_action', 'pending_support_action'];
const RANK = { discussed: 1, explained: 2, completed: 3 };

function analysisChecks(analysis, transcript) {
  const f = [];
  const t = norm(transcript);
  (analysis.items || []).forEach((it) => {
    if (!CAT.includes(it.category)) f.push(`${it.id}: invalid category ${it.category}`);
    // transcript-analysis 1.3.0: a completed item is owned by whoever performed it (customer | support | uncertain)
    const legacy = process.env.PHASE2_OWNER_RULE === 'legacy';   // skills 1.2.0 results (original Phase 2 run)
    const ownerOk = (/^pending_customer/.test(it.category) && it.owner === 'customer') ||
      (/^pending_support/.test(it.category) && it.owner === 'support') ||
      (it.category === 'explained' && it.owner === 'support') ||
      (it.category === 'completed' && (legacy ? it.owner === 'support' : ['customer', 'support', 'uncertain'].includes(it.owner))) ||
      (it.category === 'discussed' && ['none', 'customer', 'support'].includes(it.owner));
    if (!ownerOk) f.push(`${it.id}: owner ${it.owner} inconsistent with ${it.category}`);
    if (!legacy) {
      if (it.category === 'completed' && !['support', 'none'].includes(it.guided_by) && !(it.owner === 'uncertain' && it.guided_by == null)) f.push(`${it.id}: completed item needs guided_by support|none`);
      if (it.category !== 'completed' && it.guided_by !== null && it.guided_by !== undefined) f.push(`${it.id}: guided_by must be null for ${it.category}`);
      if (it.owner === 'uncertain' && !['low', 'medium'].includes(it.confidence)) f.push(`${it.id}: uncertain owner must have confidence low or medium (statement-level confidence, D-044)`);
    }
    if (!it.evidence || !it.evidence.length) f.push(`${it.id}: no evidence`);
    (it.evidence || []).forEach((q) => {
      if (!t.includes(norm(q).replace(/\[redacted\]/g, ''))) f.push(`${it.id}: evidence not verbatim in transcript: "${q}"`);
      if (q.split(/\s+/).length > 25) f.push(`${it.id}: evidence over 25 words`);
    });
    if (it.stated_timeline && !t.includes(norm(it.stated_timeline))) f.push(`${it.id}: stated_timeline not verbatim: "${it.stated_timeline}"`);
  });
  if (process.env.PHASE2_OWNER_RULE !== 'legacy' && process.env.PHASE2_PRE_CALLDATE !== '1') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(analysis.call_date || '')) f.push('call_date missing or not YYYY-MM-DD');
    (analysis.items || []).forEach((it) => {
      const ref = it.timeline_reference;
      if (it.stated_timeline) {
        if (!['call_relative', 'fixed'].includes(ref)) f.push(`${it.id}: timeline_reference must be call_relative|fixed (got ${ref})`);
        const rel = /tonight|tomorrow|today|\bkal\b|aaj|कल|आज|this week|next week|after the call/i.test(it.stated_timeline);
        const fix = /friday|monday|tuesday|wednesday|thursday|saturday|sunday|within \d|working days|hours|\d{4}/i.test(it.stated_timeline);
        if (rel && !fix && ref !== 'call_relative') f.push(`${it.id}: "${it.stated_timeline}" is call-relative but timeline_reference=${ref}`);
        if (fix && !rel && ref !== 'fixed') f.push(`${it.id}: "${it.stated_timeline}" is fixed but timeline_reference=${ref}`);
        if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{4}-\d{2}-\d{2}/i.test(it.stated_timeline) && !transcript.toLowerCase().includes(it.stated_timeline.toLowerCase())) f.push(`${it.id}: calendar date in stated_timeline`);
      } else if (ref !== null && ref !== undefined) f.push(`${it.id}: timeline_reference must be null without a stated_timeline`);
    });
  }
  if (process.env.PHASE2_OWNER_RULE !== 'legacy') {
    (analysis.issues || []).forEach((i) => { if (!i.problem_statement || !String(i.problem_statement).trim()) f.push(`${i.id}: problem_statement missing`); });
    const anyUncertain = (analysis.items || []).some((i) => i.category === 'completed' && i.owner === 'uncertain');
    if (typeof analysis.ownership_review_required !== 'boolean') f.push('ownership_review_required missing');
    else if (analysis.ownership_review_required !== anyUncertain) f.push(`ownership_review_required=${analysis.ownership_review_required} but uncertain completed items=${anyUncertain}`);
  }
  const blob = JSON.stringify(analysis);
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(blob)) f.push('email address present in analysis');
  return f;
}

// ownership truth (tests/fixtures/ownership-truth.json): who really performed each completed action
function ownershipTruthChecks(caseId, analysis, truth) {
  const f = [];
  (truth.cases[caseId] || []).forEach((t) => {
    const re = new RegExp(t.pattern, 'i');
    const ex = t.exclude ? new RegExp(t.exclude, 'i') : null;
    const matches = (analysis.items || []).filter((i) => i.category === 'completed' && re.test(i.description) && !(ex && ex.test(i.description)));
    if (!matches.length) {
      // an uncertain-truth case may legitimately end as a skip with no completed item
      if (!(t.performer === 'uncertain' && analysis.skip_recommendation && analysis.skip_recommendation.skip)) f.push(`ownership truth: no completed item matches /${t.pattern}/`);
      return;
    }
    matches.forEach((m) => { if (m.owner !== t.performer) f.push(`ownership truth: ${m.id} owner ${m.owner}, transcript shows ${t.performer} (${t.note})`); });
  });
  return f;
}

// credit wording in the summary against the item owner, and grounding of the summary in the analysis
function summaryGroundingChecks(analysis, summary, transcript) {
  const f = []; const warn = [];
  if (summary.skipped) return { f, warn };
  const byId = Object.fromEntries((analysis.items || []).map((i) => [i.id, i]));
  const issueIds = new Set((analysis.issues || []).map((i) => i.id));
  (summary.resolved || []).forEach((e) => (e.source_item_ids || []).forEach((id) => {
    const it = byId[id]; if (!it) return;
    const t = e.text;
    if (it.owner === 'customer' && (/^\s*We\b/.test(t) || /\bwe (enabled|switched|set|added|changed|fixed|updated|removed|turned|saved|selected|corrected|configured|deleted)\b/i.test(t))) f.push(`${id}: customer-performed step credited to "we": ${t}`);
    if (it.owner === 'support' && (/^\s*You\b/.test(t) || /\byou (enabled|switched|set|added|changed|fixed|updated|removed|turned|saved|selected|corrected|configured|deleted)\b/i.test(t))) f.push(`${id}: support-performed step credited to "you": ${t}`);
    if (it.owner === 'uncertain' && /\b(we|you) (enabled|switched|set|added|changed|fixed|updated|removed|turned|saved|selected|corrected|configured|deleted)\b/i.test(t)) f.push(`${id}: uncertain owner credited: ${t}`);
  }));
  if (process.env.PHASE2_PRE_CALLDATE !== '1') {
    if (summary.call_date !== analysis.call_date) f.push('summary.call_date differs from analysis.call_date');
    ['customer_next_steps', 'support_next_steps'].forEach((s) => (summary[s] || []).forEach((e) => (e.source_item_ids || []).forEach((id) => {
      const it = byId[id]; if (!it || !e.timeline) return;
      if ((e.timeline_source || '') !== (it.stated_timeline || '')) f.push(`${id}: timeline_source "${e.timeline_source}" is not the verbatim stated_timeline "${it.stated_timeline}"`);
      if (/\b(today|tonight|tomorrow|yesterday)\b/i.test(e.timeline) && !/(day after|evening of|night of|same day|following day)/i.test(e.timeline)) f.push(`${id}: relative timeline not anchored to the call: ${e.timeline}`);
      if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{4}-\d{2}-\d{2}/i.test(e.timeline)) f.push(`${id}: calendar date invented in timeline: ${e.timeline}`);
    })));
    (summary.customer_next_steps || []).forEach((e) => { if (/^\s*(We|Our team)\b/.test(e.text)) f.push('customer step phrased as our commitment: ' + e.text); });
  }
  if (!Array.isArray(summary.call_purpose_issue_ids) || (!summary.call_purpose_issue_ids.length && summary.mode !== 'neutral_fallback')) f.push('call_purpose_issue_ids missing');   // a neutral fallback summary has no established issue (D-044)
  else summary.call_purpose_issue_ids.forEach((id) => { if (!issueIds.has(id)) f.push(`call_purpose_issue_ids: unknown issue ${id}`); });
  if (!Array.isArray(summary.analysis_gaps)) f.push('analysis_gaps missing');
  const blob = norm(JSON.stringify(analysis));
  const texts = [summary.call_purpose, ...['resolved', 'covered', 'customer_next_steps', 'support_next_steps'].flatMap((s) => (summary[s] || []).map((e) => e.text))];
  texts.forEach((txt) => (String(txt).match(/"([^"]{3,})"/g) || []).forEach((q) => { if (!blob.includes(norm(q.slice(1, -1)))) f.push(`quoted text not in analysis: ${q}`); }));
  // heuristic only: words that are in the transcript but nowhere in the analysis
  const tBlob = ' ' + norm(transcript).replace(/[^a-zऀ-ॿ ]/g, ' ') + ' ';
  const aWords = new Set(blob.replace(/[^a-z ]/g, ' ').split(' ').filter(Boolean));
  const seen = new Set();
  texts.join(' ').toLowerCase().replace(/[^a-z ]/g, ' ').split(' ').filter((w) => w.length >= 6).forEach((w) => {
    if (!aWords.has(w) && tBlob.includes(' ' + w + ' ') && !seen.has(w)) { seen.add(w); warn.push(w); }
  });
  return { f, warn };
}

function summaryChecks(analysis, summary) {
  const f = [];
  if (summary.skipped) return f;
  const sections = { resolved: 'completed', covered: null, customer_next_steps: 'pending_customer_action', support_next_steps: 'pending_support_action' };
  const byId = Object.fromEntries((analysis.items || []).map((i) => [i.id, i]));
  const seen = {};
  Object.keys(sections).forEach((s) => (summary[s] || []).forEach((e) => (e.source_item_ids || []).forEach((id) => {
    seen[id] = (seen[id] || 0) + 1;
    const it = byId[id];
    if (!it) { f.push(`${s}: unknown item ${id}`); return; }
    if (s === 'resolved' && it.category !== 'completed') f.push(`${id}: ${it.category} placed in resolved`);
    if (s === 'covered' && !['explained', 'discussed'].includes(it.category)) f.push(`${id}: ${it.category} placed in covered`);
    if (s === 'customer_next_steps' && it.category !== 'pending_customer_action') f.push(`${id}: ${it.category} placed in customer_next_steps`);
    if (s === 'support_next_steps' && it.category !== 'pending_support_action') f.push(`${id}: ${it.category} placed in support_next_steps`);
    if (s.endsWith('_next_steps')) {
      const want = norm(it.stated_timeline || '');
      if (!e.timeline && want) f.push(`${id}: timeline dropped`);
      if (e.timeline && !want) f.push(`${id}: timeline "${e.timeline}" invented`);
    }
  })));
  (summary.omitted_item_ids || []).forEach((o) => { seen[o.item_id] = (seen[o.item_id] || 0) + 1; });
  (analysis.items || []).forEach((it) => {
    if (!seen[it.id]) f.push(`${it.id}: not placed in any section`);
    if (seen[it.id] > 1) f.push(`${it.id}: placed ${seen[it.id]} times`);
  });
  return f;
}

// ---- expectation comparison -----------------------------------------------------------------------------------------
function compareAnalysis(analysis, exp) {
  const f = [];
  const a = exp.analysis || {};
  if (a.transcript_status && !a.transcript_status.split('|').includes(analysis.transcript_status)) f.push(`transcript_status ${analysis.transcript_status}`);
  if (typeof a.skip === 'boolean' && analysis.skip_recommendation.skip !== a.skip) f.push(`skip=${analysis.skip_recommendation.skip}, expected ${a.skip}`);
  if (a.skip === 'either' && analysis.skip_recommendation.skip && !(a.reason_code_allowed || []).includes(analysis.skip_recommendation.reason_code)) f.push(`skip reason ${analysis.skip_recommendation.reason_code} not allowed`);
  const rc = analysis.skip_recommendation.reason_code;
  if (a.reason_code_allowed && a.skip !== 'either' && !a.reason_code_allowed.includes(rc)) f.push(`reason_code ${rc}`);
  if (a.skip === false && rc !== null) f.push(`reason_code ${rc} on a non-skipped record`);
  if (a.language && !a.language.split('|').includes(analysis.language)) f.push(`language ${analysis.language}`);
  if (a.sentiment_allowed && !a.sentiment_allowed.includes(analysis.customer_sentiment)) f.push(`sentiment ${analysis.customer_sentiment}`);
  if (a.overall_confidence_allowed && !a.overall_confidence_allowed.includes(analysis.overall_confidence)) f.push(`overall_confidence ${analysis.overall_confidence}`);
  if (a.issue_count) {
    const n = (analysis.issues || []).length;
    if (n < a.issue_count.min || n > a.issue_count.max) f.push(`issue count ${n} not in ${a.issue_count.min}-${a.issue_count.max}`);
  }
  const conflicts = [];
  (a.required_items || []).forEach((r) => {
    const legacy = process.env.PHASE2_OWNER_RULE === 'legacy';
    // Existing expectations name `support` as owner of every completed item (the S-11 defect). They are NOT edited.
    // For completed items the owner is judged by ownership-truth.json; a different owner is reported as an expectation conflict.
    const ownerMatches = (o) => o === r.owner;
    const matchesPattern = (i) => new RegExp(r.pattern, 'i').test(i.description + ' ' + ((analysis.issues || []).find((x) => x.id === i.issue_id) || {}).title);
    const cands = (analysis.items || []).filter((i) => i.category === r.category && matchesPattern(i));
    const strict = cands.some((i) => ownerMatches(i.owner));
    if (strict) return;
    if (!legacy && r.category === 'completed' && cands.length) {
      conflicts.push(`expected owner ${r.owner} for completed /${r.pattern}/, got ${cands.map((i) => i.id + ':' + i.owner).join(',')}`);
      return;
    }
    f.push(`missing item ${r.category}/${r.owner} /${r.pattern}/`);
  });
  f.conflicts = conflicts;
  Object.keys(a.forbidden_categories || {}).forEach((c) => {
    if ((analysis.items || []).some((i) => i.category === c)) f.push(`forbidden category present: ${c} (${a.forbidden_categories[c]})`);
  });
  if (a.stated_timelines_allowed) {
    (analysis.items || []).forEach((i) => {
      if (i.stated_timeline && !a.stated_timelines_allowed.map((x) => x && x.toLowerCase()).includes(i.stated_timeline.toLowerCase())) f.push(`${i.id}: unexpected timeline "${i.stated_timeline}"`);
    });
  }
  if (a.issue_status_required) {
    Object.entries(a.issue_status_required).forEach(([k, v]) => {
      // match the issue by id, or by the key in its title, problem statement or the descriptions of its items
      const iss = (analysis.issues || []).find((x) => x.id === k || new RegExp(k, 'i').test(
        [x.title, x.problem_statement, ...(analysis.items || []).filter((i) => i.issue_id === x.id).map((i) => i.description)].join(' ')));
      if (!iss || !new RegExp('^(' + v + ')$').test(iss.status)) f.push(`issue ${k} status ${iss ? iss.status : 'absent'}, expected ${v}`);
    });
  }
  if (a.sensitive_topics_allowed) {
    const ok = a.sensitive_topics_allowed.some((s) => JSON.stringify(s) === JSON.stringify(analysis.sensitive_topics || []));
    if (!ok) f.push(`sensitive_topics ${JSON.stringify(analysis.sensitive_topics)}`);
  }
  if (analysis.injection_attempt_detected) f.push('injection flagged on a fixture without injection');
  return f;
}

function compareEmail(email, intermediateBlob, exp) {
  const f = [];
  const e = exp.email || {};
  const text = (email.subject || '') + '\n' + (email.body_text || '');
  (e.must_include || []).forEach((p) => { if (!new RegExp(p, 'i').test(text)) f.push(`must_include missing: ${p}`); });
  (e.must_not_include || []).forEach((p) => { if (new RegExp(p, 'i').test(text)) f.push(`must_not_include present in email: ${p}`); });
  if (e.must_not_include && exp.case_id === 'P2-09') {
    e.must_not_include.filter((p) => /INTERNAL-NOTE|FF-INT|Zephyr|Karan|legacy|retries|plan limit|tracker|deploy|broke|don't tell/i.test(p))
      .forEach((p) => { if (new RegExp(p, 'i').test(intermediateBlob)) f.push(`internal info present in analysis/summary: ${p}`); });
  }
  if (e.recording_urls) {
    if (JSON.stringify(email.recording_urls_included) !== JSON.stringify(e.recording_urls)) f.push('recording_urls_included differs from expected');
  }
  if (e.language === 'en' && /[ऀ-ॿ]/.test(text)) f.push('Devanagari text in an English-policy email');
  return f;
}

// the evidence lines of ownership-truth.json must be verbatim lines of the synthetic transcripts
function auditTruth(truth, fixturesDir) {
  const f = [];
  Object.entries(truth.cases).forEach(([c, entries]) => {
    const t = norm(readText(path.join(fixturesDir, c, 'transcript.txt')));
    entries.forEach((e) => {
      if (!e.evidence || !e.evidence.length) f.push(`truth ${c} /${e.pattern}/: no evidence lines`);
      (e.evidence || []).forEach((q) => { if (!t.includes(norm(q))) f.push(`truth ${c}: evidence not verbatim in transcript: "${q}"`); });
    });
  });
  return f;
}

module.exports = {
  auditTruth,
  ROOT, readText, readJson, loadPolicy, eligibility, parseRecordingUrls, deterministicChecks,
  analysisChecks, summaryChecks, compareAnalysis, compareEmail, FATHOM_RE,
  ownershipTruthChecks, summaryGroundingChecks,
};
