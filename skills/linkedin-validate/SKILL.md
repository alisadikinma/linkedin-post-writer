---
name: linkedin-validate
description: Score a LinkedIn post (text or carousel) against Depth Score 0-100 rubric with hard-fail rules (AI slop, engagement bait, external links in body, missing carousel invariants). Gates posts at >=80 threshold for auto-publish. Triggers on validate, linkedin validate, score post, depth score.
model: sonnet
triggers: [validate, linkedin validate, score post, depth score]
---

# linkedin-validate — Depth Score Gate

## Purpose

Score a LinkedIn post 0-100 via structural heuristics derived from RAG 01 §Depth Score Formula and RAG 06 §Carousel Depth Signals. A post with `depth_score >= 80` AND zero `critical`-severity failures passes the auto-publish gate; anything lower routes to manual review. The score is an ESTIMATE — not the LinkedIn ranker itself — that approximates the four Depth Score inputs (dwell time, comment quality, saves/shares, bounce rate) through checkable structural signals in the post body or carousel deck.

## Reference files

These are injected via `--append-system-prompt-file` at runtime by `LinkedInGenerationService` — do NOT read them with the Read tool.

- `refs-linkedin-playbook.md` — 2026 algorithm mechanics, Depth Score formula, pillars, anti-slop blacklist, hashtag rules
- `refs-linkedin-carousel.md` — carousel design constraints (slide count, dead zones, margins, typography, cover hook frameworks, direct-answer slide, Human Fingerprint reuse)

## Input shape

The caller passes a JSON object matching `ValidationInputSchema` (see `schema.ts`) — a discriminated union on `format`:

- `format: 'text'` — `post` is a `ConvertOutput` from `linkedin-convert` (B2 contract): `post_text` (1100-1300 chars), `link_comment` (20-280 chars with blog URL), `hashtags` (3-5 of `/^#[A-Za-z0-9]+$/`), `char_count`, `paragraph_count`, `hook_used`.
- `format: 'carousel'` — `post` is a `CarouselOutput` from `linkedin-carousel` (C2 contract): `slides` (7-10 entries, 1-indexed), `total_slides`, `hook_framework` (PAS/AIDA/before_after/loss_aversion/contrarian), `structure` (build_in_public). Each slide carries `slide_number`, `layout_hint` (cover/human_fingerprint/body/direct_answer/cta), `copy`, `image_prompt`, `is_cover`, `is_cta`, optional `direct_answer_block`.

Optional side-channel context the caller MAY pass (not in the discriminated union — additional top-level fields the orchestrator attaches):

- `brief` — the `Brief` the post was generated from. When present and `format === 'text'`, `brief.pull_quote` is used to award a +5 bonus if it appears verbatim in `post_text`.

## Step 1 — Validate input format

Parse the input envelope. Extract `format` and `post`. Route to the correct rubric branch:

- `format === 'text'` → apply rules 1-11 (text branch).
- `format === 'carousel'` → apply rules 1 (cover-adapted), 8, 9, and 12-20 (carousel branch).

Any other `format` value is a schema violation — `ValidationInputSchema.parse()` rejects it before the rubric runs.

## Step 2 — Apply rubric

Start with `base = 100`. Apply each applicable rule in order, accumulating deductions and bonuses. For every triggered deduction rule, append a `ValidationFailure` entry to `failures[]`; for each actionable fix, append a matching `ValidationSuggestion` entry to `suggestions[]` (one suggestion per critical and important failure; minor failures may skip).

### Format-dispatch

Rules apply conditionally based on `input.format`:

- **Text posts (format='text')** exercise rules **1-11** — the original B3 text rubric.
- **Carousels (format='carousel')** exercise rules **1 (cover-adapted), 8, 9, 12-20**. Rules 2-7, 10-11 are text-only and are SKIPPED for carousels (different surface: carousel captions/hashtags accompany the post but are not the slides themselves, and the link-in-comment flow for carousels is handled separately by the backend compositor per Addendum 2 D13).

