---
name: email-generation
version: 1.6.0
stage: generation
output_schema: EmailDraft
---

# Personalised Email Generation

## Objective

Write a concise, personalised, plain-text follow-up email to the customer after their FlexiFunnels support call. The email is written **to** the customer **from** FlexiFunnels support and is centred on the customer: what they came for, what is resolved, what they need to do, what we will do, and where to rewatch the call (one or more Fathom recording links — an extended call can be recorded in several segments). The email must be fully faithful to the `CustomerSummary`. (Interpretation of "customer's perspective" is a working assumption — OD-05.)

## Inputs

- `<summary>`: `CustomerSummary/1` JSON.
- `<recipient>`: `customer_first_name`.
- `<recordings>`: `fathom_urls` — an ordered list of one or more recording segments of the **same** call. Insert every URL exactly as given, in the given order.
- `<sender>`: `support_agent_first_name` (may be empty), `signature_block`.
- `<policy>`: `min_words`, `preferred_max_words`, `permitted_max_words`, `human_review_above_words`, the relative-timeline policy, `subject_template`, `language`, `allowed_links`, `banned_phrases`.

The customer's email address is not provided; the runtime sets the recipient.

## Instructions

1. **Subject:** follow `subject_template` (default: `Follow-up on your FlexiFunnels support call – {primary_topic}`), 20–90 characters, sentence case, no emoji. In `neutral_fallback` mode (no topic) use `Follow-up on your FlexiFunnels support call` without a topic part.
2. **Greeting:** `Hi {customer_first_name},`
2a. **Mode (D-044).** Read `summary.mode`. `full` and `conservative`: write the email as described below, using only what the summary states (in `conservative`, wording is cautious and nothing uncertain appears). `neutral_fallback`: write a short neutral follow-up instead (about 40–80 words): the greeting; a thank-you for attending the support call; one sentence inviting them to reply with any remaining questions or if they need further help; the recording line; the close and signature. It states **nothing** about what was discussed, done, resolved or pending, gives no timeline and no instruction. Set `mode` in the output. A difficult transcript gives a more conservative email, never no email.
3. **Opening (1–2 sentences):** a natural, professional opening paragraph, not a template. Thank them for their time or for speaking with us, and say in plain words what they came to us about, from their point of view ("You came to us about…", "We spoke about…", "You reached out because…"; choose the wording that reads best for this call). It restates `call_purpose` and adds nothing to it. If `tone_guidance` is `acknowledge_and_reassure`, acknowledge the inconvenience once, sincerely and briefly, in its own short sentence. Do not open with "I hope", do not repeat the subject line word for word, and do not list every topic when the summary has many: name the main ones.
4. **What we completed during the call** — only if `resolved` is non-empty; one bullet per completed action, crediting the party the summary names. Heading e.g. `What we completed during the call:` or `What's now working:` (`What we resolved:` is also acceptable). Use a "done" heading only for `resolved` entries.
5. **What we discussed or demonstrated** — only if `covered` is non-empty and useful. Heading e.g. `What we discussed:` or `What we went through:`. These entries are guidance or demonstration: they carry **no** completion and no "open" wording unless the summary entry itself says the issue is unresolved (see Rules, "Status words").
6. **What you need to do next** — only if `customer_next_steps` is non-empty; a short numbered list of clear actions, each starting with a verb; timelines only as given. Customer-owned follow-ups the summary lists (for example buying a domain) belong here, not inside a covered bullet. Heading e.g. `What you need to do next:` or `Your next steps:`.
7. **What we'll do next** — only if `support_next_steps` is non-empty; timelines only as given; without a timeline, say what will happen without implying when.

   Headings are guidance, not a fixed template: pick the label that is accurate for this email (never a "done" label for pending, unresolved or merely explained content) and use one consistent set of labels in an email. Do not force every section into every email. Section meaning, order and `sections_included` values do not change.
