---
name: customer-summary
version: 1.4.0
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

1a. **Statement-level reliability and mode (D-044).** Read `generation_mode` and each item's `confidence`. Use only items with `confidence` `medium` or `high` (an item with `owner: uncertain` is judged on the confidence of its result: at `medium` or `high` it is stated neutrally, crediting neither party). An item with `confidence: low` is never stated as fact and never turned into a commitment: list its ID in `omitted_item_ids` with the reason "low confidence" and add an `analysis_gaps` entry. Set `mode` to the analysis `generation_mode`: `full`, `conservative` (partly garbled or mixed: medium and high items only, cautious wording, nothing guessed), or `neutral_fallback` (no reliable content: return empty `resolved`, `covered`, `customer_next_steps` and `support_next_steps`, `call_purpose: null`, `objective: null`, `primary_topic: "your support call"`, and add one `analysis_gaps` entry saying the transcript gave nothing reliable to report). A difficult transcript gives a shorter, more conservative summary, never no summary.
2. For each summary entry write one short sentence in plain language, second person for the customer ("you"), first person plural for FlexiFunnels ("we", "our team"). Write it so the email can use it almost as is: natural and conversational, no filler, no repeated stock phrase across entries, and no more detail than the customer needs. Shortening is never allowed to remove a fact, a status, an owner or a timeline.
3. Keep the meaning exact:
   - A `completed` entry credits the action to the item's `owner`: "you" for `customer` ("Following our guidance, you enabled…"), "we" for `support`. If `guided_by` is `support` and the owner is `customer`, the entry may say the customer acted "following our guidance". For `owner: uncertain` write a neutral statement of the result with no performer ("The order bump now shows on your checkout page.") and never credit "we" or "you".
   - `explained` stays guidance ("We walked through how to…"), never "we fixed".
   - Pending items stay future and keep their owner.
   - Include `stated_timeline` only if present, using the same meaning ("within 24 hours of your DNS update"). Never add or shorten a timeline.
4. Write a one-sentence `call_purpose` describing why the customer called, from their point of view, using only the `problem_statement` (and `title`) of the issues you list in `call_purpose_issue_ids`. Do not add a symptom, error, cause or product detail that is not in those fields.
5. Set `tone_guidance` from `customer_sentiment`:
   - `frustrated` / `angry` → `acknowledge_and_reassure` (acknowledge the inconvenience once, sincerely, without admitting fault beyond the transcript or promising more than was promised).
   - `positive` / `neutral` → `warm_and_concise`.
   - `unclear` → `neutral_professional`.
6. Every entry must list its `source_item_ids`, and `call_purpose` must list `call_purpose_issue_ids`. Before output, check each statement against the analysis: every noun, detail and outcome in it must appear in the cited items or issues. Remove anything that does not.
7. If you notice that a fact you would need is missing from the analysis (for example because you can see the transcript in the same session), do **not** use it. Write the statement with the information the analysis has, and add an entry to `analysis_gaps` describing the omission (what is missing and which issue or item it belongs to) so the analysis stage can be corrected.
8. Output **only** the JSON object in the Output Schema.

## Rules

