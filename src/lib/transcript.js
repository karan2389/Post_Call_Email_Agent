'use strict';
// Exact transcript capture for hashing (D-043). The model never retypes a transcript: a worker reads the cell through the
// Sheets connector, and this module recovers the cell value, byte for byte, from the tool result as recorded in that
// worker's own log (JSONL). The hash is the SHA-256 of the UTF-8 bytes of the cell string exactly as returned by the connector
// (no trimming, no normalisation). Pure file reading; no network.

const fs = require('fs');
const N = require('./normalize');

// Finds the get_values result for a single cell, e.g. row 15447 -> range echo "'Calls DONE'!AB15447".
// Returns { found, text, rangeEcho, matches }; text is '' when the cell was empty (the result has no `values`).
function extractCell(logPath, row, column) {
  const col = column || 'AB';
  const needle = `'Calls DONE'!${col}${row}`;
  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);
  const hits = [];
  for (const l of lines) {
    if (!l || l.indexOf('Calls DONE') < 0) continue;
    let o; try { o = JSON.parse(l); } catch (e) { continue; }
    const content = o && o.message && o.message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || part.type !== 'tool_result') continue;
      let s = part.content;
      if (Array.isArray(s)) s = s.map((x) => (x && x.text) || '').join('');
      if (typeof s !== 'string') continue;
      let r; try { r = JSON.parse(s); } catch (e) { continue; }
      if (r && typeof r.range === 'string' && r.range === needle) hits.push(r);
    }
  }
  if (!hits.length) return { found: false, text: '', rangeEcho: needle, matches: 0 };
  const r = hits[hits.length - 1];
  const cell = r.values && r.values[0] && r.values[0][0];
  return { found: true, text: typeof cell === 'string' ? cell : '', rangeEcho: r.range, matches: hits.length };
}

// canonical hash: SHA-256 over the UTF-8 bytes of the cell string as returned (no normalisation)
const transcriptHash = (text) => N.sha256(text);

module.exports = { extractCell, transcriptHash };
