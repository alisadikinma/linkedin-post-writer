---
name: linkedin-validate
description: Score a LinkedIn post against Depth Score 0-100 rubric with hard-fail rules (AI slop, engagement bait, external links in body). Gates posts at >=80 threshold for auto-publish. Triggers on validate, linkedin validate, score post, depth score.
model: sonnet
triggers: [validate, linkedin validate, score post, depth score]
---

# linkedin-validate — Depth Score Gate

## Purpose

Score a LinkedIn post 0-100 via structural heuristics derived from RAG 01 §Depth Score Formula. A post with `depth_score >= 80` AND zero `critical`-severity failures passes the auto-publish gate; anything lower routes to manual review. The score is an ESTIMATE — not the LinkedIn ranker itself — that approximates the four Depth Score inputs (dwell time, comment quality, saves/shares, bounce rate) through checkable structural signals in the post body.

## Reference files

These are injected via `--append-system-prompt-file` at runtime by `LinkedInGenerationService` — do NOT read them with the Read tool.

- `refs-linkedin-playbook.md` — 2026 algorithm mechanics, Depth Score formula, pillars, anti-slop blacklist, hashtag rules

## Input shape

The caller passes a JSON object matching `ValidationInputSchema` (see `schema.ts`) — a discriminated union on `format`:

- `format: 'text'` — `post` is a `ConvertOutput` from `linkedin-convert` (B2 contract): `post_text` (1100-1300 chars), `link_comment` (20-280 chars with blog URL), `hashtags` (3-5 of `/^#[A-Za-z0-9]+$/`), `char_count`, `paragraph_count`, `hook_used`.
- `format: 'carousel'` — OUT OF SCOPE for this skill version. Carousel validation lands in Phase C3 once `linkedin-carousel` (C2) defines the slide-deck output schema.

Optional side-channel context the caller MAY pass (not in the discriminated union — additional top-level fields the orchestrator attaches):

- `brief` — the `Brief` the post was generated from. When present, `brief.pull_quote` is used to award a +5 bonus if it appears verbatim in `post_text`.

## Step 1 — Validate input format

Parse the input envelope. Assert `format === 'text'`. If `format === 'carousel'`, emit an error object:

```json
{ "error": "out_of_scope", "detail": "carousel validation is implemented in Phase C3" }
```

…and stop. Do NOT attempt a best-effort text score on carousel data — the shape is different.

For `format === 'text'`, extract `post = input.post` and proceed.

## Step 2 — Apply rubric

Start with `base = 100`. Apply each rule in order, accumulating deductions and bonuses. For every triggered deduction rule, append a `ValidationFailure` entry to `failures[]`; for each actionable fix, append a matching `ValidationSuggestion` entry to `suggestions[]` (one suggestion per critical and important failure; minor failures may skip).

### Depth Score rubric