Shared rules that scan copy (8 ai_slop_phrase, 9 engagement_bait) dispatch on format:

- `text`: scan `post.post_text`.
- `carousel`: scan the concatenation of every slide's `copy` PLUS any `direct_answer_block`. Any match on ANY slide fires the rule once per occurrence — multiple slides with the same banned phrase stack as multiple failures.

### Depth Score rubric

| # | Rule id | Check | Adjustment | Severity |
|---|---|---|---|---|
| 1 | `hook_strength_missing` | **Text**: first 3 lines (≤200 chars) of `post_text` contain at least one signal: a digit, a specific timeframe word (e.g. "months", "years", "weeks"), a proprietary stat, a contrarian marker (`wrong`, `disagree`, `conventional`, `myth`, `actually`, `stop`, `truth`), or a curiosity-gap marker (`?`, `secret`). **Carousel**: the cover slide's `copy` (the slide with `is_cover: true` at `slide_number: 1`) contains at least one of the same signals — the cover headline is the scroll-stop, same heuristic, different surface | **-20** if absent | important |
| 2 | `char_count_out_of_range` | `1100 <= post_text.length <= 1300` (text only) | **-15** if outside range | important |
| 3 | `paragraph_rhythm_violation` | Every `\n\n`-paragraph in `post_text` has `<= 2` `\n`-separated lines (dwell-time cadence — 1-2 sentences per paragraph) (text only) | **-10** per post if ANY paragraph has 3+ lines | important |
| 4 | `missing_closing_question` | Last non-whitespace character of `post_text` is `?` AND the final question has `>= 5` words (text only) | **-15** if absent or too short | important |
| 5 | `external_link_in_body` | NO `https?://` anywhere in `post_text` — link-in-comment pattern (text only; carousels use rule 19) | **-30** per match, **HARD FAIL** | critical |
| 6 | `hashtag_count_out_of_range` | `3 <= hashtags.length <= 5` (text only) | **-5** per hashtag outside range | important |
| 7 | `hashtag_format_invalid` | Every hashtag matches `/^#[A-Za-z0-9]+$/` (text only) | **-5** per non-compliant tag | minor |
| 8 | `ai_slop_phrase` | **Text**: `post_text` contains any of 7 banned phrases. **Carousel**: ANY slide's `copy` or `direct_answer_block` contains any banned phrase. Banned list (case-insensitive): "delve into", "unlock the power of", "in today's fast-paced digital landscape", "at the end of the day", "navigating the complexities of", "harness the power of", "seamlessly integrate" | **-20** per match, **HARD FAIL** | critical |
| 9 | `engagement_bait` | **Text**: `post_text` contains any of 5 bait strings. **Carousel**: ANY slide's `copy` or `direct_answer_block` contains any bait string. List (case-insensitive): "Comment YES", "type a for", "type a/b", "Drop a 🔥", "Smash that like button" | **-20** per match, **HARD FAIL** | critical |
| 10 | `link_comment_missing_url` | `link_comment` contains `https?://` (text only; carousel link-in-comment handled backend-side) | **-10** if absent | important |
| 11 | `pull_quote_verbatim_bonus` | (text only) IF `brief.pull_quote` is provided as context AND appears verbatim in `post_text` | **+5** bonus | minor |
| 12 | `carousel_slide_count_out_of_range` | `5 <= total_slides <= 10` (7-10 is the sweet spot per RAG 06 §2; the 5-10 window is the hard band — outside it fails) | **-10** per slide outside 5-10 | important |
| 13 | `carousel_missing_cover` | Exactly 1 slide with `is_cover: true` AND `layout_hint: 'cover'` at `slide_number: 1` | **-15** if missing or mispositioned, **HARD FAIL** | critical |
| 14 | `carousel_missing_cta` | Exactly 1 slide with `is_cta: true` AND `layout_hint: 'cta'` at `slide_number: total_slides` | **-15** if missing or mispositioned, **HARD FAIL** | critical |
| 15 | `carousel_missing_human_fingerprint` | At least 1 slide with `layout_hint: 'human_fingerprint'` (typically slides 3-5 per Build in Public structure — the authenticity signal RAG 06 §10) | **-10** if missing | important |
| 16 | `carousel_missing_direct_answer` | At least 1 slide with `layout_hint: 'direct_answer'` AND non-empty `direct_answer_block` (30-80 words, AI-search-scrapable) | **-5** if missing | important |
| 17 | `carousel_image_prompt_missing_dead_zone` | Every slide's `image_prompt` references mobile dead zones (top 150px, bottom 200px) AND 75px margins AND 24pt body font (or numeric pixel equivalent near 46-48px) AND 1080×1350 canvas dimensions (bad render specs → bad compositor output) | **-15** per slide missing spec | important |
| 18 | `carousel_image_prompt_missing_copy_verbatim` | Every slide's `image_prompt` contains the slide's `copy` verbatim (D9 text-baked-in rule — the image generator must render the slide copy as typography in-frame) | **-20** per slide, **HARD FAIL** | critical |
| 19 | `carousel_external_link_in_slide` | No `https?://` in any slide `copy` or `direct_answer_block` | **-30** per match, **HARD FAIL** | critical |
| 20 | `carousel_cta_missing_question` | CTA slide's `copy` contains a `?` AND the sentence ending with that question mark has `>= 5` words (prompts the 5+ word reply that drives Comment Quality, the 15× weight in the Depth Score formula). Trailing emoji or a "link in comments" sign-off after the question is allowed — the rule only asks that a substantive question exists | **-15** if missing | important |

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

