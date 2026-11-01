'use strict';
// Gmail request and search builders (Phase 4, D-054). Pure functions. They build the exact arguments the session passes to the
// native connector tools `send_message`, `search_threads` and `get_message` (schemas inspected 2026-11-01, docs/phase4-gmail-integration.md);
// they do not call anything. A send always uses the stored, validated text unchanged: plain text, one recipient, no cc/bcc, no HTML,
// no attachments, no signature, no reply threading.

const N = require('./normalize');
const S = require('./sendstate');

// rec: the stored draft ({stored_recipient, stored_subject, stored_body}); returns the send_message arguments.
function buildSendRequest(rec, ctx) {
  if (ctx && ctx.delivery_mode === 'test' && ctx.test_recipient) {   // explicit internal test: marked text, approved internal recipient only
    const e = S.testEnvelope(rec, ctx.test_recipient); const v = N.normalizeEmail(e.to);
    if (!v.valid) throw new Error('test recipient invalid');
    return { to: [v.value], subject: e.subject, body: e.body, includeSignature: false };
  }
  const to = N.normalizeEmail(rec.stored_recipient);
  if (!to.valid) throw new Error('recipient invalid');
  if (!rec.stored_subject || !rec.stored_body) throw new Error('subject and body are required');
  return { to: [to.value], subject: rec.stored_subject, body: rec.stored_body, includeSignature: false };
}

// attempt: {recipient, subject, started_at}. Narrow search over Sent: recipient, subject words, date window (date granularity only).
function buildSearchQuery(attempt) {
  const d = new Date(Date.parse(attempt.started_at) + 5.5 * 3600000);   // Asia/Kolkata calendar day of the attempt
  const day = (x) => `${x.getUTCFullYear()}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}`;
  const after = new Date(d.getTime() - 86400000); const before = new Date(d.getTime() + 2 * 86400000);
  const subject = String(attempt.subject).replace(/["\\]/g, ' ').trim();
  return `in:sent to:${N.normalizeEmail(attempt.recipient).value} subject:"${subject}" after:${day(after)} before:${day(before)}`;
}

// A candidate from search_threads/get_message becomes a reconcile() input once its plain-text body has been read: bodyHash is computed
// by the caller from the message body with the same function used when sending (sendlog.bodyHash).
// Observed 2026-11-01 (first internal test, D-057): a link in the sent plain-text body comes back as
// https://www.google.com/url?q=<original>&source=gmail&ust=<timestamp>&sa=E. Reconciliation compares the body with the link wrapping removed;
// this only affects the comparison, it does not make the delivered text match the validated draft (see docs/phase4-gmail-integration.md).
const unwrapGoogleLinks = (text) => String(text).replace(/https:\/\/www\.google\.com\/url\?q=([^&\s]+)(?:&(?:amp;)?[a-z]+=[^&\s]*)*/g, (m, q) => { try { return decodeURIComponent(q); } catch (e) { return q; } });
const toCandidate = (m, bodyHashFn) => ({ id: m.id, subject: m.subject, to: Array.isArray(m.to || m.toRecipients) ? (m.to || m.toRecipients)[0] : m.to, date: m.date, body_hash: m.body == null ? undefined : bodyHashFn(unwrapGoogleLinks(m.body)) });

module.exports = { buildSendRequest, buildSearchQuery, toCandidate, unwrapGoogleLinks, draftHash: S.draftHash };