8. **Recording:**
   - One URL: one line, e.g. `You can rewatch our call here: {url}`. No "Part" label.
   - Two or more URLs: one short sentence saying the call continued across several recordings, then one line per segment in the given order, labelled `Part 1:`, `Part 2:`, … For example:
     `Our call continued across two recordings, so here are both parts in order:`
     `Part 1: {url_1}`
     `Part 2: {url_2}`
   - Always one email, never one email per recording.
9. **Close:** one line inviting them to reply if anything is unclear. Then the `signature_block` exactly as provided.
10. Use short section labels in plain text (e.g. `What you can do next:`). No markdown, no HTML, no bold, no emoji.
11. Length follows the shared policy (`preferred_max_words` 250, `permitted_max_words` 350, review above 350; words counted as whitespace-separated tokens of the body excluding the signature, including greeting, labels, list markers and URLs; at least `min_words`). First remove repetition, filler and unnecessary explanations. Never omit an unresolved issue, an important completed action or a pending action only to meet the limit. Up to 250 is normal; 251–350 is allowed only when needed to keep important customer information; above 350 write the complete email anyway and set `length_status` to `review_required` (a human reviews it; it is not sent automatically).
12. List every summary entry you used in `referenced_item_ids` (union of their `source_item_ids`).
13. **Character encoding (UTF-8).** Everything you produce is Unicode text and must be saved as UTF-8, never in a platform-default encoding (for example Windows-1252 or the PowerShell/console default). When a file is written (`email.json`, `email.txt` or any other), choose UTF-8 explicitly. Preserve en dashes (–), em dashes (—), curly apostrophes and quotes, and any other Unicode character exactly as written, including Devanagari (Hindi) and Hinglish text when it appears (for example in a name or a quoted word). Never replace a character with a look-alike or an escape sequence and never leave garbled sequences such as "â€“" or "Ã". Before finishing, re-read the saved subject and body and confirm the dash in the subject and any apostrophes are intact. A subject or body with broken encoding fails the deterministic `FORMAT_INVALID` check and the email is not sent.
14. Output **only** the JSON object in the Output Schema.

## Rules

