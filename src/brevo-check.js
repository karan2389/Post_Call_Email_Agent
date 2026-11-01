'use strict';
// Brevo configuration report and read-only connectivity check (Phase 4, D-061).
//   node src/brevo-check.js           offline: loads .env, reports booleans/codes only, makes NO request
//   node src/brevo-check.js --live    one read-only GET /account, and only if brevo.connectivity_check_authorised is true in config/run-settings.yaml
// Output is booleans, variable names and codes: never a secret value. The key goes only to the adapter, which sends it only to api.brevo.com.

const path = require('path');
const E = require('./lib/env');
const B = require('./lib/brevo');
const N = require('./lib/normalize');

const ROOT = path.resolve(__dirname, '..');

function brevoConfig(yaml) {
  const prov = (String(yaml).match(/^email_provider:[\s\S]*?(?=^\S|(?![\s\S]))/m) || [''])[0];
  const blk = prov.indexOf('  brevo:') >= 0 ? prov.slice(prov.indexOf('  brevo:')) : '';
  const val = (k) => { const m = blk.match(new RegExp('^\\s*' + k + ':\\s*([^#\\n]*)', 'm')); if (!m) return undefined; const v = m[1].trim(); return v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v; };
  return { approved_sender_email: val('approved_sender_email'), approved_sender_name: val('approved_sender_name'), sender_verified_in_brevo: val('sender_verified_in_brevo'),
    link_tracking_disabled_confirmed: val('link_tracking_disabled_confirmed'), connectivity_check_authorised: val('connectivity_check_authorised'), adapter_enabled: val('adapter_enabled') };
}

// o: { argv, fs, root, processEnv, fetch, git(args) -> exit status }. Returns a report object (never contains a secret value).
async function run(o) {
  const live = (o.argv || []).includes('--live'); const root = o.root || ROOT;
  const cfg = brevoConfig(o.fs.readFileSync(path.join(root, 'config/run-settings.yaml'), 'utf8'));
  const loaded = E.loadEnv({ fs: o.fs, file: path.join(root, '.env'), processEnv: o.processEnv });
  const ignored = o.git(['check-ignore', '-q', '.env']) === 0; const tracked = o.git(['ls-files', '--error-unmatch', '.env']) === 0;
  const env = loaded.env;
  const report = {
    mode: live ? 'live_readonly_connectivity' : 'offline_config_report',
    variables_present: E.describeEnv(env), sources: loaded.sources, env_file_issues: loaded.issues,
    env_ignored_by_git: ignored, env_tracked_by_git: tracked,
    sender_email_matches_approved: !!env.BREVO_SENDER_EMAIL && !!cfg.approved_sender_email && N.normalizeEmail(env.BREVO_SENDER_EMAIL).value === N.normalizeEmail(cfg.approved_sender_email).value,
    sender_name_matches_approved: cfg.approved_sender_name !== undefined && env.BREVO_SENDER_NAME === cfg.approved_sender_name,
    send_readiness_blockers: B.readiness(env, cfg),   // codes: these gate SENDING, not the read-only check
    connectivity_check_authorised: cfg.connectivity_check_authorised === true,
    request_made: false,
  };
  if (!live) return report;
  if (cfg.connectivity_check_authorised !== true) { report.connectivity = { ok: false, code: 'CONNECTIVITY_CHECK_NOT_AUTHORISED', request_made: false }; return report; }
  if (!ignored || tracked) { report.connectivity = { ok: false, code: 'ENV_FILE_NOT_PROTECTED', request_made: false }; return report; }
  if (typeof o.fetch !== 'function') { report.connectivity = { ok: false, code: 'NO_FETCH_AVAILABLE', request_made: false }; return report; }
  const client = B.createClient({ fetch: o.fetch, env, config: cfg, timeoutMs: 15000 });
  report.connectivity = await client.checkConnectivity(); report.request_made = report.connectivity.request_made === true;
  return report;
}

if (require.main === module) {
  const cp = require('child_process'); const fs = require('fs');
  const git = (args) => cp.spawnSync('git', args, { cwd: ROOT }).status;
  run({ argv: process.argv.slice(2), fs, root: ROOT, processEnv: process.env, fetch: typeof fetch === 'function' ? fetch : undefined, git })
    .then((r) => { const text = JSON.stringify(r, null, 2); process.stdout.write(E.redact(text, E.loadEnv({ fs, file: path.join(ROOT, '.env'), processEnv: process.env }).env) + '\n'); })
    .catch((e) => { process.stderr.write('brevo-check failed: ' + (e && e.code ? e.code : 'UNEXPECTED_ERROR') + '\n'); process.exitCode = 1; });
}

module.exports = { run, brevoConfig };
