'use strict';
// Confidence artifact for the pilot (D-070). Pure functions; no file or network access.
// Problem: `overall_confidence` is produced by transcript analysis but the approved 21-column draft schema has no column for it and must not change.
// Design: a git-ignored local record per draft (local/confidence.json), written when the draft is stored, binding the confidence to the exact call,
// send key, draft hash, transcript hash and skill versions. The record holds identifiers, counts and hashes only: NO transcript text, quotes, names or
// addresses. The model's own declaration can only LOWER the result, never raise it: derived = min(declared, computed from the evidence counts).
// Fail closed: a missing, malformed, stale, tampered, inconsistent or conflicting record means "not available", which excludes the draft from the pilot.

const N = require('./normalize');

const SCHEMA = 'ConfidenceRecord/1';
const LEVELS = ['low', 'medium', 'high'];
const MAX_AGE_DAYS = 14;
const rank = (x) => LEVELS.indexOf(x);
const lower = (a, b) => (rank(a) <= rank(b) ? a : b);

// Evidence summary of one analysis result (counts and flags only).
function summarise(analysis) {
  const a = analysis || {}; const items = Array.isArray(a.items) ? a.items : [];
  const has = (it) => Array.isArray(it.evidence) && it.evidence.length > 0 && it.evidence.every((e) => typeof e === 'string' && e.trim().length > 0);
  return { item_count: items.length, high: items.filter((i) => i.confidence === 'high').length, medium: items.filter((i) => i.confidence === 'medium').length,
    low: items.filter((i) => i.confidence !== 'high' && i.confidence !== 'medium').length,   // 'low' and anything invalid count as low
    items_without_evidence: items.filter((i) => !has(i)).length, uncertain_owner: items.filter((i) => i.owner === 'uncertain').length,
    analysis_notes_count: Array.isArray(a.analysis_notes) ? a.analysis_notes.length : 0, transcript_quality: a.transcript_quality || 'unknown', generation_mode: a.generation_mode || 'unknown',
    sensitive_topic_count: Array.isArray(a.sensitive_topics) ? a.sensitive_topics.length : (a.sensitive_topics ? 1 : 0), injection_attempt: a.injection_attempt_detected === true,
    skip_recommended: !!(a.skip_recommendation && a.skip_recommendation.skip === true) };
}

// summary + the model's declared overall_confidence -> { computed, derived, reasons[] }.
// LOW if anything weakens the evidence; otherwise HIGH needs a clear, fully-evidenced, mostly-high analysis with no unresolved ownership or unreadable notes; else MEDIUM.
function classify(summary, declared) {
  const s = summary || {}; const reasons = [];
  if (!LEVELS.includes(declared)) reasons.push('DECLARED_CONFIDENCE_INVALID'); else if (declared === 'low') reasons.push('DECLARED_LOW');
  if (s.transcript_quality !== 'clear') reasons.push('TRANSCRIPT_NOT_CLEAR');
  if (s.generation_mode !== 'full') reasons.push('GENERATION_MODE_NOT_FULL');
  if (!(s.item_count > 0)) reasons.push('NO_ITEMS');
  if (s.low > 0) reasons.push('LOW_CONFIDENCE_ITEMS');
  if (s.items_without_evidence > 0) reasons.push('ITEMS_WITHOUT_EVIDENCE');
  if (s.injection_attempt) reasons.push('INJECTION_ATTEMPT_DETECTED');
  if (s.sensitive_topic_count > 0) reasons.push('SENSITIVE_TOPICS_PRESENT');
  if (s.skip_recommended) reasons.push('SKIP_RECOMMENDED');
  let computed = 'low';
  if (!reasons.length) {
    computed = (s.high / s.item_count >= 0.7 && s.uncertain_owner === 0 && s.analysis_notes_count === 0) ? 'high' : 'medium';
  }
  const derived = lower(LEVELS.includes(declared) ? declared : 'low', computed);   // the declaration can only lower the result; any weakening reason already made computed 'low'
  return { computed, derived, reasons };
}

function deriveConfidence(analysis) { const summary = summarise(analysis); const c = classify(summary, (analysis || {}).overall_confidence); return Object.assign({ declared: (analysis || {}).overall_confidence, evidence: summary }, c); }

const canon = (v) => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v);
const integrityOf = (rec) => { const c = Object.assign({}, rec); delete c.integrity; return N.sha256('confidence|' + canon(c)).slice(0, 32); };

