# Email Validation Rules

Status: **Approved design.** Numeric limits are proposals pending OD-09.

An email is sent only if **every** check passes. In the MVP all issues are blocking. Validation produces `validation_outcome` (`PASS`/`FAIL`) and `validation_issue_codes`. A failure → `SKIPPED` with `VALIDATION_FAILED`. Optional single regeneration on failure is OD-13 (default: none).

Validation runs in two layers, deterministic first (cheap, certain), then semantic (LLM, using the `email-validation` skill). The semantic layer receives the draft, the `AnalysisResult` and the `CustomerSummary` — never just the email alone.

## 1. Outcome categories (the core distinction)

Every analysed item has exactly one category. The email must preserve it.

| Category | Definition | Allowed email phrasing | Forbidden |
|---|---|---|---|
| `discussed` | Topic raised; no guidance or outcome | "We talked about…", "You mentioned…" | Implying it was solved or explained |
| `explained` | Support gave information, guidance or steps; not confirmed done | "We walked through…", "As explained, you can…" | "We fixed", "resolved", "done" |
| `completed` | Action finished during the call **and** confirmed in the transcript | "We resolved…", "…is now working" | Using it without transcript confirmation |
| `pending_customer_action` | The customer agreed or was asked to do something after the call | "Your next steps: …" | Attributing it to support; turning it into a demand not made on the call |
| `pending_support_action` | FlexiFunnels/support committed to do something after the call | "Our team will…" | Inventing a deadline; presenting as done; assigning to the customer |

Timelines may appear only if stated in the transcript, and only as stated.

## 2. Deterministic checks (explicit checklist steps)

Applied by the scheduled session as literal checklist steps (or by a helper if OD-38 allows one), never as free-form judgement. Each check is pass/fail against exact values (D-026).

| Code | Check |
|---|---|
| `FATHOM_URL_MISSING` | Body contains **every** URL in `fathom_urls`, exactly as parsed (one call may have several recording segments, D-025) |
| `FATHOM_URL_MISMATCH` | No Fathom URL other than those in `fathom_urls`; none modified; none repeated |
| `RECORDING_ORDER_MISMATCH` | The URLs appear in the body in the same order as in `fathom_urls` |
| `RECORDING_SEGMENT_LABELS_MISSING` | When `recording_count > 1`: each URL sits on its own line labelled `Part 1`, `Part 2`, … in order. When `recording_count = 1`: no `Part` label is used |
| `RECIPIENT_MISMATCH` | `To` equals the source `customer_email` exactly (single recipient) |
| `NAME_MISMATCH` | Greeting uses the customer's first name as derived from `customer_name` |
| `SUBJECT_INVALID` | Subject present, 20–90 characters (proposal), no placeholders, no ALL CAPS, no emoji |
| `LENGTH_OUT_OF_RANGE` | Body 80–250 words (proposal) excluding signature |
| `PLACEHOLDER_PRESENT` | No `[`…`]`, `{{`, `}}`, `<name>`, `TBD`, `XXX`, `Lorem` |
| `BANNED_PHRASE` | None of the configured banned phrases (e.g. "as an AI", "I hope this email finds you well", "guarantee", "100%") |
| `UNAPPROVED_LINK` | Only the call's Fathom URLs and configured allowlisted URLs (e.g. help centre) |
| `UNAPPROVED_CONTACT_DETAIL` | No phone numbers or email addresses other than configured support contacts |
| `SIGNATURE_MISSING` | Configured signature block present |
| `FORMAT_INVALID` | Plain text, UTF-8, no markdown syntax (`**`, `#`), no HTML (unless OD-09 chooses HTML) |

## 3. Semantic checks (LLM validator + cross-reference)

| Code | Check |
|---|---|
| `UNSUPPORTED_CLAIM` | A statement in the email has no matching analysis item / transcript evidence |
| `STATUS_MISREPRESENTED` | An item's category is changed (e.g. `explained` or pending presented as `completed`; `discussed` presented as `explained`) |
| `OWNER_MISATTRIBUTED` | A customer action presented as a support action or vice versa |
| `PENDING_ACTION_OMITTED` | Any `pending_customer_action` or `pending_support_action` from the summary is missing |
| `INVENTED_COMMITMENT` | Deadline, refund, discount, credit, feature, escalation or promise not stated in the transcript |
| `TONE_INAPPROPRIATE` | Defensive, blaming, dismissive, over-familiar, or ignoring clear frustration |
| `INTERNAL_INFO_LEAKED` | Internal notes, tooling names, other customers, staff-only remarks |
| `OFF_TOPIC_CONTENT` | Marketing, upsell or content unrelated to the call |
| `LANGUAGE_MISMATCH` | Language differs from policy (OD-08) |
| `INSTRUCTION_INJECTION_FOLLOWED` | Email reflects instructions embedded in the transcript rather than the conversation |
| `SEGMENTS_NOT_EXPLAINED` | `recording_count > 1` but the email does not say, naturally and briefly, that the call continued across several recordings, or implies they are separate calls |

Cross-reference (code, using the generator's `referenced_item_ids`): every pending item ID must be referenced; no referenced ID may be unknown. This backs up `PENDING_ACTION_OMITTED` and `UNSUPPORTED_CLAIM` without relying only on the LLM.

## 4. Validator output contract

See `skills/email-validation/SKILL.md`. Summary:

```json
{
  "outcome": "PASS | FAIL",
  "issues": [
    {"code": "STATUS_MISREPRESENTED", "item_id": "I3", "email_excerpt": "…", "explanation": "…"}
  ],
  "checked_item_ids": ["I1", "I2", "I3"]
}
```

`outcome` is recomputed by the runbook rule, not taken from the validator's own verdict: `FAIL` if any deterministic or semantic issue exists. Because the validator runs in the same session as the generator (OD-40), the deterministic checklist is the stronger gate.

## 5. Policy configuration

Lengths, banned phrases, allowlisted links/contacts, signature and language live in `config/` (email policy), not in skills, so the support team can adjust them by editing configuration only. The email-generation and email-validation skills receive the same policy values at runtime.
