'use strict';
// Deterministic normalisation helpers for Phase 3 (OD-38, D-039). No network, no credentials, no dependencies.
// Dates and times are never inferred: anything that does not match a documented format returns null.

const crypto = require('crypto');

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};
const FATHOM_RE = /^https:\/\/([^/]+)\/share\/([A-Za-z0-9_-]+)$/i;
const pad = (n) => String(n).padStart(2, '0');

function cleanSpace(s) {
  return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function validYMD(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// "October 31, 2026" (also "October 14 , 2022 ") or "2026-10-31" -> "YYYY-MM-DD"; otherwise null.
function normalizeDate(raw) {
  const s = cleanSpace(raw).replace(/\s+,/g, ',');
  if (!s) return null;
  let m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const d = Number(m[2]); const y = Number(m[3]);
    return mo && validYMD(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && validYMD(Number(m[1]), Number(m[2]), Number(m[3]))) return s;
  return null;
}

// "06:00 PM", "8:30 AM", "12:00 AM", "19:00" -> "HH:MM" (24-hour); otherwise null.
function normalizeTime(raw) {
  const s = cleanSpace(raw);
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?[Mm]\.?$/);
  if (m) {
    let h = Number(m[1]); const min = Number(m[2]);
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = m[3].toLowerCase() === 'p';
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
    return `${pad(h)}:${pad(min)}`;
  }
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return `${pad(Number(m[1]))}:${m[2]}`;
  return null;
}

// Trimmed, lower-case, exactly one address. Returns { value, valid, reason }.
function normalizeEmail(raw) {
  const value = cleanSpace(raw).toLowerCase();
  if (!value) return { value: '', valid: false, reason: 'MISSING_CUSTOMER_EMAIL' };
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value)) return { value, valid: false, reason: 'INVALID_CUSTOMER_EMAIL' };
  return { value, valid: true, reason: null };
}

// docs/data-model.md section 1.5 (D-025). Any malformed token flags the row; order kept; exact duplicates removed.
function parseRecordingUrls(cell) {
  const text = String(cell == null ? '' : cell).trim();
  if (!text) return { urls: [], invalidPositions: [], duplicatesRemoved: 0, empty: true };
  const tokens = text.split(/[\s,;|]+/).filter(Boolean);
  const urls = []; const invalidPositions = []; let dup = 0;
  tokens.forEach((raw, i) => {
    const t = raw.replace(/\/$/, '');
    const m = t.match(FATHOM_RE);
    if (!m || m[1].toLowerCase() !== 'fathom.video') { invalidPositions.push(i + 1); return; }
    const url = `https://fathom.video/share/${m[2]}`;
    if (urls.includes(url)) dup += 1; else urls.push(url);
  });
  return { urls, invalidPositions, duplicatesRemoved: dup, empty: false };
}

// Order-insensitive key of a recording URL set (used to tell calls apart, D-036).
const urlSetKey = (urls) => [...new Set(urls)].sort().join('\n');

// D-036: normalised date | time | email. null if any part is missing. Not a unique identifier.
function fingerprint(date, time, email) {
  if (!date || !time || !email) return null;
  return `${date}|${time}|${email}`;
}

const sha256 = (text) => crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');

// ---- Asia/Kolkata (UTC+05:30, no daylight saving); never uses the host's local time zone ----
const IST_MS = 330 * 60000;
function kolkataParts(now) {
  const t = new Date(now.getTime() + IST_MS);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
}
const kolkataDate = (now) => { const p = kolkataParts(now); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
const kolkataIso = (now) => { const p = kolkataParts(now); return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}+05:30`; };
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function daysBetween(a, b) {
  const f = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((f(b) - f(a)) / 86400000);
}

module.exports = {
  cleanSpace, normalizeDate, normalizeTime, normalizeEmail, parseRecordingUrls, urlSetKey, fingerprint, sha256,
  kolkataDate, kolkataIso, addDays, daysBetween,
};
