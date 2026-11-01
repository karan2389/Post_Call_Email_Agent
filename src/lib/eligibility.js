'use strict';
// Rule-based eligibility (docs/pipeline.md E1-E18) split in two steps so a transcript is read only after the
// preliminary checks pass: prelim() uses source metadata only, transcriptCheck() uses the transcript.
// Inactive rules (no source column): E3 opt-out, E4 call type. E15 and E18 apply only in test / live mode.
// No new business rules: reason codes come from docs/skip-reasons.md.

const N = require('./normalize');

const outcome = (o, reason_code, rule, extra) => Object.assign({ outcome: o, reason_code, rule }, extra || {});

// record: { callDate, callTime, customerName, email, recordingUrl, recordingSent, meetingNotes } (raw sheet text)
// ctx: { targetDate, runDate, lookbackDays, maxFollowupAgeDays, fathomShareabilityConfirmed, deliveryMode, goLiveDate }
function prelim(record, ctx) {
  const callDate = N.normalizeDate(record.callDate);
  const callTime = N.normalizeTime(record.callTime);
  const email = N.normalizeEmail(record.email);
  const rec = N.parseRecordingUrls(record.recordingUrl);
  const base = { callDate, callTime, email: email.value, urls: rec.urls, urlSetKey: N.urlSetKey(rec.urls) };
  base.fingerprint = N.fingerprint(callDate, callTime, email.valid ? email.value : '');

  if (!callDate || !callTime) return outcome('SKIP', 'MISSING_CALL_DATETIME', 'E-date', base);
  const from = N.addDays(ctx.targetDate, -(ctx.lookbackDays || 0));
  if (callDate > ctx.targetDate || callDate < from) return outcome('OUT_OF_WINDOW', null, 'selection', base);

  const notes = String(record.meetingNotes || '');
  if (/call\s*cancel/i.test(notes)) return outcome('SKIP', 'CALL_CANCELLED', 'E1', base);
  if (/customer\s+not\s+came|no[- ]?show/i.test(notes)) return outcome('SKIP', 'CUSTOMER_NO_SHOW', 'E2', base);
  const sent = String(record.recordingSent || '').trim().toLowerCase();
  if (sent === 'yes') return outcome('SKIP', 'RECORDING_ALREADY_SENT', 'E16', base);
  if (sent && sent !== 'no') return outcome('SKIP', 'RECORDING_SENT_STATUS_UNCLEAR', 'E17', base);
  if (ctx.runDate && ctx.maxFollowupAgeDays != null && N.daysBetween(callDate, ctx.runDate) > ctx.maxFollowupAgeDays) {
    return outcome('SKIP', 'CALL_TOO_OLD', 'E14', base);
  }
  if (ctx.deliveryMode === 'live' && ctx.goLiveDate && callDate < ctx.goLiveDate) return outcome('SKIP', 'BEFORE_GO_LIVE', 'E18', base);
  if (!String(record.customerName || '').trim()) return outcome('DEFER', 'MISSING_CUSTOMER_NAME', 'E5', base);
  if (!email.valid) return outcome('DEFER', email.reason, email.reason === 'MISSING_CUSTOMER_EMAIL' ? 'E6' : 'E7', base);
  if (rec.empty) return outcome('DEFER', 'MISSING_FATHOM_URL', 'E8', base);
  if (rec.invalidPositions.length) return outcome('DEFER', 'INVALID_FATHOM_URL', 'E9', Object.assign(base, { invalidPositions: rec.invalidPositions }));
  if (!ctx.fathomShareabilityConfirmed) return outcome('DEFER', 'FATHOM_NOT_SHAREABLE', 'E10', base);
  return outcome('ELIGIBLE_PRELIM', null, null, base);
}

// text: the transcript cell. opts: { minChars (OD-10), cellLimit }
function transcriptCheck(text, opts) {
  const t = String(text == null ? '' : text);
  const cellLimit = (opts && opts.cellLimit) || 50000;
  const minChars = (opts && opts.minChars) || 0;
  if (!t.trim()) return outcome('DEFER', 'MISSING_TRANSCRIPT', 'E11');
  if (t.length >= cellLimit - 500) return outcome('SKIP', 'TRANSCRIPT_POSSIBLY_TRUNCATED', 'E12');
  if (minChars && t.trim().length < minChars) return outcome('SKIP', 'TRANSCRIPT_TOO_SHORT', 'E13');
  return outcome('ELIGIBLE', null, null, { transcriptHash: N.sha256(t), transcriptChars: t.length });
}

module.exports = { prelim, transcriptCheck };