- No new facts. No product claims, links, prices, features or advice that are not in the analysis.
- **Grounding.** Every statement must be traceable to an analysis item or issue. Do not add inferred technical problems or causes, do not turn an assumption into a fact, do not invent issue descriptions or outcomes. If the analysis lacks information, keep that uncertainty (state less, not more) and record the gap in `analysis_gaps`. The transcript is never a source for this stage, even if it is visible in the session.
- **Ownership.** Never change who performed or will perform an action. Keep the action owner separate from who guided it.
- Never move an item to a "more complete" section (`covered` → `resolved` is forbidden).
- Never drop a `pending_customer_action` or `pending_support_action` that has `confidence` `medium` or `high`: pending items are always included. A pending item with `confidence: low` is not stated (a promise or a customer commitment that cannot be read reliably is not turned into a commitment); it goes to `omitted_item_ids` and `analysis_gaps`.
- **No repetition across sections.** One fact appears once. Do not put the same item in two sections; merge entries that say the same thing; keep a completed action in `resolved` only, and what was merely demonstrated in `covered` only.
- **Relevant technical detail.** Put exact settings, button or page names, product names and non-secret URLs that the customer may need into the entry text or into `technical_details`, only when an item with `confidence` medium or high contains them. Never add a setting or instruction that is not in the analysis, and never reproduce passwords, authentication codes, tokens or other credentials.
- Merge items only when they share the same issue, the same category **and** the same `stated_timeline` (both `null` counts as the same); keep all their IDs. Never merge items whose timelines differ, because a merged entry has a single `timeline`.
- Timelines come only from `stated_timeline`. When it is `null`, the entry carries no time wording at all (no "later", "soon", "this week", "after the call" unless those are the stated words).
- **Relative timelines (policy D-031).** When an item's `timeline_reference` is `call_relative`, write `timeline` against the analysis `call_date`, never against today or the sending date, and keep the verbatim words in `timeline_source`: "tonight"/"aaj raat"/"this evening" → "that evening" (optionally "that evening, after our call"); "tomorrow"/"kal"/"कल सुबह" → "the following day" (or "the morning after our call" when a morning was said); "today"/"aaj" → "the same day as our call"; "this week" → "that week"; "next week" → "next week". Weekday names, durations and event-relative spans (`fixed`) stay as said ("by Friday", "within 2 working days"). Never write a calendar date, never change the intended timing, keep ambiguity ambiguous. A customer's timing stays the customer's ("you planned to…"); never turn it into a support commitment.
- **Customer intent.** A statement about what the customer wanted, hoped, asked or expected ("you wanted this fixed") must come from the analysis (`problem_statement`, item description or evidence). If the analysis does not say it, do not write it; record the omission in `analysis_gaps`.
- Unresolved issues stay visible. If an issue's `status` is `unresolved` or `partially_resolved`, say so plainly in `covered` (for example "This is not yet resolved." or "This part is still open."), using only the status and items the analysis gives. Say it once, next to the facts about that issue, in clear everyday words, and say what is open (for example "the leads from the three days before the call did not reach the CRM") only as far as the analysis states it. Never imply it is resolved and never leave its state unstated, even when next steps exist; never invent a cause or reason. If the open part of such an issue rests only on items you omitted for low confidence, still state the issue's status neutrally in `covered` (for example "Some parts of this setup could not be confirmed during the call.") without any detail about the omitted items; omitting the unreliable detail never means omitting that the issue is not fully settled.
- **Natural wording of timelines.** The `timeline` keeps the meaning given in the mapping above; it should read naturally: "that evening" (without adding "the evening of our call" unless the email would otherwise be ambiguous), "the next morning" or "the morning after our call", "the day after our call", "that week". Never use bare today/tonight/tomorrow/yesterday or a calendar date, and never change the intended timing.
- Do not mention internal tools, internal team names, other customers or staff-only remarks.
- Do not include personal identifiers or secrets.
- Plain language: no jargon unless the customer used it on the call; explain essential terms in a few words.
- If the analysis has `skip_recommendation.skip: true`, return `{"schema": "CustomerSummary/1", "skipped": true}` only. (The runtime should not call this skill in that case; this is a safeguard.)

## Output Schema

```json
{
  "schema": "CustomerSummary/1",
  "skipped": false,
  "mode": "full | conservative | neutral_fallback",
  "call_purpose": "one sentence from the customer's point of view, or null in neutral_fallback",
  "objective": "the customer's goal in their terms from the issues, or null",
  "call_date": "YYYY-MM-DD copied from the analysis",
  "call_purpose_issue_ids": ["S1"],
  "tone_guidance": "acknowledge_and_reassure | warm_and_concise | neutral_professional",
  "resolved": [
    {"text": "one sentence", "source_item_ids": ["I1"]}
  ],
  "covered": [
    {"text": "one sentence", "source_item_ids": ["I2"]}
  ],
  "customer_next_steps": [
    {"text": "one sentence", "timeline": "wording anchored to the call date, or null", "timeline_source": "verbatim stated_timeline or null", "source_item_ids": ["I3"]}
  ],
  "support_next_steps": [
    {"text": "one sentence", "timeline": "wording anchored to the call date, or null", "timeline_source": "verbatim stated_timeline or null", "source_item_ids": ["I4"]}
  ],
  "omitted_item_ids": [
    {"item_id": "I5", "reason": "small talk / not useful to customer"}
  ],
  "analysis_gaps": [
    {"issue_or_item_id": "S1", "missing": "what the analysis lacks that the summary could not state"}
  ],
  "technical_details": [
    {"text": "an exact setting, name or non-secret URL the customer may need", "source_item_ids": ["I1"]}
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
  "mode": "full",
  "call_purpose": "You wanted the order bump to appear on your checkout and your custom domain to show as secure.",
  "call_date": "2026-10-30",
  "call_purpose_issue_ids": ["S1", "S2"],
  "tone_guidance": "acknowledge_and_reassure",
  "resolved": [
    {"text": "Following our guidance, you enabled the order bump for your product, and you confirmed it now shows on your checkout page.", "source_item_ids": ["I1"]}
  ],
  "covered": [
    {"text": "We explained that the secure (SSL) certificate needs your domain's DNS to point to FlexiFunnels using a CNAME record.", "source_item_ids": ["I2"]}
  ],
  "customer_next_steps": [
    {"text": "Add the CNAME record at your domain registrar.", "timeline": "that evening", "timeline_source": "tonight", "source_item_ids": ["I3"]}
  ],
  "support_next_steps": [
    {"text": "Our team will re-issue your SSL certificate once your DNS update is in place.", "timeline": "within 24 hours of your DNS update", "timeline_source": "within 24 hours of your DNS update", "source_item_ids": ["I4"]}
  ],
  "omitted_item_ids": [],
  "analysis_gaps": [],
  "primary_topic": "order bump and custom domain SSL"
}
```

