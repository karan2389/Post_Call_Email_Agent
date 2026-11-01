#!/usr/bin/env node
'use strict';
// Phase 3 deterministic helper CLI (OD-38, D-039). Reads JSON (or text) on stdin, writes JSON on stdout.
// No network, no credentials, no files written. Never touches a spreadsheet: the Claude session does the reads and
// writes through the native connector. Customer data passes through stdin only and is not stored by this tool.
//
//   node src/p3.js target-date [ISO-now]            -> run_date, target_date, now_iso (Asia/Kolkata)
//   node src/p3.js prelim        < {records:[...], ctx?:{...}}   -> preliminary eligibility per record
//   node src/p3.js transcript    < raw transcript text           -> E11-E13 outcome + sha256
//   node src/p3.js hash          < raw text                      -> sha256
//   node src/p3.js check-headers < [[header cells of row 1]]     -> exact 21-header check
//   node src/p3.js plan          < {sources:[...], dest:[[...]]} -> idempotent write plan
//   node src/p3.js build-row     < row object                    -> 21 cell values (storage rules enforced)
//   node src/p3.js review        < AnalysisResult JSON           -> sensitive-topic / skip handling
//   node src/p3.js presend | send-request | search-query | reconcile | event-row | send-key   (Phase 4, stdin JSON; no Gmail or sheet access)
//   node src/p3.js extract-transcript <agent-log.jsonl> <sourceRow> [outFile]  -> exact transcript hash from the recorded connector result (D-043)

const fs = require('fs');
const path = require('path');
const N = require('./lib/normalize');
const E = require('./lib/eligibility');
const D = require('./lib/destination');
const P = require('./lib/policy');
const T = require('./lib/transcript');
const G = require('./lib/guard');
const S = require('./lib/sendstate');
const SL = require('./lib/sendlog');
const GM = require('./lib/gmail');
const PV = require('./lib/provider');
const UC = require('./lib/urlcheck');
const CFD = require('./lib/confidence');

const ROOT = path.resolve(__dirname, '..');

