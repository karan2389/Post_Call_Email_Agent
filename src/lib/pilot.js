'use strict';
// C0 pilot preparation helpers (D-068). Pure and deterministic: nothing here reads a sheet, a mailbox or the network, creates an allowlist,
// approves anything or sends anything. They define (1) the candidate pool rules for the C1 pilot, (2) the validation of an explicit send-key
// allowlist, (3) the per-email review card shown to the approver, and (4) the suppression (no further contact) check.
// Confidence (D-070): the 21-column draft schema has no confidence column and must not change, so confidence is read ONLY from a verified local
// confidence record (src/lib/confidence.js) bound to the exact call, send key, draft hash, transcript hash and skill versions. A self-declared value on
// the record is ignored; a missing, stale, tampered or inconsistent record excludes the draft (fail closed).

const N = require('./normalize');
const S = require('./sendstate');
const CF = require('./confidence');

const C1_MAX = 5;
const DEFERRED_SOURCE_ROWS = ['15453', '15454'];
const em = (x) => { const r = N.normalizeEmail(x == null ? '' : String(x)); return r.valid ? r.value : ''; };

// One valid address, nothing else in the cell.
function singleRecipient(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || /[\s,;]/.test(s)) return { ok: false, code: s ? 'RECIPIENT_NOT_SINGLE_ADDRESS' : 'RECIPIENT_MISSING' };
  const v = N.normalizeEmail(s); return v.valid ? { ok: true, value: v.value } : { ok: false, code: 'RECIPIENT_INVALID' };
}

function isSuppressed(email, suppressed) {
  const e = em(email); if (!e) return false;
  return (Array.isArray(suppressed) ? suppressed : []).some((x) => { const t = String(x || '').trim().toLowerCase(); return t === e || (t.startsWith('@') && e.endsWith(t)); });
}

// record: { sourceRow, customerName, customerEmail, callDate, callTime, urls[], subject, body, validationStatus, processingStatus, reasonCode,
//           sensitive (boolean), transcriptHash, skillVersions }   (the stored Transcript Hash and Skill Versions cells; confidence comes from opts.confidenceRecords)
// opts:   { deferredRows[], suppressed[], inSendLog (Set of send keys), confidenceRecords[] (parsed local/confidence.json), now (ISO), maxAgeDays }
// Returns { eligible[], excluded[] }. `eligible` is a CANDIDATE POOL (deterministic order), not a selection: the user picks the allowlist from it.
function candidatePool(records, opts) {
  const o = opts || {}; const deferred = (o.deferredRows || DEFERRED_SOURCE_ROWS).map(String); const inLog = o.inSendLog instanceof Set ? o.inSendLog : new Set();
  const eligible = []; const excluded = [];
  for (const r of Array.isArray(records) ? records : []) {
    const codes = [];
    if (r.validationStatus !== 'PASSED') codes.push('VALIDATION_NOT_PASSED');
    if (r.processingStatus !== 'DRAFT_READY') codes.push('NOT_DRAFT_READY');
    const rc = singleRecipient(r.customerEmail); if (!rc.ok) codes.push(rc.code); else if (/@example\.(com|org|net)$/.test(rc.value)) codes.push('SYNTHETIC_RECIPIENT');
    if (r.sensitive !== false) codes.push(r.sensitive === true ? 'SENSITIVE_TOPIC' : 'SENSITIVE_STATUS_NOT_AVAILABLE');   // only an explicit false passes
    if (deferred.includes(String(r.sourceRow))) codes.push('DEFERRED_CALL');
    if (!r.subject || !r.body) codes.push('DRAFT_TEXT_MISSING');
    if (!Array.isArray(r.urls) || !r.urls.length) codes.push('NO_RECORDING_URL');
    if (rc.ok && isSuppressed(rc.value, o.suppressed)) codes.push('RECIPIENT_SUPPRESSED');
    const fp = rc.ok ? N.fingerprint(N.normalizeDate(r.callDate), N.normalizeTime(r.callTime), rc.value) : null; if (rc.ok && !fp) codes.push('NO_SOURCE_FINGERPRINT');
    const key = fp ? S.sendKey(fp, N.urlSetKey(r.urls || [])) : null;
    if (key && inLog.has(key)) codes.push('ALREADY_IN_SEND_LOG');
    if (key) {   // confidence must come from a verified record bound to this exact draft (D-070)
      const cf = CF.resolveConfidence(o.confidenceRecords, { callRef: String(r.sourceRow), sendKey: key, draftHash: S.draftHash(rc.value, r.subject || '', r.body || ''), transcriptHash: r.transcriptHash, skillVersions: r.skillVersions, now: o.now, maxAgeDays: o.maxAgeDays });
      if (!cf.ok) codes.push(cf.code); else if (!['medium', 'high'].includes(cf.derived)) codes.push('CONFIDENCE_TOO_LOW');
    }
    const ref = String(r.sourceRow);
    if (codes.length) { excluded.push({ call_ref: ref, codes }); continue; }
    eligible.push({ call_ref: ref, send_key: key, recipient: rc.value, draft_hash: S.draftHash(rc.value, r.subject, r.body), call_date: r.callDate, call_time: r.callTime });
  }
  eligible.sort((a, b) => (a.call_date + a.call_time + a.call_ref.padStart(8, '0')).localeCompare(b.call_date + b.call_time + b.call_ref.padStart(8, '0')));
  return { eligible, excluded };
}