Wrong (forbidden): `"resolved": [{"text": "We fixed your domain's SSL."}]` — the SSL issue is pending, not resolved. Also wrong: `"resolved": [{"text": "We enabled the order bump."}]` — the customer performed it (`owner: customer`); and a `call_purpose` such as "your checkout was throwing an error" — no error is in the analysis.

## Edge Cases

| Situation | Handling |
|---|---|
| No `completed` items | `resolved: []`; do not imply anything was fixed |
| Only `explained` items | Summary focuses on `covered`; next-step sections may be empty |
| Pending support action with no timeline | Keep `timeline: null`; never write "soon", "shortly", "today" |
| Many items (e.g. 10+) | Merge same-issue/same-category items; respect policy maximums but never drop pending items |
| Unresolved issue with no next step | Represent honestly in `covered` (e.g. "We discussed X; it is not yet resolved"); do not invent a next step |
| Angry customer | `acknowledge_and_reassure`; no excessive apologies; no new promises |
| `generation_mode: neutral_fallback` | Empty sections, `call_purpose: null`, one `analysis_gaps` entry; the email stage writes the neutral thank-you |
| Item with `confidence: low` (garbled evidence) | Omit from every section, list in `omitted_item_ids` ("low confidence") and in `analysis_gaps`; never state it |
| Guided on-screen step classified `completed` by the analysis | Keep it in `resolved` with the owner credited; never downgrade it to `covered` and never repeat it as pending |
| Item descriptions mention customer data | Leave it out |

## Expected Output

- Valid JSON matching `CustomerSummary/1`.
- Every analysis item ID appears exactly once across sections or in `omitted_item_ids`.
- Every `pending_customer_action` and `pending_support_action` item is present in the matching section.
- No section is more "complete" than its source category.
- Timelines match analysis `stated_timeline` values; no new timelines.
- No facts absent from the analysis: every statement and the `call_purpose` are traceable to cited items or issues; omissions appear in `analysis_gaps`, not in the text.
- `completed` entries credit the item's owner; `uncertain` owners are written neutrally.

## Changelog

- 1.4.0 (2026-11-01) — Coverage-first summary (D-044; refined after the 15451 validation finding: a partially resolved issue is stated as not fully settled even when the open detail was omitted for low confidence): `mode` copied from the analysis `generation_mode`; only medium and high confidence items are stated (low ones go to `omitted_item_ids` and `analysis_gaps`, never to a commitment); `neutral_fallback` returns an empty but valid summary; no repetition across sections; relevant technical details and non-secret URLs kept (`technical_details`, `objective`); never reproduce credentials. Ownership, timelines, grounding and the pending-item rule are unchanged except that unreliable pending items are not stated. **Not regression-tested before the focused tests of the same date.**
- 1.3.0 (2026-11-01) — Phase 2 final changes, **not regression-tested** (no runs by decision). Wording guidance only: entries are natural, concise and not repetitive; unresolved issues stated once in clear everyday words using only what the analysis gives; relative timelines phrased naturally ("that evening" without the redundant "the evening of our call"). Meaning of the timeline mapping, grounding, ownership, merging and output schema unchanged.
- 1.2.0 (2026-10-31) — Relative-timeline policy (D-031): `call_date`, call-anchored `timeline` with verbatim `timeline_source`; customer timing never becomes a support commitment. Customer-intent statements ("you wanted/hoped…") must come from the analysis.
- 1.1.1 (2026-10-31) — Found in S-11 regression round 1: merge only items with identical `stated_timeline`; `null` timeline means no time wording; unresolved/partially resolved issues must be stated as not yet resolved (preserves the existing unresolved-issue handling after the grounding change). Wording only.
- 1.1.0 (2026-10-31) — S-11: `completed` entries credit the item's owner (customer/support/uncertain → neutral). Summary grounding rule: every statement traceable to analysis issues/items; `call_purpose_issue_ids`, `analysis_gaps`; omissions are reported, never filled from the transcript. No change to sections, skip handling or pending-item rules.
- 1.0.0 (2026-10-31) — Initial specification.
