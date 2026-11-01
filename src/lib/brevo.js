'use strict';
// Brevo transactional email adapter (Phase 4, D-060). Pure module: `fetch` and the environment are injected, so tests use mocked HTTP and
// this file never reads process.env, never opens a socket by itself, and never logs or returns the API key.
// API (official docs, read 2026-11-01): POST https://api.brevo.com/v3/smtp/email, header `api-key`; 201 -> {"messageId":"<...@...>"}.
// Facts from the docs that shape this adapter: htmlContent is required without a template (so the plain-text draft also gets a deterministic HTML
// twin); no per-request option disables click tracking or link rewriting (so sending is gated on an explicit confirmation); the list endpoint
// returns no body (so reconciliation reads each candidate); the webhook `message-id` has no angle brackets, the API `messageId` does.
// Safety rules: exactly one recipient; the approved sender only, and only once it is confirmed verified in Brevo; the stored subject and body
// are sent unchanged; NEVER an automatic retry; only an HTTP answer that proves no message was created is "definite" (err.definite = true);
// timeouts, 5xx, a 2xx without a message ID and anything unexpected are uncertain and go to reconciliation or a human.

const N = require('./normalize');

const API_BASE = 'https://api.brevo.com/v3';
// Statuses after which Brevo has certainly not accepted the message (request rejected). 408 and every 5xx are NOT in this set.
const DEFINITE_STATUS = new Set([400, 401, 402, 403, 404, 405, 406, 409, 410, 413, 415, 422, 429]);

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Deterministic HTML twin of the plain text: escape, then newlines -> <br>. No anchors are created (a link would invite rewriting).
const plainToHtml = (text) => '<div>' + escapeHtml(text).replace(/\r?\n/g, '<br>') + '</div>';
// Inverse for our own HTML (and tolerant of wrappers/pixels a provider may add): used when a stored message is read back for reconciliation.
const htmlToPlain = (html) => String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const stripAngles = (id) => String(id == null ? '' : id).trim().replace(/^<|>$/g, '');

function fail(code, definite, extra) {
  const e = new Error(code); e.code = code; e.definite = definite === true; e.provider = 'brevo'; Object.assign(e, extra || {}); return e;
}

// env: { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME? }; cfg: { approved_sender_email, sender_verified_in_brevo, link_tracking_disabled_confirmed, api_base? }
// Returns the list of reasons the adapter must NOT make a request (empty = ready).
function readiness(env, cfg) {
  const e = env || {}; const c = cfg || {}; const bad = [];
  if (typeof e.BREVO_API_KEY !== 'string' || !e.BREVO_API_KEY.trim() || /\s/.test(e.BREVO_API_KEY.trim())) bad.push('MISSING_API_KEY');
  if (!e.BREVO_SENDER_EMAIL) bad.push('SENDER_EMAIL_MISSING');
  else if (!c.approved_sender_email || N.normalizeEmail(e.BREVO_SENDER_EMAIL).value !== N.normalizeEmail(c.approved_sender_email).value) bad.push('SENDER_NOT_APPROVED');
  if (c.approved_sender_name !== undefined && e.BREVO_SENDER_NAME !== c.approved_sender_name) bad.push('SENDER_NAME_NOT_APPROVED');   // only enforced once a name is on record
  if (c.sender_verified_in_brevo !== true) bad.push('SENDER_NOT_VERIFIED_IN_BREVO');
  if (c.link_tracking_disabled_confirmed !== true) bad.push('LINK_TRACKING_NOT_CONFIRMED_OFF');
  if (c.api_base !== undefined && c.api_base !== API_BASE) bad.push('API_BASE_NOT_BREVO');   // the key is only ever sent to api.brevo.com
  return bad;
}

// req: neutral request {to:[email], subject, body, htmlBody?}; meta: {sendKey}. Returns the exact JSON payload; throws on any rule breach.
function buildPayload(req, env, meta) {
  const r = req || {};
  if (r.cc && r.cc.length || r.bcc && r.bcc.length) throw fail('CC_BCC_NOT_ALLOWED', true);
  if (!Array.isArray(r.to) || r.to.length !== 1) throw fail('EXACTLY_ONE_RECIPIENT_REQUIRED', true);
  const to = N.normalizeEmail(r.to[0]);
  if (!to.valid) throw fail('INVALID_RECIPIENT', true);
  if (!r.subject || !String(r.subject).trim() || !r.body || !String(r.body).trim()) throw fail('EMPTY_SUBJECT_OR_BODY', true);
  const sender = { email: N.normalizeEmail(env.BREVO_SENDER_EMAIL).value };
  if (env.BREVO_SENDER_NAME) sender.name = String(env.BREVO_SENDER_NAME);
  // contactPixelTrackingConsent:false = Brevo must not track opens or clicks for this recipient (per-contact consent mechanism, Brevo help article read 2026-11-02, D-063).
  // Unproven until a raw delivered message shows original links, no pixel and no tracked unsubscribe link; link_tracking_disabled_confirmed stays the send gate.
  const payload = { sender, to: [{ email: to.value, contactPixelTrackingConsent: false }], subject: r.subject, textContent: r.body, htmlContent: r.htmlBody || plainToHtml(r.body) };
  if (meta && meta.sendKey) payload.tags = [String(meta.sendKey)];   // Brevo-side metadata, not part of the email; lets the log be matched later
  return payload;
}

