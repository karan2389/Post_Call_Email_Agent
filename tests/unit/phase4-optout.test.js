'use strict';
const assert = require('assert');
const { OPT_OUT_SENTENCE: S, checkOptOut, withoutOptOut, count } = require('../../src/lib/optout');

const SIG = 'Warm regards,\nAsha\nFlexiFunnels Support';
const mk = (mid) => `Hi Test,\n\nThanks for the call.\n\nPlease reply if anything is unclear.\n\n${mid}${SIG}`;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('exact sentence is the approved "simply reply" wording', () => {
  assert.strictEqual(S, 'If you prefer not to receive further automated post-call follow-up emails, simply reply to this email and let us know.');
});
t('correct placement passes', () => assert.strictEqual(checkOptOut(mk(S + '\n\n'), SIG), null));
t('missing fails', () => assert.ok(checkOptOut(mk(''), SIG)));
t('"please reply" variant fails', () => assert.ok(checkOptOut(mk(S.replace('simply', 'please') + '\n\n'), SIG)));
t('altered ending fails', () => assert.ok(checkOptOut(mk(S.replace('let us know.', 'tell us.') + '\n\n'), SIG)));
t('duplicate fails', () => assert.ok(/more than once/.test(checkOptOut(mk((S + '\n\n').repeat(2)), SIG))));
t('placed before the close fails', () => {
  const body = `Hi Test,\n\n${S}\n\nThanks.\n\n${SIG}`;
  assert.ok(checkOptOut(body, SIG));
});
t('same paragraph as other text fails', () => assert.ok(checkOptOut(mk('Thanks. ' + S + '\n\n'), SIG)));
t('extra text after the sentence before the signature fails', () => assert.ok(checkOptOut(mk(S + ' Visit us.\n\n'), SIG)));
t('sentence glued to signature (no blank line) fails', () => assert.ok(checkOptOut(mk(S + '\n'), SIG)));
t('count and strip only remove the exact sentence', () => {
  assert.strictEqual(count(mk(S + '\n\n')), 1);
  assert.ok(!/automated/.test(withoutOptOut(mk(S + '\n\n'))));
  assert.ok(/automated/.test(withoutOptOut(mk('This is automated.\n\n' + S + '\n\n'))), 'other uses of a banned word are not exempted');
});

// integration with the deterministic checks (synthetic data only)
const checks = require('./checks');
t('checks.js still loads with the opt-out check wired in', () => {
  assert.ok(Object.values(checks).some((v) => typeof v === 'function'));
});
console.log(`\n${n} groups passed`);