| # | Rule id | Check | Adjustment | Severity |
|---|---|---|---|---|
| 1 | `hook_strength_missing` | First 3 lines (≤200 chars) contain at least one signal: a digit, a specific timeframe word (e.g. "months", "years", "weeks"), a proprietary stat, a contrarian marker (`wrong`, `disagree`, `conventional`, `myth`, `actually`, `stop`, `truth`), or a curiosity-gap marker (`?`, `secret`) | **-20** if absent | important |
| 2 | `char_count_out_of_range` | `1100 <= post_text.length <= 1300` | **-15** if outside range | important |
| 3 | `paragraph_rhythm_violation` | Every `\n\n`-paragraph has `<= 2` `\n`-separated lines (dwell-time cadence — 1-2 sentences per paragraph) | **-10** per post if ANY paragraph has 3+ lines | important |
| 4 | `missing_closing_question` | Last non-whitespace character is `?` AND the final question has `>= 5` words (prompts 5+ word reply → drives Comment Quality, the 15× weight in the Depth Score formula) | **-15** if absent or too short | important |
| 5 | `external_link_in_body` | NO `https?://` anywhere in `post_text` (link-in-comment pattern — body links trigger 60% reach penalty) | **-30** per match, **HARD FAIL** | critical |
| 6 | `hashtag_count_out_of_range` | `3 <= hashtags.length <= 5` | **-5** per hashtag outside range (e.g. 6 tags → -5; 2 tags → -5; 10 tags → -25) | important |
| 7 | `hashtag_format_invalid` | Every hashtag matches `/^#[A-Za-z0-9]+$/` | **-5** per non-compliant tag | minor |
| 8 | `ai_slop_phrase` | `post_text` contains ANY of 7 banned phrases: "delve into", "unlock the power of", "in today's fast-paced digital landscape", "at the end of the day", "navigating the complexities of", "harness the power of", "seamlessly integrate" | **-20** per match, **HARD FAIL** | critical |
| 9 | `engagement_bait` | `post_text` contains ANY of: "Comment YES", "type a for", "type a/b", "Drop a 🔥", "Smash that like button" (case-insensitive match) | **-20** per match, **HARD FAIL** | critical |
| 10 | `link_comment_missing_url` | `link_comment` contains `https?://` (the whole point of the first comment is to carry the blog URL) | **-10** if absent | important |
| 11 | `pull_quote_verbatim_bonus` | IF `brief.pull_quote` is provided as context AND appears verbatim in `post_text` | **+5** bonus | minor |

Pass threshold: `depth_score >= 80` AND zero `critical` failures.

## Step 3 — Compute

Compute `adjustments = sum(all deductions, subtracted) + sum(all bonuses, added)`.

Clamp the raw score to the `[0, 100]` window:

```
depth_score = max(0, min(100, 100 + adjustments))
```

`passed = (depth_score >= 80) AND (no failures have severity === 'critical')`.

The Zod `superRefine` guard in `schema.ts` enforces this invariant — if your computed `passed` disagrees, you made a math error; re-compute, do NOT patch `passed` to match.

## Step 4 — Emit output

Emit a single JSON object matching `ValidationSchema` (see `schema.ts`):

```json
{
  "depth_score": 92,
  "passed": true,
  "format": "text",
  "failures": [],
  "suggestions": [],
  "computed_at": "2026-04-23T08:30:00Z"
}
```

For a failing post, every triggered rule must appear in `failures[]`:

```json
{
  "depth_score": 20,
  "passed": false,
  "format": "text",
  "failures": [
    {
      "rule": "external_link_in_body",
      "message": "post_text contains https://evil.com — body links trigger 60% reach penalty",
      "severity": "critical",
      "deduction": 30,
      "evidence": "https://evil.com"
    },
    {
      "rule": "ai_slop_phrase",
      "message": "post_text contains banned phrase \"delve into\"",
      "severity": "critical",
      "deduction": 20,
      "evidence": "delve into"
    }
  ],
  "suggestions": [
    {
      "rule": "external_link_in_body",
      "suggestion": "Move the URL out of the body and into the first-comment payload (link_comment)."
    }
  ]
}
```

## Anti-slop guard restatement

For clarity — these are the exact strings the rubric checks (case-insensitive for `post_text` scanning). The set matches CLAUDE.md §Anti-Slop Enforcement verbatim and must stay in lockstep with the `BANNED_PHRASES` + `ENGAGEMENT_BAIT` arrays in `../linkedin-convert/schema.ts`.

Banned AI-slop phrases (7):

1. "delve into"
2. "unlock the power of"
3. "in today's fast-paced digital landscape"
4. "at the end of the day"
5. "navigating the complexities of"
6. "harness the power of"
7. "seamlessly integrate"

Engagement-bait strings (5, lockstep with `../linkedin-convert/schema.ts` ENGAGEMENT_BAIT array):

1. "Comment YES"
2. "type a for"
3. "type a/b"
4. "Drop a 🔥"
5. "Smash that like button"

When any of these triggers, the rule fires with severity `critical` and a **-20** (slop) or **-20** (bait) or **-30** (external link) deduction per match. Multiple matches stack — a post with two banned phrases loses 40 points AND passes `hasCritical === true`, so even a 60-point score would still be `passed: false`.
