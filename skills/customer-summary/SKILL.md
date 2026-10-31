---
name: customer-summary
version: 1.0.0
stage: summary
output_schema: CustomerSummary
---

# Customer Summary Generation

## Objective

Turn a validated `AnalysisResult` into a short, customer-facing summary organised around what matters to the customer: what we covered, what is now resolved, what they need to do next, and what FlexiFunnels will do next. The summary is the content plan for the email. It rephrases the analysis in plain, friendly language **without adding, removing or upgrading any fact**.

## Inputs

- `<analysis>`: the `AnalysisResult/1` JSON from the transcript-analysis skill.
- `<customer>`: `customer_first_name`.
- `<policy>`: runtime policy values (e.g. maximum items per section).

The transcript itself is not provided. The analysis is the only source of facts.

## Instructions

1. Read every item in the analysis. Map each item to exactly one summary section by its category:

   | Analysis category | Summary section |
   |---|---|
   | `completed` | `resolved` |
   | `explained` | `covered` |
   | `discussed` | `covered` (only if useful to the customer; otherwise omit and list the ID in `omitted_item_ids` with a reason) |
   | `pending_customer_action` | `customer_next_steps` |
   | `pending_support_action` | `support_next_steps` |

2. For each summary entry write one short sentence in plain language, second person for the customer ("you"), first person plural for FlexiFunnels ("we", "our team").
3. Keep the meaning exact:
   - `explained` stays guidance ("We walked through how to…"), never "we fixed".
   - Pending items stay future and keep their owner.
   - Include `stated_timeline` only if present, using the same meaning ("within 24 hours of your DNS update"). Never add or shorten a timeline.
4. Write a one-sentence `call_purpose` describing why the customer called, from their point of view.
5. Set `tone_guidance` from `customer_sentiment`:
   - `frustrated` / `angry` → `acknowledge_and_reassure` (acknowledge the inconvenience once, sincerely, without admitting fault beyond the transcript or promising more than was promised).
   - `positive` / `neutral` → `warm_and_concise`.
   - `unclear` → `neutral_professional`.
6. Every entry must list its `source_item_ids`.
7. Output **only** the JSON object in the Output Schema.

## Rules

- No new facts. No product claims, links, prices, features or advice that are not in the analysis.
- Never move an item to a "more complete" section (`covered` → `resolved` is forbidden).
- Never drop a `pending_customer_action` or `pending_support_action`. Pending items are always included.
- Merge items only when they share the same issue **and** the same category; keep all their IDs.
- Do not mention internal tools, internal team names, other customers or staff-only remarks.
- Do not include personal identifiers or secrets.
- Plain language: no jargon unless the customer used it on the call; explain essential terms in a few words.
- If the analysis has `skip_recommendation.skip: true`, return `{"schema": "CustomerSummary/1", "skipped": true}` only. (The runtime should not call this skill in that case; this is a safeguard.)

## Output Schema

```json
{
  "schema": "CustomerSummary/1",
  "skipped": false,
  "call_purpose": "one sentence from the customer's point of view",
  "tone_guidance": "acknowledge_and_reassure | warm_and_concise | neutral_professional",
  "resolved": [
    {"text": "one sentence", "source_item_ids": ["I1"]}
  ],
  "covered": [
    {"text": "one sentence", "source_item_ids": ["I2"]}
  ],
  "customer_next_steps": [
    {"text": "one sentence", "timeline": "verbatim-meaning or null", "source_item_ids": ["I3"]}
  ],
  "support_next_steps": [
    {"text": "one sentence", "timeline": "verbatim-meaning or null", "source_item_ids": ["I4"]}
  ],
  "omitted_item_ids": [
    {"item_id": "I5", "reason": "small talk / not useful to customer"}
  ],
  "primary_topic": "2–6 words for the subject line"
}
```

## Examples

Synthetic, continuing Example A from transcript-analysis (items I1–I4, sentiment `frustrated`):

```json
{
  "schema": "CustomerSummary/1",
  "skipped": false,
  "call_purpose": "You wanted the order bump to appear on your checkout and your custom domain to show as secure.",
  "tone_guidance": "acknowledge_and_reassure",
  "resolved": [
    {"text": "We enabled the order bump for your product, and you confirmed it now shows on your checkout page.", "source_item_ids": ["I1"]}
  ],
  "covered": [
    {"text": "We explained that the secure (SSL) certificate needs your domain's DNS to point to FlexiFunnels using a CNAME record.", "source_item_ids": ["I2"]}
  ],
  "customer_next_steps": [
    {"text": "Add the CNAME record at your domain registrar.", "timeline": "tonight", "source_item_ids": ["I3"]}
  ],
  "support_next_steps": [
    {"text": "Our team will re-issue your SSL certificate once your DNS update is in place.", "timeline": "within 24 hours of your DNS update", "source_item_ids": ["I4"]}
  ],
  "omitted_item_ids": [],
  "primary_topic": "order bump and custom domain SSL"
}
```

Wrong (forbidden): `"resolved": [{"text": "We fixed your domain's SSL."}]` — the SSL issue is pending, not resolved.

## Edge Cases

| Situation | Handling |
|---|---|
| No `completed` items | `resolved: []`; do not imply anything was fixed |
| Only `explained` items | Summary focuses on `covered`; next-step sections may be empty |
| Pending support action with no timeline | Keep `timeline: null`; never write "soon", "shortly", "today" |
| Many items (e.g. 10+) | Merge same-issue/same-category items; respect policy maximums but never drop pending items |
| Unresolved issue with no next step | Represent honestly in `covered` (e.g. "We discussed X; it is not yet resolved"); do not invent a next step |
| Angry customer | `acknowledge_and_reassure`; no excessive apologies; no new promises |
| Item descriptions mention customer data | Leave it out |

## Expected Output

- Valid JSON matching `CustomerSummary/1`.
- Every analysis item ID appears exactly once across sections or in `omitted_item_ids`.
- Every `pending_customer_action` and `pending_support_action` item is present in the matching section.
- No section is more "complete" than its source category.
- Timelines match analysis `stated_timeline` values; no new timelines.
- No facts absent from the analysis.

## Changelog

- 1.0.0 (2026-10-31) — Initial specification.