function createClient(opts) {
  const o = opts || {}; const doFetch = o.fetch; const env = o.env || {}; const cfg = o.config || {}; const timeoutMs = o.timeoutMs || 15000;
  const meta = new Map();   // uuid -> messageId, filled by search() for read()

  async function call(method, path, body) {
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await doFetch(API_BASE + path, { method, headers: { 'api-key': env.BREVO_API_KEY.trim(), accept: 'application/json', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: ac.signal });
    } finally { clearTimeout(timer); }
  }
  const json = async (res) => { try { return await res.json(); } catch (e) { return null; } };

  return {
    name: 'brevo',
    readiness: () => readiness(env, cfg),

    // Sends exactly once. Never retries. Throws err.definite === true only when Brevo certainly did not accept the message.
    async send(req, m) {
      const bad = readiness(env, cfg); if (bad.length) throw fail(bad[0], true, { reasons: bad });
      const payload = buildPayload(req, env, m);
      let res;
      try { res = await call('POST', '/smtp/email', payload); }
      catch (e) { throw fail((e && e.name === 'AbortError') ? 'TIMEOUT' : 'NETWORK_ERROR', false); }   // the request may have reached Brevo
      const status = res && res.status;
      if (status === 201 || status === 200) {
        const b = await json(res);
        const id = b && typeof b.messageId === 'string' ? stripAngles(b.messageId) : '';
        if (!id) throw fail('NO_MESSAGE_ID_IN_SUCCESS_RESPONSE', false);   // accepted-looking but unconfirmed: uncertain
        return { id, provider_message_id: b.messageId, threadId: undefined };
      }
      if (status === 202) throw fail('UNEXPECTED_202_SCHEDULED_RESPONSE', false);   // we never schedule; do not assume anything
      if (DEFINITE_STATUS.has(status)) {
        const b = await json(res); const code = status === 429 ? 'RATE_LIMITED' : status === 401 ? 'AUTHENTICATION_FAILED' : 'HTTP_' + status;
        const reset = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-sib-ratelimit-reset') : null;
        throw fail(code, true, { status, provider_code: b && typeof b.code === 'string' ? b.code : undefined, retry_after_seconds: reset ? Number(reset) : undefined });
      }
      throw fail('HTTP_' + status + '_OUTCOME_UNCERTAIN', false);   // 408, 5xx, anything unexpected
    },

    // Read-only connectivity check (D-061): GET /account, no body, no side effects. Never throws and never retries; the result holds codes only
    // (no account data, no key). It needs only a usable key and the Brevo base URL, not the sender or tracking gates, because it sends nothing.
    async checkConnectivity() {
      const bad = readiness(env, cfg).filter((x) => x === 'MISSING_API_KEY' || x === 'API_BASE_NOT_BREVO'); if (bad.length) return { ok: false, status: null, code: bad[0], request_made: false };
      let res;
      try { res = await call('GET', '/account'); }
      catch (e) { return { ok: false, status: null, code: (e && e.name === 'AbortError') ? 'TIMEOUT' : 'NETWORK_ERROR', request_made: true }; }
      const status = res && res.status;
      if (status === 200) return { ok: true, status, code: 'CONNECTED', request_made: true };
      return { ok: false, status: typeof status === 'number' ? status : null, code: status === 401 ? 'AUTHENTICATION_FAILED' : status === 429 ? 'RATE_LIMITED' : 'HTTP_' + status, request_made: true };
    },

    // Reconciliation support (GET /smtp/emails needs email + a date window of at most one month; the list has no body).
    buildQuery(attempt) {
      const t0 = Date.parse(attempt.started_at); const day = (ms) => new Date(ms).toISOString().slice(0, 10);
      return { email: N.normalizeEmail(attempt.recipient).value, startDate: day(t0 - 86400000), endDate: day(t0 + 86400000) };
    },
    async search(q) {
      const bad = readiness(env, cfg).filter((x) => x === 'MISSING_API_KEY' || x === 'API_BASE_NOT_BREVO'); if (bad.length) throw fail(bad[0], true);
      const qs = `email=${encodeURIComponent(q.email)}&startDate=${q.startDate}&endDate=${q.endDate}&sort=desc&limit=50`;
      const res = await call('GET', '/smtp/emails?' + qs); if (!res || res.status !== 200) throw fail('SEARCH_HTTP_' + (res && res.status), false);
      const b = await json(res); const list = (b && b.transactionalEmails) || [];
      return list.filter((x) => x && x.uuid).map((x) => { meta.set(x.uuid, { messageId: stripAngles(x.messageId), subject: x.subject, email: x.email, date: x.date }); return { id: x.uuid }; });
    },
    async read(uuid) {
      const res = await call('GET', '/smtp/emails/' + encodeURIComponent(uuid)); if (!res || res.status !== 200) throw fail('READ_HTTP_' + (res && res.status), false);
      const b = await json(res) || {}; const m = meta.get(uuid) || {};
      return { id: m.messageId || '', subject: b.subject || m.subject, to: b.email || m.email, date: b.date || m.date, body: b.body == null ? undefined : htmlToPlain(b.body) };
    },
  };
}

module.exports = { API_BASE, DEFINITE_STATUS, plainToHtml, htmlToPlain, escapeHtml, stripAngles, readiness, buildPayload, createClient };