// ctx: { callRef, sendKey, draftHash, transcriptHash, skillVersions, createdAt (ISO) }. The analysis itself is not stored, only its hash.
function buildRecord(analysis, ctx) {
  const c = ctx || {}; const d = deriveConfidence(analysis);
  const rec = { schema: SCHEMA, call_ref: String(c.callRef == null ? '' : c.callRef), send_key: c.sendKey || '', draft_hash: c.draftHash || '', transcript_hash: c.transcriptHash || '', skill_versions: c.skillVersions || '',
    analysis_hash: N.sha256('analysis|' + canon(analysis || {})).slice(0, 32), declared: d.declared === undefined ? null : d.declared, derived: d.derived, computed: d.computed, reasons: d.reasons, evidence: d.evidence, created_at: c.createdAt || '' };
  rec.integrity = integrityOf(rec); return rec;
}

// exp: { callRef, sendKey, draftHash, transcriptHash, skillVersions, now (ISO), maxAgeDays }. Returns { ok, code, derived }.
function verifyRecord(rec, exp) {
  const e = exp || {}; const bad = (code) => ({ ok: false, code });
  if (!rec || typeof rec !== 'object' || rec.schema !== SCHEMA) return bad('CONFIDENCE_RECORD_MALFORMED');
  for (const k of ['call_ref', 'send_key', 'draft_hash', 'transcript_hash', 'skill_versions', 'derived', 'integrity', 'created_at', 'evidence']) if (rec[k] === undefined || rec[k] === null || rec[k] === '') return bad('CONFIDENCE_RECORD_MALFORMED');
  if (rec.integrity !== integrityOf(rec)) return bad('CONFIDENCE_INTEGRITY_FAILED');
  if (!LEVELS.includes(rec.derived)) return bad('CONFIDENCE_RECORD_MALFORMED');
  const re = classify(rec.evidence, rec.declared);   // recompute from the stored evidence counts
  if (re.derived !== rec.derived || re.computed !== rec.computed) return bad('CONFIDENCE_DERIVATION_INCONSISTENT');
  if (rank(rec.derived) > rank(LEVELS.includes(rec.declared) ? rec.declared : 'low')) return bad('CONFIDENCE_DERIVATION_INCONSISTENT');   // never above the declaration
  if (String(e.callRef) !== rec.call_ref) return bad('CONFIDENCE_CALL_MISMATCH');
  if (e.sendKey !== rec.send_key) return bad('CONFIDENCE_SEND_KEY_MISMATCH');
  if (e.draftHash !== rec.draft_hash) return bad('CONFIDENCE_DRAFT_CHANGED');
  if (!e.transcriptHash || e.transcriptHash !== rec.transcript_hash) return bad('CONFIDENCE_TRANSCRIPT_MISMATCH');
  if (!e.skillVersions || e.skillVersions !== rec.skill_versions) return bad('CONFIDENCE_SKILL_VERSIONS_MISMATCH');
  const t = Date.parse(rec.created_at), now = Date.parse(e.now || '');
  if (!Number.isFinite(t) || !Number.isFinite(now)) return bad('CONFIDENCE_TIME_INVALID');
  if (t > now + 60000) return bad('CONFIDENCE_FROM_THE_FUTURE');
  if (now - t > (e.maxAgeDays || MAX_AGE_DAYS) * 86400000) return bad('CONFIDENCE_EXPIRED');
  return { ok: true, code: null, derived: rec.derived };
}

// records: the parsed local file; exp as above. Fail closed: no record = CONFIDENCE_NOT_AVAILABLE; conflicting valid records = CONFIDENCE_CONFLICT.
function resolveConfidence(records, exp) {
  const mine = (Array.isArray(records) ? records : []).filter((r) => r && r.send_key === (exp && exp.sendKey));
  if (!mine.length) return { ok: false, code: 'CONFIDENCE_NOT_AVAILABLE' };
  const results = mine.map((r) => ({ r, v: verifyRecord(r, exp) })); const good = results.filter((x) => x.v.ok);
  if (!good.length) { const newest = results.slice().sort((a, b) => Date.parse(b.r.created_at || 0) - Date.parse(a.r.created_at || 0))[0]; return { ok: false, code: newest.v.code }; }
  if (new Set(good.map((x) => x.v.derived)).size > 1) return { ok: false, code: 'CONFIDENCE_CONFLICT' };
  return { ok: true, derived: good[0].v.derived, record: good.slice().sort((a, b) => Date.parse(b.r.created_at) - Date.parse(a.r.created_at))[0].r };
}

function parseRecords(text) { try { const v = JSON.parse(String(text || '[]').replace(/^﻿/, '')); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

module.exports = { SCHEMA, LEVELS, MAX_AGE_DAYS, summarise, classify, deriveConfidence, buildRecord, verifyRecord, resolveConfidence, parseRecords };
