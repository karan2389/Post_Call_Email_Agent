'use strict';
// Provider selection for the Gmail-only architecture (D-066). The Gmail connector is the ONLY email provider. There is no fallback: if Gmail
// is unavailable or not ready, nothing is sent. Brevo (src/lib/brevo.js) is retained only as historical, mocked-tested code and cannot be selected.
// Pure functions; nothing here reads the environment or opens a connection.

const N = require('./normalize');

const APPROVED_SENDER = 'supportcore@flexifunnels.com';

function parseProviderConfig(yaml) {
  const t = String(yaml == null ? '' : yaml);
  const blk = (name) => (t.match(new RegExp('^' + name + ':[\\s\\S]*?(?=^\\S|(?![\\s\\S]))', 'm')) || [''])[0];
  const val = (b, k) => { const m = b.match(new RegExp('^\\s*' + k + ':\\s*([^#\\n]*)', 'm')); if (!m) return undefined; const v = m[1].trim(); return v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v; };
  const prov = blk('email_provider'); const g = blk('gmail'); const pilot = blk('pilot');
  return { active: val(prov, 'active'), gmail_adapter_enabled: val(prov, 'gmail_adapter_enabled'), allow_fallback: val(prov, 'allow_fallback'),
    sender_address: val(g, 'sender_address'), sender_approved: val(g, 'sender_approved'), customer_sending_authorised: val(g, 'customer_sending_authorised'), internal_tests_authorised: val(g, 'internal_tests_authorised'),
    pilot: { c1_authorised: val(pilot, 'c1_authorised'), c2_authorised: val(pilot, 'c2_authorised'), c3_authorised: val(pilot, 'c3_authorised') } };
}

// Throws for anything other than Gmail (including a missing value): there is no default provider and no second choice.
function selectProvider(cfg) {
  const c = cfg || {};
  if (c.allow_fallback === true) { const e = new Error('PROVIDER_FALLBACK_NOT_ALLOWED'); e.code = 'PROVIDER_FALLBACK_NOT_ALLOWED'; throw e; }
  if (c.active === undefined || c.active === null || c.active === '') { const e = new Error('PROVIDER_NOT_CONFIGURED'); e.code = 'PROVIDER_NOT_CONFIGURED'; throw e; }
  if (String(c.active).trim().toLowerCase() !== 'gmail') { const e = new Error('PROVIDER_NOT_ALLOWED:' + String(c.active)); e.code = 'PROVIDER_NOT_ALLOWED'; throw e; }
  return { name: 'gmail', enabled: c.gmail_adapter_enabled === true, fallback: false };
}

// Reasons the Gmail path must not send (codes only). Brevo-specific gates (sender or tracking confirmation in Brevo, API key) are NOT part of this path.
function gmailReadiness(cfg) {
  const c = cfg || {}; const bad = [];
  try { if (!selectProvider(c).enabled) bad.push('GMAIL_ADAPTER_DISABLED'); } catch (e) { bad.push(e.code || 'PROVIDER_NOT_ALLOWED'); }
  if (c.sender_approved !== true) bad.push('SENDER_NOT_APPROVED');
  if (N.normalizeEmail(c.sender_address || '').value !== APPROVED_SENDER) bad.push('SENDER_ADDRESS_NOT_APPROVED');
  return bad;
}

// Context for the sender in the Gmail-only path: provider policy, the approved sender (verified on the delivered message), read-back after sending,
// and per-email approval for live sends. `over` can only add (mode, runId, approvals...), the safety fields below are applied last.
function sendContext(cfg, over) {
  const c = cfg || {}; const o = over || {};
  const stages = ['C1', 'C2'].filter((s) => c.pilot && c.pilot[s.toLowerCase() + '_authorised'] === true);
  return Object.assign({}, o, { provider_policy: 'gmail_only', sender_address: APPROVED_SENDER, verify_after_send: true,
    require_approval: (o.delivery_mode === 'live'), authorised_stages: stages });
}

module.exports = { APPROVED_SENDER, parseProviderConfig, selectProvider, gmailReadiness, sendContext };
