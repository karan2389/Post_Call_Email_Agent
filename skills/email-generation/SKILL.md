---
name: email-generation
version: 1.1.0
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
- `<policy>`: `min_words`, `max_words`, `subject_template`, `language`, `allowed_links`, `banned_phrases`.

The customer's email address is not provided; the runtime sets the recipient.

## Instructions

1. **Subject:** follow `subject_template` (default: `Follow-up on your FlexiFunnels support call – {primary_topic}`), 20–90 characters, sentence case, no emoji.
2. **Greeting:** `Hi {customer_first_name},`
3. **Opening (1–2 sentences):** thank them for their time and restate the call purpose from their point of view. If `tone_guidance` is `acknowledge_and_reassure`, acknowledge the inconvenience once, sincerely and briefly.
4. **What we resolved** — only if `resolved` is non-empty.
5. **What we covered** — only if `covered` is non-empty.
6. **Your next steps** — only if `customer_next_steps` is non-empty; a short numbered list; include timelines only as given.
7. **What we'll do next** — only if `support_next_steps` is non-empty; include timelines only as given; without a timeline, say what will happen without implying when.
8. **Recording:**
   - One URL: one line, e.g. `You can rewatch our call here: {url}`. No "Part" label.
   - Two or more URLs: one short sentence saying the call continued across several recordings, then one line per segment in the given order, labelled `Part 1:`, `Part 2:`, … For example:
     `Our call continued across two recordings, so here are both parts in order:`
     `Part 1: {url_1}`
     `Part 2: {url_2}`
   - Always one email, never one email per recording.
9. **Close:** one line inviting them to reply if anything is unclear. Then the `signature_block` exactly as provided.
10. Use short section labels in plain text (e.g. `Your next steps:`). No markdown, no HTML, no bold, no emoji.
11. Stay within `min_words`–`max_words` (excluding signature). If it doesn't fit, shorten wording — never drop pending items.
12. List every summary entry you used in `referenced_item_ids` (union of their `source_item_ids`).
13. Output **only** the JSON object in the Output Schema.

## Rules

- Use only facts from the summary. Do not add tips, features, links, upsells, prices or general advice.
- Preserve every status: resolved stays resolved, covered stays guidance, pending stays pending with the same owner.
- Never invent timelines, refunds, discounts, credits, escalations or guarantees. Avoid absolute words ("guarantee", "definitely", "100%").
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
  "referenced_item_ids": ["I1", "I2"],
  "recording_urls_included": ["url_1", "url_2"],
  "sections_included": ["resolved", "covered", "customer_next_steps", "support_next_steps", "recording"]
}
```

## Examples

Synthetic, from the customer-summary example:

```
Subject: Follow-up on your FlexiFunnels support call – order bump and custom domain SSL

Hi Arjun,

Thank you for your time on today's call. I know the domain issue has been holding you up for a while, and I'm sorry for the trouble. Here is a quick summary so you have everything in one place.

What we resolved:
- We enabled the order bump for your product, and you confirmed it now shows on your checkout page.

What we covered:
- The secure (SSL) certificate needs your domain's DNS to point to FlexiFunnels using a CNAME record.

Your next steps:
1. Add the CNAME record at your domain registrar (you mentioned you'd do this tonight).

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
| `resolved` empty | Omit the section; do not say "we resolved" anywhere |
| No next steps on either side | Omit both sections; still include recording and close |
| Support next step without timeline | "Our team will check X and get back to you." — no "soon", "today", "shortly" |
| Angry customer | One sincere acknowledgement; facts unchanged; no extra promises |
| Many items | Compress wording; keep every pending item; stay ≤ `max_words` |
| `support_agent_first_name` empty | Use the configured signature block only |
| Very long `primary_topic` | Shorten for the subject to fit 90 characters |
| Missing `fathom_urls` or first name | Return `MISSING_INPUT` error object |
| Two or more recording URLs | One email; one sentence explaining the call continued across recordings; `Part n:` lines in the given order |
| Many segments (3+) | Same pattern ("across three recordings"); keep every link even if near `max_words` — shorten other wording instead |

## Expected Output

- Valid JSON matching `EmailDraft/1`.
- Subject and body pass every deterministic check in `docs/validation-rules.md` §2.
- `referenced_item_ids` covers every pending item in the summary and contains no unknown IDs.
- Body faithful to the summary: no status upgrades, owner swaps, invented commitments or extra content.
- Every URL in `fathom_urls` present exactly once, unmodified, in order; `Part n` labels when there is more than one; `recording_urls_included` equals `fathom_urls`.

## Changelog

- 1.1.0 (2026-10-31) — Multiple recording segments per call (D-025): `<recordings>` list input, `Part n` labels, one email per call.
- 1.0.0 (2026-10-31) — Initial specification.