// allowlist: array of send keys chosen by the user. Valid only if at most C1_MAX, distinct, non-test, and every key is in the candidate pool.
function validateAllowlist(allowlist, pool, max) {
  const cap = max || C1_MAX; const list = Array.isArray(allowlist) ? allowlist : []; const keys = new Set((pool && pool.eligible || []).map((e) => e.send_key)); const issues = [];
  if (!list.length) issues.push({ code: 'ALLOWLIST_EMPTY' });
  if (list.length > cap) issues.push({ code: 'ALLOWLIST_OVER_CAP', count: list.length, cap });
  if (new Set(list).size !== list.length) issues.push({ code: 'ALLOWLIST_DUPLICATE' });
  list.forEach((k) => { if (String(k).startsWith('test_')) issues.push({ code: 'ALLOWLIST_TEST_KEY', send_key: k }); else if (!keys.has(k)) issues.push({ code: 'ALLOWLIST_KEY_NOT_IN_POOL', send_key: k }); });
  return { ok: issues.length === 0, issues };
}

// The review card the approver sees for ONE email. The approval binds to {send_key, recipient, draft_hash} only; every other field is context.
function approvalCard(record, extra) {
  const r = record || {}; const x = extra || {}; const rc = singleRecipient(r.customerEmail);
  const fp = rc.ok ? N.fingerprint(N.normalizeDate(r.callDate), N.normalizeTime(r.callTime), rc.value) : null;
  const sendKey = fp ? S.sendKey(fp, N.urlSetKey(r.urls || [])) : null;
  const cf = sendKey && rc.ok ? CF.resolveConfidence(x.confidenceRecords, { callRef: String(r.sourceRow == null ? '' : r.sourceRow), sendKey, draftHash: S.draftHash(rc.value, r.subject || '', r.body || ''), transcriptHash: r.transcriptHash, skillVersions: r.skillVersions, now: x.now, maxAgeDays: x.maxAgeDays }) : { ok: false, code: 'CONFIDENCE_NOT_AVAILABLE' };
  const card = { customer_name: r.customerName || '', recipient: rc.ok ? rc.value : null, call_ref: String(r.sourceRow == null ? '' : r.sourceRow), call_date: r.callDate, call_time: r.callTime, subject: r.subject || '',
    body: r.body || '', fathom_urls: Array.isArray(r.urls) ? r.urls.slice() : [], validation_status: r.validationStatus, processing_status: r.processingStatus, confidence: cf.ok ? cf.derived : 'NOT_AVAILABLE',
    confidence_status: cf.ok ? 'VERIFIED' : cf.code, confidence_declared: cf.ok ? cf.record.declared : null,
    generation_mode: cf.ok ? cf.record.evidence.generation_mode : 'NOT_AVAILABLE', sensitive_topic: r.sensitive === true ? 'YES' : r.sensitive === false ? 'NO' : 'NOT_AVAILABLE', send_key: sendKey,
    draft_hash: rc.ok ? S.draftHash(rc.value, r.subject || '', r.body || '') : null, stage: x.stage || null, suppressed: rc.ok ? isSuppressed(rc.value, x.suppressed) : false };
  card.approvable = !!(card.recipient && card.send_key && card.draft_hash && card.validation_status === 'PASSED' && card.processing_status === 'DRAFT_READY' && ['medium', 'high'].includes(card.confidence) && card.sensitive_topic === 'NO' && !card.suppressed);
  card.binding = { send_key: card.send_key, recipient: card.recipient, draft_hash: card.draft_hash };
  return card;
}

// Plain-text rendering for the chat review (one card per message; there is no bulk form).
function renderCard(c) {
  return ['EMAIL FOR INDIVIDUAL APPROVAL' + (c.stage ? ' (' + c.stage + ')' : ''), `Customer: ${c.customer_name}`, `Recipient: ${c.recipient}`, `Call reference: ${c.call_ref} (${c.call_date} ${c.call_time})`, `Subject: ${c.subject}`,
    `Fathom URL(s): ${c.fathom_urls.join(' , ')}`, `Validation: ${c.validation_status} / ${c.processing_status}`, `Confidence: ${c.confidence} [${c.confidence_status}] (model declared ${c.confidence_declared}; mode ${c.generation_mode})`, `Sensitive topic: ${c.sensitive_topic}`,
    `Send key: ${c.send_key}`, `Draft hash: ${c.draft_hash}`, `Approvable: ${c.approvable ? 'yes' : 'NO'}`, '--- body ---', c.body, '--- end ---'].join('\n');
}

module.exports = { C1_MAX, DEFERRED_SOURCE_ROWS, singleRecipient, isSuppressed, candidatePool, validateAllowlist, approvalCard, renderCard };
