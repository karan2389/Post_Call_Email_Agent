'use strict';
// Per-email approval for the supervised pilot (D-066). An approval is bound to ONE send key, the exact recipient and the exact draft hash
// (recipient + subject + body): editing the draft or changing the recipient invalidates it, it is never inherited by a new version.
// Pure functions. Approvals contain customer addresses, so they are kept in a git-ignored local file (local/pilot-approvals.json), never committed.
// Stages: C1 (up to 5 individually approved emails), C2 (up to 15 more after the C1 review). C3 (capped automation) is not implemented here:
// it needs its own authorisation and design.

const STAGE_CAPS = { C1: 5, C2: 15 };
const em = (x) => String(x == null ? '' : x).trim().toLowerCase();

// Returns { ok, record } or { ok:false, code }. The caller supplies the exact draft hash it computed from the stored draft.
function createApproval(o) {
  const a = o || {};
  if (!a.send_key || String(a.send_key).startsWith('test_')) return { ok: false, code: 'APPROVAL_INVALID_SEND_KEY' };
  if (!em(a.recipient) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em(a.recipient))) return { ok: false, code: 'APPROVAL_INVALID_RECIPIENT' };
  if (!a.draft_hash) return { ok: false, code: 'APPROVAL_INVALID_DRAFT_HASH' };
  if (!STAGE_CAPS[a.stage]) return { ok: false, code: 'APPROVAL_INVALID_STAGE' };
  if (!a.approved_by || !String(a.approved_by).trim()) return { ok: false, code: 'APPROVAL_APPROVER_REQUIRED' };
  if (!a.approved_at || !Number.isFinite(Date.parse(a.approved_at))) return { ok: false, code: 'APPROVAL_TIME_REQUIRED' };
  // business owner conditions (D-075): the approver attests, per email, that the recording permission was verified before the link is included (B1.3)
  // and that the recipient was checked against ALL existing do-not-contact lists (B3.2). Neither can be inferred by the agent; both are the approver's own statement.
  const rp = a.recording_permission_verified_by; const dn = a.dnc_lists_checked_by;
  if (!rp || !String(rp).trim()) return { ok: false, code: 'APPROVAL_RECORDING_PERMISSION_ATTESTATION_REQUIRED' };
  if (!dn || !String(dn).trim()) return { ok: false, code: 'APPROVAL_DNC_ATTESTATION_REQUIRED' };
  return { ok: true, record: { attestations: { recording_permission_verified_by: String(rp).trim(), dnc_lists_checked_by: String(dn).trim() }, approval_id: a.approval_id || 'apr_' + String(a.send_key).slice(5, 17) + '_' + String(a.draft_hash).slice(0, 8), send_key: a.send_key, recipient: em(a.recipient), draft_hash: a.draft_hash,
    stage: a.stage, approved_by: String(a.approved_by).trim(), approved_at: a.approved_at, expires_at: a.expires_at || null, revoked: false } };
}

// rec: { send_key, recipient, draft_hash } as computed NOW from the stored draft; ctx: { authorised_stages[], now (ISO), stage_sent_counts{} }.
function checkApproval(approvals, rec, ctx) {
  const c = ctx || {}; const list = (Array.isArray(approvals) ? approvals : []).filter((a) => a && a.send_key === (rec && rec.send_key));
  if (!rec || !rec.send_key || String(rec.send_key).startsWith('test_')) return { ok: false, code: 'APPROVAL_INVALID_SEND_KEY' };
  if (!list.length) return { ok: false, code: 'APPROVAL_REQUIRED' };
  const live = list.filter((a) => a.revoked !== true);
  if (!live.length) return { ok: false, code: 'APPROVAL_REVOKED' };
  const a = live.slice().sort((x, y) => Date.parse(y.approved_at) - Date.parse(x.approved_at))[0];
  if (!a.approved_by || !STAGE_CAPS[a.stage]) return { ok: false, code: 'APPROVAL_INVALID' };
  const at = a.attestations || {};
  if (!String(at.recording_permission_verified_by || '').trim() || !String(at.dnc_lists_checked_by || '').trim()) return { ok: false, code: 'APPROVAL_ATTESTATION_MISSING' };   // an approval without both attestations never counts (D-075)
  if (em(a.recipient) !== em(rec.recipient)) return { ok: false, code: 'APPROVAL_RECIPIENT_MISMATCH' };
  if (a.draft_hash !== rec.draft_hash) return { ok: false, code: 'APPROVAL_DRAFT_CHANGED' };
  if (!(c.authorised_stages || []).includes(a.stage)) return { ok: false, code: 'APPROVAL_STAGE_NOT_ACTIVE' };
  if (a.expires_at && !(Date.parse(a.expires_at) > Date.parse(c.now || new Date().toISOString()))) return { ok: false, code: 'APPROVAL_EXPIRED' };
  if (((c.stage_sent_counts || {})[a.stage] || 0) >= STAGE_CAPS[a.stage]) return { ok: false, code: 'APPROVAL_STAGE_CAP_REACHED' };
  return { ok: true, approval_id: a.approval_id, stage: a.stage };
}

// Consistency of a whole approval list: no duplicate active approval per send key, per-stage caps, required fields.
function validateApprovalSet(approvals) {
  const issues = []; const live = (Array.isArray(approvals) ? approvals : []).filter((a) => a && a.revoked !== true);
  const seen = new Set(); const per = {};
  for (const a of live) {
    if (seen.has(a.send_key)) issues.push({ code: 'DUPLICATE_ACTIVE_APPROVAL', send_key: a.send_key });
    seen.add(a.send_key); per[a.stage] = (per[a.stage] || 0) + 1;
    if (!STAGE_CAPS[a.stage]) issues.push({ code: 'APPROVAL_INVALID_STAGE', send_key: a.send_key });
  }
  for (const s of Object.keys(STAGE_CAPS)) if ((per[s] || 0) > STAGE_CAPS[s]) issues.push({ code: 'STAGE_CAP_EXCEEDED', stage: s, count: per[s], cap: STAGE_CAPS[s] });
  return { ok: issues.length === 0, issues };
}

function parseApprovals(text) {
  try { const v = JSON.parse(String(text || '[]').replace(/^﻿/, '')); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

module.exports = { STAGE_CAPS, createApproval, checkApproval, validateApprovalSet, parseApprovals };