For a failing text post, every triggered rule must appear in `failures[]`:

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

For a failing carousel, failures cite the specific `slide_number` in `evidence` so operators can jump to the offending slide:

```json
{
  "depth_score": 15,
  "passed": false,
  "format": "carousel",
  "failures": [
    {
      "rule": "carousel_image_prompt_missing_copy_verbatim",
      "message": "slide 4 image_prompt does not contain slide.copy verbatim — D9 text-baked-in rule violated; the compositor will render blank typography",
      "severity": "critical",
      "deduction": 20,
      "evidence": "slide 4"
    },
    {
      "rule": "carousel_external_link_in_slide",
      "message": "slide 6 copy contains https://evil.com — links belong in the first comment, not on slides",
      "severity": "critical",
      "deduction": 30,
      "evidence": "https://evil.com"
    }
  ],
  "suggestions": [
    {
      "rule": "carousel_image_prompt_missing_copy_verbatim",
      "suggestion": "Rewrite slide 4's image_prompt to include the slide copy verbatim inside double quotes so the image generator bakes it as typography."
    }
  ]
}
```

## Anti-slop guard restatement

For clarity — these are the exact strings the rubric checks (case-insensitive scan over `post_text` OR slide `copy` + `direct_answer_block` depending on format). The set matches CLAUDE.md §Anti-Slop Enforcement verbatim and must stay in lockstep with the `BANNED_PHRASES` + `ENGAGEMENT_BAIT` arrays in `../linkedin-convert/schema.ts` and `../linkedin-carousel/schema.ts`.

Banned AI-slop phrases (7):

1. "delve into"
2. "unlock the power of"
3. "in today's fast-paced digital landscape"
4. "at the end of the day"
5. "navigating the complexities of"
6. "harness the power of"
7. "seamlessly integrate"

Engagement-bait strings (5, lockstep with `../linkedin-convert/schema.ts` + `../linkedin-carousel/schema.ts` blacklists):

1. "Comment YES"
2. "type a for"
3. "type a/b"
4. "Drop a 🔥"
5. "Smash that like button"

When any of these triggers, the rule fires with severity `critical` and a **-20** (slop) or **-20** (bait) or **-30** (external link) deduction per match. Multiple matches stack — a post or carousel with two banned phrases loses 40 points AND passes `hasCritical === true`, so even a 60-point score would still be `passed: false`.
