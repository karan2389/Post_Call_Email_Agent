'use strict';
// OD-32 greeting-name helper tests (D-071). Synthetic names only. Run: node tests/unit/phase3-greeting.test.js
const assert = require('assert'); const N = require('../../src/lib/normalize');
let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);
const g = (x) => N.greetingName(x);

t('title-cases the first word: all caps, all lower, mixed', () => {
  for (const [raw, v] of [['JOHN SMITH', 'John'], ['john smith', 'John'], ['jOHN sMITH', 'John'], ['  maria   garcia  ', 'Maria'], ['Priya', 'Priya']]) assert.deepStrictEqual(g(raw), { value: v, valid: true, reason: null, used: 'first' }, raw);
});
t('collapses an immediately repeated word (case-insensitive) before choosing the greeting', () => {
  assert.strictEqual(g('John John Smith').value, 'John'); assert.strictEqual(g('ANITA anita').value, 'Anita'); assert.strictEqual(g('Ravi Kumar Kumar').value, 'Ravi');
  assert.strictEqual(g('A A Sharma').value, 'A Sharma');   // collapse first, then the initial rule applies
});
t('a single initial is not a greeting name: greet with the full normalised name', () => {
  assert.deepStrictEqual(g('A Sharma'), { value: 'A Sharma', valid: true, reason: null, used: 'full' }); assert.strictEqual(g('r. KUMAR').value, 'R. Kumar'); assert.strictEqual(g('J K Rowling').value, 'J K Rowling');
});
t('hyphens and apostrophes are title-cased per part; non-English letters are kept', () => {
  assert.strictEqual(g("O'BRIEN Pat").value, "O'Brien"); assert.strictEqual(g('anne-marie').value, 'Anne-Marie'); assert.strictEqual(g("d'souza").value, "D'Souza"); assert.strictEqual(g('ÉLODIE martin').value, 'Élodie'); assert.strictEqual(g('श्याम Kumar').valid, true);
});
t('refuses what is not plainly a name, instead of guessing: empty, lone initial, digits, email, URL, symbols, too long', () => {
  const cases = [[undefined, 'MISSING_CUSTOMER_NAME'], [null, 'MISSING_CUSTOMER_NAME'], ['', 'MISSING_CUSTOMER_NAME'], ['   ', 'MISSING_CUSTOMER_NAME'], ['X', 'CUSTOMER_NAME_IS_A_SINGLE_INITIAL'], ['x x', 'CUSTOMER_NAME_IS_A_SINGLE_INITIAL'], ['K.', 'CUSTOMER_NAME_IS_A_SINGLE_INITIAL'],
    ['John3 Smith', 'CUSTOMER_NAME_NOT_A_NAME'], ['john@example.com', 'CUSTOMER_NAME_NOT_A_NAME'], ['https://x.example/y', 'CUSTOMER_NAME_NOT_A_NAME'], ['John <Smith>', 'CUSTOMER_NAME_NOT_A_NAME'], ['A'.repeat(61), 'CUSTOMER_NAME_TOO_LONG']];
  for (const [raw, code] of cases) { const r = g(raw); assert.strictEqual(r.valid, false, String(raw)); assert.strictEqual(r.reason, code, String(raw)); assert.strictEqual(r.value, ''); }
});
t('deterministic and idempotent: normalising the output again changes nothing', () => {
  for (const raw of ['JOHN SMITH', 'A Sharma', "O'BRIEN", 'Ravi Kumar Kumar']) { const a = g(raw).value; assert.strictEqual(g(a).value, a, raw); assert.deepStrictEqual(g(raw), g(raw)); }
});
t('source guarantee: the helper is pure (no file, network or environment access)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../src/lib/normalize.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/process\.env|require\(['"](fs|https?|net|child_process)['"]\)|fetch\(/.test(src));
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n += 1; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)); process.exitCode = 1; } }
  console.log(`phase3 greeting (OD-32): ${n}/${tests.length} test groups passed`);
})();