function setting(text, key, fallback) {
  const m = text.match(new RegExp('^\\s*' + key + ':\\s*([^#\\n]*)', 'm'));
  if (!m) return fallback;
  const v = m[1].trim();
  if (v === 'true') return true; if (v === 'false') return false; if (v === 'null' || v === '') return fallback;
  return /^-?\d+$/.test(v) ? Number(v) : v;
}
function loadContext(now) {
  let t = '';
  try { t = fs.readFileSync(path.join(ROOT, 'config', 'run-settings.yaml'), 'utf8'); } catch (e) { /* defaults below */ }
  const override = setting(t, 'target_date_override', null);
  const runDate = N.kolkataDate(now);
  return {
    runDate, targetDate: override || N.addDays(runDate, -setting(t, 'target_date_offset_days', 1)),
    lookbackDays: setting(t, 'phase3_discovery_lookback_days', 0), maxFollowupAgeDays: setting(t, 'max_followup_age_days', 7),
    minTranscriptChars: setting(t, 'min_transcript_chars', 40), fathomShareabilityConfirmed: setting(t, 'fathom_shareability_confirmed', false),
    deliveryMode: setting(t, 'delivery_mode', 'dry_run'), goLiveDate: setting(t, 'go_live_date', null),
    maxRecords: setting(t, 'dry_run_max_records', 3),
  };
}
const readStdin = () => new Promise((res) => { let b = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => { b += c; }); process.stdin.on('end', () => res(b.replace(/^﻿/, ''))); });
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'target-date') {
    const now = arg ? new Date(arg) : new Date();
    const c = loadContext(now);
    return out({ now_iso: N.kolkataIso(now), run_date: c.runDate, target_date: c.targetDate, lookback_days: c.lookbackDays, max_records: c.maxRecords });
  }
  if (cmd === 'extract-transcript') {
    const row = process.argv[4]; const outFile = process.argv[5];
    if (!arg || !row) { process.stderr.write('usage: extract-transcript <agent-log.jsonl> <sourceRow> [outFile]\n'); process.exit(2); }
    const r = T.extractCell(arg, row);
    if (!r.found) return out({ found: false, row, hash_verified: false, reason: 'connector result for the cell not found in the log' });
    const c = loadContext(new Date());
    const res = { found: true, row, range: r.rangeEcho, results_in_log: r.matches, chars: r.text.length, sha256: T.transcriptHash(r.text), hash_verified: true,
      hash_method: 'sha256 of the UTF-8 bytes of the cell string exactly as returned by the connector (no trimming)', check: E.transcriptCheck(r.text, { minChars: c.minTranscriptChars }) };
    if (outFile) {
      const abs = path.resolve(outFile);
      if (abs.toLowerCase().startsWith(ROOT.toLowerCase() + path.sep)) { process.stderr.write('refusing to write a transcript inside the repository\n'); process.exit(3); }
      fs.writeFileSync(abs, r.text, { encoding: 'utf8' }); res.out_file = abs;
    }
    return out(res);
  }
  if (cmd === 'verify-rows') {
    const rangeEcho = process.argv[4]; const expectedFile = process.argv[5];
    if (!arg || !rangeEcho || !expectedFile) { process.stderr.write('usage: verify-rows <session-log.jsonl> <rangeEcho> <expectedRows.json>\n'); process.exit(2); }
    const r = T.extractRange(arg, rangeEcho);
    if (!r.found) return out({ ok: false, reason: 'read-back result not found in the log', rangeEcho });
    return out(Object.assign({ range: rangeEcho }, T.compareRows(r.values, JSON.parse(fs.readFileSync(expectedFile, 'utf8').replace(/^\uFEFF/, '')))));
  }
  const input = await readStdin();
  const text = input.replace(/(\r?\n)+$/, ''); // a shell pipe appends a newline; the hash is of the text without it
  if (cmd === 'hash') return out({ sha256: N.sha256(text) });
  if (cmd === 'transcript') { const c = loadContext(new Date()); return out(E.transcriptCheck(text, { minChars: c.minTranscriptChars })); }
  const json = JSON.parse(input);
  if (cmd === 'prelim') {
    const ctx = Object.assign(loadContext(new Date()), json.ctx || {});
    return out({ ctx, results: json.records.map((r) => Object.assign({ row: r.row }, E.prelim(r, ctx))) });
  }
  if (cmd === 'check-headers') return out(D.checkHeaders(Array.isArray(json[0]) ? json[0] : json));
  if (cmd === 'plan') return out(D.plan(json.sources, D.parseDestination(json.dest)));
  if (cmd === 'build-row') return out({ values: D.buildRow(json) });
  if (cmd === 'review') return out(P.reviewDecision(json));
  // Phase 4 helpers (D-054): pure; the session performs the Gmail and spreadsheet calls
  if (cmd === 'provider') {   // Gmail-only provider selection from config (D-066); exit 5 when the configured provider is not allowed
    let t = ''; try { t = fs.readFileSync(path.join(ROOT, 'config', 'run-settings.yaml'), 'utf8'); } catch (e) { /* unreadable config selects nothing */ }
    const cfg = PV.parseProviderConfig(t);
    try { const sel = PV.selectProvider(cfg); return out({ provider: sel, readiness_blockers: PV.gmailReadiness(cfg) }); }
    catch (e) { out({ provider: null, error: e.code || 'PROVIDER_NOT_ALLOWED' }); process.exit(5); }
  }
  if (cmd === 'greeting-name') return out(N.greetingName(json.name));   // {name} -> {value, valid, reason, used} (OD-32, D-071)
  if (cmd === 'confidence-record') return out(CFD.buildRecord(json.analysis, json.ctx));   // {analysis, ctx{callRef,sendKey,draftHash,transcriptHash,skillVersions,createdAt}} -> record for local/confidence.json (hashes and counts only)
  if (cmd === 'confidence-check') return out(CFD.resolveConfidence(json.records, json.expected));   // {records[], expected{...,now}} -> {ok, derived|code}; fails closed
  if (cmd === 'verify-urls') return out(UC.verifyDeliveredUrls(json.delivered, json.canonical));   // {delivered, canonical[]} -> per-URL verdict (canonical equality vs delivered representation)
  if (cmd === 'presend') return out(S.preSendChecks(json.record, json.ctx));                      // {record, ctx} -> {ok, failed[]}
  if (cmd === 'send-request') return out(GM.buildSendRequest(json));                                // stored draft -> exact send_message arguments
  if (cmd === 'search-query') return out({ query: GM.buildSearchQuery(json) });                      // attempt -> search_threads query
  if (cmd === 'reconcile') return out(S.reconcile(json.attempt, json.sent));                        // {attempt, sent[]} -> SENT | RECONCILIATION_REQUIRED
  if (cmd === 'event-row') return out({ values: SL.buildEventRow(json) });                           // send log event -> 19 cell values
  if (cmd === 'send-key') return out({ send_key: S.sendKey(json.fingerprint, json.url_set_key), draft_hash: S.draftHash(json.recipient, json.subject, json.body), body_hash: SL.bodyHash(json.body) });
  if (cmd === 'guard-write') {   // exit code 0 = allowed, 4 = rejected; the session must call this before every spreadsheet write
    let t = ''; try { t = fs.readFileSync(path.join(ROOT, 'config', 'run-settings.yaml'), 'utf8'); } catch (e) { /* gates stay closed */ }
    const block = (t.match(/^draft_destination:[\s\S]*?(?=^\S|(?![\s\S]))/m) || [''])[0];
    const gates = { writes_enabled: setting(block, 'writes_enabled', false), destination_sharing_verified: setting(block, 'destination_sharing_verified', false),
      headers_verified: setting(block, 'headers_verified', false), configuredDestinationId: setting(block, 'spreadsheet_id', null) };
    const r = G.authorizeWrite(json, gates);
    out(r); if (!r.allowed) process.exit(4); return;
  }
  process.stderr.write('unknown command\n'); process.exit(2);
}
main().catch((e) => { process.stderr.write(String(e && e.message ? e.message : e) + '\n'); process.exit(1); });
