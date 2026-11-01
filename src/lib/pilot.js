'use strict';
// C0 pilot preparation helpers (D-068). Pure and deterministic: nothing here reads a sheet, a mailbox or the network, creates an allowlist,
// approves anything or sends anything. They define (1) the candidate pool rules for the C1 pilot, (2) the validation of an explicit send-key
// allowlist, (3) the per-email review card shown to the approver, and (4) the suppression (no further contact) check.
// Confidence note: `overall_confidence` comes from the transcript-analysis artifact of the run; the 21-column draft schema has no confidence column
// and must not change, so a record without a supplied confidence is excluded (CONFIDENCE_NOT_AVAILABLE), never guessed.

const N = require('./normalize');
const S = require('./sendstate');

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
//           sensitive (boolean), overall_confidence, generation_mode }
// opts:   { deferredRows[], suppressed[], inSendLog (Set of send keys), alreadySentKeys }
// Returns { eligible[], excluded[] }. `eligible` is a CANDIDATE POOL (deterministic order), not a selection: the user picks the allowlist from it.
function candidatePool(records, opts) {
  const o = opts || {}; const deferred = (o.deferredRows || DEFERRED_SOURCE_ROWS).map(String); const inLog = o.inSendLog instanceof Set ? o.inSendLog : new Set();
  const eligible = []; const excluded = [];
  for (const r of Array.isArray(records) ? records : []) {
    const codes = [];
    if (r.validationStatus !== 'PASSED') codes.push('VALIDATION_NOT_PASSED');
    if (r.processingStatus !== 'DRAFT_READY') codes.push('NOT_DRAFT_READY');
    const rc = singleRecipient(r.customerEmail); if (!rc.ok) codes.push(rc.code); else if (/@example\.(com|org|net)$/.test(rc.value)) codes.push('SYNTHETIC_RECIPIENT');
    if (!['medium', 'high'].includes(r.overall_confidence)) codes.push(r.overall_confidence === undefined || r.overall_confidence === null ? 'CONFIDENCE_NOT_AVAILABLE' : 'CONFIDENCE_TOO_LOW');
    if (r.sensitive !== false) codes.push(r.sensitive === true ? 'SENSITIVE_TOPIC' : 'SENSITIVE_STATUS_NOT_AVAILABLE');   // only an explicit false passes
    if (deferred.includes(String(r.sourceRow))) codes.push('DEFERRED_CALL');
    if (!r.subject || !r.body) codes.push('DRAFT_TEXT_MISSING');
    if (!Array.isArray(r.urls) || !r.urls.length) codes.push('NO_RECORDING_URL');
    if (rc.ok && isSuppressed(rc.value, o.suppressed)) codes.push('RECIPIENT_SUPPRESSED');
    const fp = rc.ok ? N.fingerprint(N.normalizeDate(r.callDate), N.normalizeTime(r.callTime), rc.value) : null; if (rc.ok && !fp) codes.push('NO_SOURCE_FINGERPRINT');
    const key = fp ? S.sendKey(fp, N.urlSetKey(r.urls || [])) : null;
    if (key && inLog.has(key)) codes.push('ALREADY_IN_SEND_LOG');
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
  const card = { customer_name: r.customerName || '', recipient: rc.ok ? rc.value : null, call_ref: String(r.sourceRow == null ? '' : r.sourceRow), call_date: r.callDate, call_time: r.callTime, subject: r.subject || '',
    body: r.body || '', fathom_urls: Array.isArray(r.urls) ? r.urls.slice() : [], validation_status: r.validationStatus, processing_status: r.processingStatus, confidence: r.overall_confidence == null ? 'NOT_AVAILABLE' : r.overall_confidence,
    generation_mode: r.generation_mode || 'NOT_AVAILABLE', sensitive_topic: r.sensitive === true ? 'YES' : r.sensitive === false ? 'NO' : 'NOT_AVAILABLE', send_key: sendKey,
    draft_hash: rc.ok ? S.draftHash(rc.value, r.subject || '', r.body || '') : null, stage: x.stage || null, suppressed: rc.ok ? isSuppressed(rc.value, x.suppressed) : false };
  card.approvable = !!(card.recipient && card.send_key && card.draft_hash && card.validation_status === 'PASSED' && card.processing_status === 'DRAFT_READY' && ['medium', 'high'].includes(card.confidence) && card.sensitive_topic === 'NO' && !card.suppressed);
  card.binding = { send_key: card.send_key, recipient: card.recipient, draft_hash: card.draft_hash };
  return card;
}

// Plain-text rendering for the chat review (one card per message; there is no bulk form).
function renderCard(c) {
  return ['EMAIL FOR INDIVIDUAL APPROVAL' + (c.stage ? ' (' + c.stage + ')' : ''), `Customer: ${c.customer_name}`, `Recipient: ${c.recipient}`, `Call reference: ${c.call_ref} (${c.call_date} ${c.call_time})`, `Subject: ${c.subject}`,
    `Fathom URL(s): ${c.fathom_urls.join(' , ')}`, `Validation: ${c.validation_status} / ${c.processing_status}`, `Confidence: ${c.confidence} (mode ${c.generation_mode})`, `Sensitive topic: ${c.sensitive_topic}`,
    `Send key: ${c.send_key}`, `Draft hash: ${c.draft_hash}`, `Approvable: ${c.approvable ? 'yes' : 'NO'}`, '--- body ---', c.body, '--- end ---'].join('\n');
}

module.exports = { C1_MAX, DEFERRED_SOURCE_ROWS, singleRecipient, isSuppressed, candidatePool, validateAllowlist, approvalCard, renderCard };
