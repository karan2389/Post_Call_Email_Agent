'use strict';
// Unit tests for the Phase 4 sending state machine, send identity, draft versioning, pre-send checks and reconciliation (D-049).
// Synthetic data only (@example.com). No network, no Gmail, no spreadsheet. Run: node tests/unit/phase4.test.js
const assert = require('assert');
const S = require('../../src/lib/sendstate');

let n = 0;
const t = (name, fn) => { fn(); n += 1; };
const SUBJ = 'Follow-up from your call'; const BODY = 'Hi Test,\nThanks for your time.\nRegards';
const mk = (o) => Object.assign({
  state: 'READY_TO_SEND', stored: true, stored_recipient: 'Customer@Example.com', stored_subject: SUBJ, stored_body: BODY, validation_status: 'PASSED',
  validated_draft_hash: S.draftHash('customer@example.com', SUBJ, BODY), source_email: 'customer@example.com', send_key: 'send_x',
  auto_send_eligible: true, sensitive_review_required: false,
}, o || {});
const live = { delivery_mode: 'live', live_authorized: true };

t('valid and invalid transitions', () => {
  assert.ok(S.canTransition('STORED', 'READY_TO_SEND'));
  assert.ok(!S.canTransition('VALIDATION_FAILED', 'READY_TO_SEND'));
  assert.ok(!S.canTransition('REVIEW_REQUIRED', 'SEND_IN_PROGRESS'));
  assert.ok(!S.canTransition('SENT', 'SEND_IN_PROGRESS'));
  assert.ok(!S.canTransition('SENT', 'READY_TO_SEND'));
  assert.ok(!S.canTransition('SEND_OUTCOME_UNKNOWN', 'READY_TO_SEND'));   // an uncertain send never goes straight back
  assert.ok(!S.canTransition('SEND_OUTCOME_UNKNOWN', 'SEND_IN_PROGRESS'));
  S.STATES.forEach((s) => assert.ok(s in S.TRANSITIONS));
  assert.deepStrictEqual(S.TRANSITIONS.SENT, []); assert.deepStrictEqual(S.TRANSITIONS.SKIPPED, []);
});
t('READY_TO_SEND needs a validated stored draft; failed or review records cannot reach it', () => {
  assert.strictEqual(S.transition({ state: 'STORED', validation_status: 'FAILED', stored: true }, 'READY_TO_SEND').ok, false);
  assert.strictEqual(S.transition({ state: 'STORED', validation_status: 'PASSED', stored: false }, 'READY_TO_SEND').code, 'NOT_VALIDATED_AND_STORED');
  assert.strictEqual(S.transition({ state: 'STORED', validation_status: 'PASSED', stored: true }, 'READY_TO_SEND').ok, true);
  assert.strictEqual(S.transition({ state: 'REVIEW_REQUIRED' }, 'READY_TO_SEND', { actor: 'agent', reason: 'x' }).code, 'HUMAN_REASON_REQUIRED');
  assert.strictEqual(S.transition({ state: 'REVIEW_REQUIRED' }, 'READY_TO_SEND', { actor: 'human:Lead', reason: 'reviewed' }).ok, true);
  assert.strictEqual(S.transition({ state: 'VALIDATION_FAILED' }, 'READY_TO_SEND', { actor: 'human:Lead', reason: 'x' }).code, 'INVALID_TRANSITION');
});
t('SENT requires a message id and writes an audit event', () => {
  assert.strictEqual(S.transition({ state: 'SEND_IN_PROGRESS' }, 'SENT').code, 'MESSAGE_ID_REQUIRED');
  const r = S.transition({ state: 'SEND_IN_PROGRESS', send_key: 'k', draft_hash: 'h' }, 'SENT', { gmail_message_id: 'm1', at: '2026-11-02T09:00:00+05:30' });
  assert.ok(r.ok); assert.deepStrictEqual([r.event.from, r.event.to, r.event.gmail_message_id, r.event.draft_hash], ['SEND_IN_PROGRESS', 'SENT', 'm1', 'h']);
});
t('send key is stable per call and independent of the draft; draft hash changes with any text change', () => {
  const k = S.sendKey('2026-10-30|11:00|a@example.com', 'u1');
  assert.strictEqual(k, S.sendKey('2026-10-30|11:00|a@example.com', 'u1'));
  assert.notStrictEqual(k, S.sendKey('2026-10-30|12:00|a@example.com', 'u1'));
  assert.notStrictEqual(k, S.sendKey('2026-10-30|11:00|a@example.com', 'u2'));
  assert.strictEqual(S.sendKey('', 'u1'), null);
  assert.strictEqual(S.draftHash('A@Example.com', SUBJ, BODY), S.draftHash('a@example.com', SUBJ, BODY));   // recipient case is normalised
  assert.notStrictEqual(S.draftHash('a@example.com', SUBJ, BODY), S.draftHash('a@example.com', SUBJ, BODY + ' '));
});
t('pre-send: a fully valid record in live mode passes; dry_run and shadow never send', () => {
  assert.deepStrictEqual(S.preSendChecks(mk(), live), { ok: true, failed: [] });
  ['dry_run', 'shadow', undefined].forEach((m) => assert.ok(S.preSendChecks(mk(), { delivery_mode: m, live_authorized: true }).failed.includes('MODE_DOES_NOT_PERMIT_SEND')));
  assert.ok(S.preSendChecks(mk(), { delivery_mode: 'live' }).failed.includes('LIVE_NOT_AUTHORIZED'));
  assert.ok(S.preSendChecks(mk(), Object.assign({ pilot_limit: 3, pilot_sent_today: 3 }, live)).failed.includes('PILOT_LIMIT_REACHED'));
});
t('pre-send: each of the ten conditions blocks on its own', () => {
  const f = (o, c) => S.preSendChecks(mk(o), c || live).failed;
  assert.ok(f({ stored: false }).includes('DRAFT_NOT_STORED_OR_EMPTY'));
  assert.ok(f({ stored_body: '' }).includes('DRAFT_NOT_STORED_OR_EMPTY'));
  assert.ok(f({ validation_status: 'FAILED' }).includes('VALIDATION_NOT_PASSED'));
  assert.ok(f({ stored_recipient: 'not-an-email' }).includes('RECIPIENT_INVALID'));
  assert.ok(f({ source_email: 'other@example.com' }).includes('RECIPIENT_MISMATCH'));
  assert.ok(f({ auto_send_eligible: false }).includes('NOT_AUTO_SEND_ELIGIBLE'));
  assert.ok(f({ sensitive_review_required: true }).includes('SENSITIVE_REVIEW_REQUIRED'));
  assert.ok(f({ sent_message_id: 'm1' }).includes('ALREADY_SENT'));
  assert.ok(f({ open_attempt: true }).includes('UNRESOLVED_SEND_ATTEMPT'));
  assert.ok(f({ state: 'RECONCILIATION_REQUIRED' }).includes('UNRESOLVED_SEND_ATTEMPT'));
  assert.ok(f({ stored_body: BODY + '!' }).includes('STORED_DRAFT_DIFFERS_FROM_VALIDATED'));
});
t('a changed draft never triggers another email; a resend needs an explicit authorisation bound to that draft version', () => {
  const sentHash = S.draftHash('customer@example.com', SUBJ, BODY);
  const edited = mk({ state: 'SENT', sent_message_id: 'm1', sent_draft_hash: sentHash, stored_body: BODY + ' edited', validated_draft_hash: S.draftHash('customer@example.com', SUBJ, BODY + ' edited') });
  const r = S.preSendChecks(edited, live); assert.strictEqual(r.ok, false); assert.ok(r.failed.includes('DRAFT_CHANGED_AFTER_SEND') && r.failed.includes('ALREADY_SENT'));
  const h = S.draftHash('customer@example.com', SUBJ, BODY + ' edited');
  const wrong = S.preSendChecks(edited, Object.assign({ resend_authorization: { reason: 'typo', authorized_by: 'Lead', send_key: 'send_x', draft_hash: 'other' } }, live));
  assert.ok(wrong.failed.includes('ALREADY_SENT'));
  const good = S.preSendChecks(edited, Object.assign({ resend_authorization: { reason: 'typo', authorized_by: 'Lead', send_key: 'send_x', draft_hash: h } }, live));
  assert.ok(good.failed.includes('RESEND_AUTHORISED_EXPLICITLY')); assert.ok(!good.failed.includes('ALREADY_SENT'));
  assert.strictEqual(good.ok, false);   // an authorised resend is never passed automatically: the DRAFT_CHANGED_AFTER_SEND block remains until a human re-opens the record
});
t('test mode reaches only approved internal recipients', () => {
  const c = { delivery_mode: 'test', internal_recipients: ['Qa@Example.com'] };
  assert.ok(S.preSendChecks(mk(), c).failed.includes('TEST_RECIPIENT_NOT_APPROVED'));
  assert.strictEqual(S.preSendChecks(mk({ stored_recipient: 'qa@example.com', source_email: 'qa@example.com', validated_draft_hash: S.draftHash('qa@example.com', SUBJ, BODY) }), c).ok, true);
  assert.ok(S.preSendChecks(mk(), { delivery_mode: 'test' }).failed.includes('TEST_RECIPIENT_NOT_APPROVED'));
});
t('reconciliation: only one clearly matching message establishes SENT; everything else goes to a human, never to a retry', () => {
  const attempt = { recipient: 'customer@example.com', subject: SUBJ, started_at: '2026-11-02T09:00:00+05:30', body_hash: 'bh' };
  const m = (o) => Object.assign({ id: 'g1', subject: SUBJ, to: 'Customer@example.com', date: '2026-11-02T09:00:20+05:30', body_hash: 'bh' }, o || {});
  assert.deepStrictEqual(S.reconcile(attempt, [m()]), { outcome: 'SENT', code: 'MATCHED_SENT_MESSAGE', gmail_message_id: 'g1' });
  assert.strictEqual(S.reconcile(attempt, [m(), m({ id: 'g2' })]).code, 'MULTIPLE_MATCHES');
  assert.strictEqual(S.reconcile(attempt, [m({ body_hash: 'zz' })]).code, 'BODY_MISMATCH');
  assert.strictEqual(S.reconcile(attempt, [m({ body_hash: undefined })]).code, 'BODY_NOT_VERIFIED');
  assert.strictEqual(S.reconcile(attempt, []).code, 'NO_EVIDENCE_FOUND');
  assert.strictEqual(S.reconcile(attempt, [m({ to: 'other@example.com' })]).code, 'NO_MATCH_OTHER_MAIL_PRESENT');
  assert.strictEqual(S.reconcile(attempt, [m({ date: '2026-11-01T09:00:00+05:30' })]).outcome, 'RECONCILIATION_REQUIRED');   // earlier mail is not this send
  assert.strictEqual(S.reconcile(attempt, [m({ subject: 'Other' })]).outcome, 'RECONCILIATION_REQUIRED');
  assert.strictEqual(S.reconcile(attempt, null).outcome, 'RECONCILIATION_REQUIRED');
});
t('human resolution of RECONCILIATION_REQUIRED needs a name and reason; "sent" needs a message id', () => {
  const rec = { state: 'RECONCILIATION_REQUIRED', send_key: 'k' };
  assert.strictEqual(S.resolveReconciliation(rec, { verdict: 'not_sent' }).code, 'HUMAN_REASON_REQUIRED');
  assert.strictEqual(S.resolveReconciliation(rec, { verdict: 'sent', by: 'Lead', reason: 'seen in Sent' }).code, 'MESSAGE_ID_REQUIRED');
  assert.ok(S.resolveReconciliation(rec, { verdict: 'sent', by: 'Lead', reason: 'seen in Sent', gmail_message_id: 'g9' }).ok);
  assert.ok(S.resolveReconciliation(rec, { verdict: 'not_sent', by: 'Lead', reason: 'checked Sent; nothing' }).ok);
  assert.strictEqual(S.resolveReconciliation(rec, { verdict: 'maybe', by: 'Lead', reason: 'x' }).code, 'UNKNOWN_VERDICT');
  assert.strictEqual(S.resolveReconciliation({ state: 'SENT' }, { verdict: 'not_sent', by: 'Lead', reason: 'x' }).ok, false);
});
console.log(`phase4 sending logic: ${n} test groups passed`);
