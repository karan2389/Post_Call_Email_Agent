'use strict';
// Minimal .env loader for the Brevo adapter (Phase 4, D-061). Pure: the file system and the process environment are injected; nothing is
// written to process.env, nothing is logged, and no function here ever returns, prints or throws a secret VALUE. Issues carry codes, variable
// NAMES and line numbers only. Only the three Brevo variables are accepted; every other name in the file is ignored (and reported by name).
// Precedence: a non-empty value in the real process environment wins over the file (the usual convention, and what a scheduler would set).

const ALLOWED = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME'];

// text -> { values, issues }. A duplicate name is dropped entirely (the intended value is ambiguous), never "last wins".
function parseEnv(text) {
  const values = {}; const seen = {}; const dup = new Set(); const issues = [];
  String(text == null ? '' : text).replace(/^﻿/, '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) { issues.push({ code: 'UNPARSEABLE_LINE', line: i + 1 }); return; }   // the line is never echoed: it may be a secret
    const name = m[1]; let raw = m[2].trim(); let value;
    if (/^["']/.test(raw)) {
      const q = raw[0]; const end = raw.indexOf(q, 1);
      if (end < 0 || (raw.slice(end + 1).trim() && !/^#/.test(raw.slice(end + 1).trim()))) { issues.push({ code: 'MALFORMED_VALUE', name, line: i + 1 }); return; }
      value = raw.slice(1, end);
    } else value = raw.replace(/\s+#.*$/, '').trim();
    if (!ALLOWED.includes(name)) { issues.push({ code: 'UNEXPECTED_NAME_IGNORED', name, line: i + 1 }); return; }
    if (seen[name]) { dup.add(name); return; }
    seen[name] = true; values[name] = value;
  });
  for (const name of dup) { delete values[name]; issues.push({ code: 'DUPLICATE_NAME_DROPPED', name }); }
  return { values, issues };
}

// opts: { fs, file, processEnv } -> { env, issues, sources }. env holds only ALLOWED names with non-empty string values.
function loadEnv(opts) {
  const o = opts || {}; const penv = o.processEnv || {}; let parsed = { values: {}, issues: [] };
  if (o.file) {
    let text = null;
    try { text = o.fs.readFileSync(o.file, 'utf8'); } catch (e) { parsed.issues.push({ code: e && e.code === 'ENOENT' ? 'ENV_FILE_MISSING' : 'ENV_FILE_UNREADABLE' }); }   // err.message is not copied
    if (text !== null) parsed = parseEnv(text);
  }
  const env = {}; const sources = {};
  for (const name of ALLOWED) {
    const p = penv[name]; const f = parsed.values[name];
    if (typeof p === 'string' && p.trim()) { env[name] = p; sources[name] = 'process'; }
    else if (typeof f === 'string' && f.trim()) { env[name] = f; sources[name] = 'file'; }
    else sources[name] = null;
  }
  return { env, issues: parsed.issues, sources };
}

// Booleans and names only: safe to print.
function describeEnv(env) {
  const e = env || {};
  return Object.fromEntries(ALLOWED.map((n) => [n, typeof e[n] === 'string' && e[n].trim().length > 0]));
}

// Removes every occurrence of a secret value from a string (defence in depth for anything that might be displayed).
function redact(text, env) {
  let s = String(text == null ? '' : text); const key = env && env.BREVO_API_KEY;
  if (typeof key === 'string' && key.length >= 8) s = s.split(key).join('[REDACTED]');
  return s;
}

module.exports = { ALLOWED, parseEnv, loadEnv, describeEnv, redact };
