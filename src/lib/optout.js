'use strict';
// Approved opt-out sentence (business owner, B3.3 / A7, confirmed 2026-11-02: "simply reply").
// Present exactly once, as its own paragraph immediately before the signature block, unchanged.
const OPT_OUT_SENTENCE = 'If you prefer not to receive further automated post-call follow-up emails, simply reply to this email and let us know.';

function count(body) {
  return String(body).split(OPT_OUT_SENTENCE).length - 1;
}

// Returns null when the body is correct, otherwise a short reason.
function checkOptOut(body, signature) {
  const n = count(body);
  if (n === 0) return 'opt-out sentence missing or altered';
  if (n > 1) return 'opt-out sentence present more than once';
  if (!String(body).trimEnd().endsWith('\n\n' + OPT_OUT_SENTENCE + '\n\n' + signature)) return 'opt-out sentence is not its own paragraph directly before the signature';
  return null;
}

// Body without the fixed sentence, so the length policy keeps counting only the written content.
function withoutOptOut(body) {
  return String(body).split(OPT_OUT_SENTENCE).join('');
}

module.exports = { OPT_OUT_SENTENCE, checkOptOut, withoutOptOut, count };