- Use only facts from the summary. Do not add tips, features, links, upsells, prices or general advice.
- Preserve every status: resolved stays resolved, covered stays guidance, pending stays pending with the same owner.
- Preserve who acted. A resolved statement credits the party the summary names ("you" when the customer performed the step, "we" when support did) and stays neutral when the summary is neutral. Never turn a customer-performed step into "we did it" or the reverse, and never mention an owner or a guide that the summary does not state.
- Timelines follow the call-date policy: use the summary's call-anchored `timeline` wording ("that evening", "the following day", "the morning after our call", "next week", "by Friday"), never bare "today", "tonight", "tomorrow" or "yesterday", never a calendar date. A customer's own timing is phrased as theirs ("You mentioned that you planned to…") and never as a commitment by us.
- Use only the summary. The opening sentence restates `call_purpose` and adds nothing to it (no extra symptom, error or cause). If the summary lists `analysis_gaps`, do not fill them.
- Never invent timelines, refunds, discounts, credits, escalations or guarantees. Avoid absolute words ("guarantee", "definitely", "100%").
- **Unresolved issues.** Say clearly and calmly what is still open and what happens next, in plain words ("We could not fix this during the call, so it is not resolved yet."), for issues the summary lists as unresolved, next to the facts about that issue (see "Status words"). Never soften it into something that sounds done, never repeat "not yet resolved" after every bullet, and never state a cause, reason or outcome the summary does not give. If the summary gives next steps for the issue, the open statement and the step sit together.
- **Natural language, same facts.** Write like a considerate colleague, not a form: vary sentence openings, combine two closely related facts from the same summary entry into one sentence, and avoid repeating the same phrase in every bullet (for example, "Following our guidance" at most once or twice in an email; a customer-performed step is still credited to "you", with or without it). Keep sentences short; explain only what the customer needs. Shortening or rephrasing must never remove a fact, change a status, swap an owner, or drop an unresolved issue or pending action.
- **Timeline phrasing.** Keep the meaning of the summary's `timeline`; make the words natural: "that evening" (add "after our call" only when it would otherwise be ambiguous; do not write both "that evening" and "the evening of our call"), "the next morning", "the day after our call", "next week", "by Friday". The customer's own timing reads "You mentioned you planned to do this that evening", never as our promise. No bare "today", "tonight", "tomorrow" or "yesterday", no calendar dates, no added urgency.
- **Four kinds of statements, never mixed up.** (1) *Completed during the call*: only a `resolved` entry. (2) *Explained or demonstrated*: a `covered` entry; we showed or described it, and nothing is said about whether it was done. (3) *Still to do by the customer*: only a `customer_next_steps` entry. (4) *Status cannot be established*: a `covered` entry the summary leaves without an outcome, or an item the summary or its `analysis_gaps` mark unclear. Never write an action as pending if the summary lists it as resolved; never write an action as completed because it was explained; for kind 4 say only what the summary says ("We went through how to set this up") and never imply an outcome. Do not assume that a page, form, domain, integration or link is configured, published or connected unless a `resolved` entry says so.
- **Status words.** "Still open", "not yet done" and "not resolved" may be used only for an issue or step the summary lists as pending or unresolved, and only in the bullet about that item; never on a `covered` entry that merely describes guidance. Use such a phrase at most once for each such issue (a call with three unresolved issues may use it three times, once in each issue's own bullet) and never repeat it for the same issue; put pending actions in the next-steps sections instead of annotating discussion bullets. When an unresolved issue has only a support or customer next step and no discussion bullet, the next-step bullet itself states what is open. If one sentence would contradict another (for example "once your page is published" when publishing is listed as completed), the email is inconsistent: rewrite it using only the summary's statuses.
- **Unclear outcomes never block the email (D-044).** If a status or detail cannot be established from the summary, leave it out or say only what the summary says ("We went through how to set this up"); never guess, and never state an outcome. List each unclear point in `caveats` (short, neutral, no customer data) for the reviewer; `caveats` is informational and never prevents a draft. Use only `medium`/`high` summary content; `omitted_item_ids` and `analysis_gaps` are never turned into statements.
- **Sensitive information.** Never reproduce passwords, authentication or verification codes, tokens, card or bank numbers, or unnecessary personal data, even if the summary contains them. Make no unsupported legal, financial, refund or security statement or commitment; where the summary mentions such a topic, keep the wording neutral and factual.- **Specific, not vague; no unsupported promises.** Describe the concrete action ("you added the affiliate links for the Pro and Supreme plans") instead of "we worked on your setup". Do not suggest that we will help again, follow up or fix anything unless a `support_next_steps` entry says so, and never turn a suggestion or an offer into a confirmed action.
- **No padding.** Never add filler, sentiment or wording that is not in the summary to reach a minimum length. When the summary has little content a short email (down to `min_words`) is correct. Do not chain "We showed… We also showed…" in a bullet; give each action its own short bullet or sentence and keep the email within the length policy by removing repetition, not facts.
- Include **all** `customer_next_steps` and `support_next_steps`.
- Include **every** URL in `fathom_urls` exactly once, unmodified, in the given order. Do not drop, merge, reorder or add recording links. No other links unless in `allowed_links` and present in the summary.
- Do not describe recording segments as separate calls or meetings.
- No placeholders (`[ ]`, `{{ }}`, `TBD`). If a required input is missing (including an empty `fathom_urls`), return `{"schema":"EmailDraft/1","error":"MISSING_INPUT","field":"<name>"}`.
- Do not mention AI, automation, transcripts, analysis, or internal tools/teams by internal names.
- Language per `policy.language` (MVP: English).
- Tone: warm, professional, concise, Indian-English friendly; no slang, no over-apologising, no blame on the customer.
- No customer personal data other than the first name.

## Output Schema

```json
{
  "schema": "EmailDraft/1",
  "subject": "string",
  "body_text": "plain text including signature, \\n line breaks",
  "word_count_excluding_signature": 0,
  "length_status": "within_preferred | above_preferred | review_required",
  "mode": "full | conservative | neutral_fallback",
  "caveats": [],
  "referenced_item_ids": ["I1", "I2"],
  "recording_urls_included": ["url_1", "url_2"],
  "sections_included": ["resolved", "covered", "customer_next_steps", "support_next_steps", "recording"]
}
```

`mode` copies the summary mode. `caveats` is `[]` or short neutral strings naming points that could not be established (informational; it never blocks a draft). All other fields are unchanged from 1.5.0.

## Examples

Synthetic, from the customer-summary example:

```
Subject: Follow-up on your FlexiFunnels support call – order bump and custom domain SSL

Hi Arjun,

Thank you for speaking with us. You came to us about getting the order bump onto your checkout page and making your custom domain show as secure, and I'm sorry the domain issue has held you up for so long. Here is everything in one place.

What's now working:
- Following our guidance, you enabled the order bump for your product, and you confirmed it now shows on your checkout page.

What we went through:
- We explained that the secure (SSL) certificate needs your domain's DNS to point to FlexiFunnels using a CNAME record.

What you can do next:
1. Add the CNAME record at your domain registrar (you mentioned you planned to do this that evening).

What we'll do next:
- Once your DNS update is in place, our team will re-issue your SSL certificate, within 24 hours of the update.

You can rewatch our call here: https://fathom.video/share/EXAMPLE-ONLY

If anything is unclear, just reply to this email.

Warm regards,
Riya
FlexiFunnels Support
```

Wrong (forbidden): "Your domain SSL is now fixed" (pending, not resolved); "Our team will sort this out by today" (invented timeline); "Check out our new templates!" (off-topic).

Synthetic two-segment recording block (replaces the single recording line):

```
Our call ran a little longer, so it was recorded in two parts. You can watch them in order here:
Part 1: https://fathom.video/share/EXAMPLE-ONLY-PART-1
Part 2: https://fathom.video/share/EXAMPLE-ONLY-PART-2
```

Wrong (forbidden): "Here are the recordings of our two calls" (segments are one call); listing Part 2 before Part 1; including only Part 1.

## Edge Cases

| Situation | Handling |
|---|---|
| `resolved` empty | Omit the section; do not say "we resolved", "sorted", "now working" or any other "done" wording anywhere |
| No next steps on either side | Omit both sections; still include recording and close |
| Support next step without timeline | "Our team will check X and get back to you." — no "soon", "today", "shortly" |
| Angry customer | One sincere acknowledgement; facts unchanged; no extra promises |
| Many items | First remove repetition, filler and unnecessary explanations; never drop an unresolved issue, important completed action or pending action; 251–350 words allowed when needed; above 350 set `length_status: review_required` |
| `support_agent_first_name` empty | Use the configured signature block only |
| Very long `primary_topic` | Shorten for the subject to fit 90 characters |
| Summary entry is guidance only (`covered`, no pending counterpart) | State what we explained; no completion wording and no "still open" |
| A step is `resolved` in the summary | Never also write it as pending; never contradict it elsewhere ("once your page is published") |
| Outcome of a main action cannot be established | Cautious wording only (say what was explained); list it in `caveats`; the draft is still produced |
| `summary.mode` is `neutral_fallback` | Short neutral thank-you with the recording link; no claim about content (see 2a); `mode: neutral_fallback` |
| Summary contains a password, code or token | Never reproduce it; neutral wording |
| Customer-owned follow-up in the summary (for example buying a domain) | List it under the customer next steps, not inside a discussion bullet |
| Missing `fathom_urls` or first name | Return `MISSING_INPUT` error object |
| Two or more recording URLs | One email; one sentence explaining the call continued across recordings; `Part n:` lines in the given order |
| Many segments (3+) | Same pattern ("across three recordings"); keep every link even if the email is long — shorten other wording instead |

## Expected Output

- Valid JSON matching `EmailDraft/1`.
- Subject and body pass every deterministic check in `docs/validation-rules.md` §2, including the length policy (≤250 normal, 251–350 permitted when needed, >350 flagged `review_required`; the `min_words` minimum (50) does not apply to `neutral_fallback`, whose minimum is `fallback_min_words`).
- `referenced_item_ids` covers every pending item in the summary and contains no unknown IDs.
- Body faithful to the summary: no status upgrades, owner swaps, invented commitments or extra content.
- Every URL in `fathom_urls` present exactly once, unmodified, in order; `Part n` labels when there is more than one; `recording_urls_included` equals `fathom_urls`.

## Changelog

- 1.6.0 (2026-11-01) — Coverage-first generation (D-044; refined after the focused tests: fallback subject without a topic, no padding to reach a minimum, a date the call itself states may be repeated, status words once per unresolved issue rather than once per email): `summary.mode` handling with a **neutral fallback** email for calls with nothing reliable (thank-you, invitation to reply, recording link, no content claims); unclear outcomes produce cautious wording and `caveats` instead of blocking (`review_flags`/`STATUS_UNCLEAR` retired); sensitive-information rule (no passwords, codes, tokens; no unsupported legal/financial/security commitments); 80-word minimum exempts `neutral_fallback`; output fields `mode` and `caveats`. **Not regression-tested before the focused tests of the same date.**
- 1.5.0 (2026-11-01) — Wording and status refinement after the first real-data draft review (D-041). Four distinct statement kinds (completed / explained / customer to do / status unclear) with explicit rules; "still open" wording only for pending or unresolved summary entries, once per email, never on guidance-only bullets; no contradictions between sections; one action and outcome per bullet; concrete wording and no unsupported promises of future help; customer-owned follow-ups under the customer next steps; optional `review_flags: ["STATUS_UNCLEAR"]` for unclear key outcomes; heading suggestions updated ("What we completed during the call", "What we discussed", "What you need to do next"); example rewritten. No change to ownership, recordings, UTF-8, length policy or validation. **Not regression-tested** (one real-data dry run only). Upstream cause noted, not changed here: guided on-screen actions can be classified `explained` by transcript-analysis/customer-summary when the transcript is garbled.
- 1.4.0 (2026-11-01) — Phase 2 final changes, **not regression-tested** (no runs by decision). (a) Instruction 13: explicit UTF-8 for every written file, never the platform default, preserve dashes, apostrophes, Devanagari and other Unicode, re-read the saved subject and body (guards the P2-10 run-1 broken subject; checked by the deterministic `FORMAT_INVALID` encoding check). (b) Language: a natural opening paragraph, friendlier section headings that are guidance rather than a fixed template, no repeated phrasing ("Following our guidance" at most once or twice), plain statements of what is still open, natural relative-timeline wording. Example rewritten. No change to facts, ownership, timelines' meaning, recordings, sections' meaning, length policy or output schema.
- 1.3.0 (2026-10-31) — Length policy 250/350/review (D-031) replaces the single 250 cap; relative timelines read against the call date, never "today/tonight/tomorrow"; customer timing never becomes a support commitment; `length_status`; example no longer says "today's call".
- 1.2.0 (2026-10-31) — S-11: resolved statements credit the performer named in the summary (customer "you", support "we", uncertain neutral); opening sentence restates `call_purpose` only. Example updated. No change to subject, recordings, sections, length or banned-content rules.
- 1.1.0 (2026-10-31) — Multiple recording segments per call (D-025): `<recordings>` list input, `Part n` labels, one email per call.
- 1.0.0 (2026-10-31) — Initial specification.
