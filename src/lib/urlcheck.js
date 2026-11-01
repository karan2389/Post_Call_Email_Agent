'use strict';
// Delivered-URL verification for the Gmail-only architecture (D-066). Pure functions; no network.
// The Gmail connector rewrites every URL at message construction into
//   https://www.google.com/url?q=<original>&source=gmail&ust=<microseconds>&sa=E   (observed D-057..D-059).
// Rules: the CANONICAL URLs are the ones in the validated stored draft and are never rewritten or re-stored. The DELIVERED representation may be
// plain or this exact wrapper. A wrapper is recognised only in this exact shape (host www.google.com, path /url, q, source=gmail, numeric ust,
// sa=E); anything else that looks like a Google redirect is rejected, as is an undecodable, non-http(s), nested or mismatched destination.
// A wrapper is never assumed to stay valid: its expiry stamp is reported, not trusted.

const TRAILING = /[.,;:!?)\]}>'"]+$/;
const WRAP_RE = /^https:\/\/www\.google\.com\/url\?q=(.+?)&(?:amp;)?source=gmail&(?:amp;)?ust=(\d{1,20})&(?:amp;)?sa=E$/;
const GOOGLE_REDIRECT_LIKE = /^https?:\/\/(?:[a-z0-9-]+\.)*google\.[a-z.]+\/url\?/i;

// Every http(s) URL token in the text, in order, without trailing sentence punctuation.
function extractUrls(text) {
  const out = []; const re = /https?:\/\/[^\s<>"]+/gi; const s = String(text == null ? '' : text); let m;
  while ((m = re.exec(s))) out.push(m[0].replace(TRAILING, ''));
  return out;
}

// ust is microseconds in the observed wrappers (16 digits); 13 digits is read as milliseconds. Returns an ISO string or null.
function expiryOf(ust) {
  const n = Number(ust); if (!Number.isFinite(n) || n <= 0) return null;
  const ms = String(ust).length >= 16 ? Math.floor(n / 1000) : String(ust).length >= 13 ? n : n * 1000;
  const d = new Date(ms); return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// u: one URL token. kind 'not_wrapper' | 'wrapper'; for a wrapper: ok + destination + expires_at, or ok:false + code.
function parseGoogleWrapper(u) {
  const s = String(u || '');
  if (!GOOGLE_REDIRECT_LIKE.test(s)) return { kind: 'not_wrapper' };
  const m = WRAP_RE.exec(s);
  if (!m) return { kind: 'wrapper', ok: false, code: 'WRAPPER_MALFORMED' };
  let dest; try { dest = decodeURIComponent(m[1]); } catch (e) { return { kind: 'wrapper', ok: false, code: 'WRAPPER_DESTINATION_UNDECODABLE' }; }
  if (GOOGLE_REDIRECT_LIKE.test(dest)) return { kind: 'wrapper', ok: false, code: 'WRAPPER_NESTED' };
  let parsed; try { parsed = new URL(dest); } catch (e) { return { kind: 'wrapper', ok: false, code: 'WRAPPER_DESTINATION_INVALID' }; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { kind: 'wrapper', ok: false, code: 'WRAPPER_DESTINATION_INVALID' };
  return { kind: 'wrapper', ok: true, destination: dest, ust: m[2], expires_at: expiryOf(m[2]) };
}

// delivered: the delivered plain-text body; canonical: URLs of the validated stored draft (in order).
// Canonical URL equality (destination === canonical, exact string) is reported separately from the delivered representation (plain | google_wrapper).
function verifyDeliveredUrls(delivered, canonical) {
  const canon = Array.isArray(canonical) ? canonical : [];
  const codes = new Set(); const items = [];
  for (const u of extractUrls(delivered)) {
    const w = parseGoogleWrapper(u);
    if (w.kind === 'wrapper') {
      if (!w.ok) { codes.add(w.code); items.push({ delivered: u, representation: 'google_wrapper', destination: null, code: w.code }); }
      else items.push({ delivered: u, representation: 'google_wrapper', destination: w.destination, expires_at: w.expires_at });
    } else items.push({ delivered: u, representation: 'plain', destination: u });
  }
  if (items.length !== canon.length) codes.add('URL_COUNT_MISMATCH');
  items.forEach((it, i) => {
    it.canonical = canon[i] === undefined ? null : canon[i];
    it.canonical_match = it.destination !== null && it.canonical !== null && it.destination === it.canonical;
    if (it.destination !== null && !it.canonical_match && it.canonical !== null) codes.add('URL_DESTINATION_MISMATCH');
  });
  const expiries = items.map((i) => i.expires_at).filter(Boolean).sort();
  return { ok: codes.size === 0 && items.every((i) => i.canonical_match), codes: [...codes], items, wrapper_expires_at: expiries.length ? expiries[0] : null,
    note: 'A verified destination is evidence at the time of reading only; the wrapper may expire (ust) and its later behaviour is not verified.' };
}

// Replaces only valid wrappers by their destination (comparison text only; the stored draft is never changed). Malformed wrappers stay as they are.
function unwrapGoogleLinks(text) {
  return String(text == null ? '' : text).replace(/https?:\/\/[^\s<>"]+/gi, (tok) => {
    const core = tok.replace(TRAILING, ''); const tail = tok.slice(core.length); const w = parseGoogleWrapper(core);
    return w.kind === 'wrapper' && w.ok ? w.destination + tail : tok;
  });
}

const wrapperExpired = (expiresAt, nowIso) => !expiresAt || !(Date.parse(expiresAt) > Date.parse(nowIso));

module.exports = { extractUrls, expiryOf, parseGoogleWrapper, verifyDeliveredUrls, unwrapGoogleLinks, wrapperExpired };
