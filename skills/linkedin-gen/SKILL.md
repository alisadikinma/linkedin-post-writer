---
name: linkedin-gen
description: End-to-end LinkedIn post generator. Orchestrates linkedin-brief -> linkedin-convert -> linkedin-validate for text format. For carousel format the orchestrator authors the brief only and short-circuits with status=route_to_carousel_gen — the backend dispatches the universal /carousel-gen engine separately. Triggers on linkedin-gen, generate linkedin post, blog to linkedin, gen linkedin.
model: sonnet
triggers: [linkedin-gen, generate linkedin post, blog to linkedin, gen linkedin]
---

# linkedin-gen — Blog to LinkedIn Draft (Single-Shot Orchestrator)

## Purpose

Convert one blog post into a single `OrchestratorOutput` JSON blob (schema: `skills/linkedin-gen/schema.ts` → `OrchestratorOutputSchema`) in **one model generation**.

**Text format** (1100-1300 char native LinkedIn post): the blob contains the brief, the post (`ConvertOutput`), the validation (`Depth Score`), and envelope metadata.

**Carousel format**: the blob contains the brief only and emits `status: 'route_to_carousel_gen'`. The backend dispatches the universal `/carousel-gen` engine (in the `ai-image-carousel-prompt-gen` plugin) using the brief + blog URL, runs `CarouselGenOutputAdapter` to materialize slides + image prompts, and persists the carousel directly. No carousel work happens inside this skill post-v0.5.0 — the legacy `/linkedin-carousel` skill was deleted.

No multi-turn back-and-forth, no chained subprocess calls, no sub-skill dispatch from the orchestrator side — one response, one JSON.

Scope boundary per Addendum 3: you do NOT publish, you do NOT schedule, you do NOT notify, you do NOT call any backend. The admin panel consumes the JSON this skill emits and drives everything downstream from there.

## THIS IS A SINGLE-GENERATION SKILL

Critical operational note. This skill runs under `claude -p "/linkedin-gen ..."` (non-interactive mode). You get ONE generation turn. For text format you produce the brief, the post, the validation, and the final envelope all in that one turn, assembled into a single JSON object emitted at the end of your response. For carousel format you produce the brief and a route-to-carousel-gen envelope only.

Do NOT stop after producing the brief on the text path. Do NOT emit the brief as a standalone JSON and then say "now the next skill will run". There is no next skill that will run — the phases labelled Step 1 through Step 4 below are internal reasoning phases of your single response, not external skill invocations. The sibling skills `linkedin-brief`, `linkedin-convert`, and `linkedin-validate` exist as standalone skills for targeted operator actions in the admin panel (e.g. "regenerate just the brief"), but when `/linkedin-gen` runs in text mode, you do the work of all phases inline and emit exactly one JSON blob.

Your response MUST end with the complete `OrchestratorOutput` JSON object. Anything short of that is a failure.

## Reference files

Three compiled refs are injected via `--append-system-prompt-file` by the production invoker: `refs-linkedin-playbook.md` (algorithm mechanics + Depth Score formula + pillars + anti-slop list), `refs-linkedin-templates.md` (12 text hook formulas, CTA bank, structural templates), and `refs-linkedin-formats.md` (text vs carousel decision matrix). The legacy `refs-linkedin-carousel.md` was retired in v0.5.0 — carousel design specs live in the `/carousel-gen` engine's compiled refs (`refs-carousel-gen-pipeline.md`), which the backend feeds separately.

## Input

The orchestrator accepts `OrchestratorInputSchema` (see `schema.ts`):

```json
{
  "blog": {
    "url": "https://alisadikinma.com/blog/<slug>",
    "title": "<blog title>",
    "content": "<raw markdown body, >=100 chars>"
  }
}
```

The production bridge (cron → SSH → Claude CLI) is responsible for scraping the blog URL into this shape before handing it over. For interactive debugging, an operator may paste the blog inline.

## Step 1 — Decide the brief (inline phase)

Analyze the blog. Produce the `Brief` fields that will go into `envelope.brief`:

- `format`: `"text"` (short, opinionated, 1100-1300 chars) OR `"carousel"` (7-10 slides, listicle / framework / case study density). Use `refs-linkedin-formats.md` decision matrix — listicles with 5+ items and case studies with 3+ proof beats lean carousel; single-argument takes and narrative bits lean text.
- `hook_id` (only when `format='text'`) — one of the 12 text hook formulas in `refs-linkedin-templates.md` §1 (`pas`, `aida`, `contrarian`, `pattern_interrupt`, `loss_aversion`, `curiosity_gap`, `specific_number`, `bold_claim`, `story_opener`, `question`, `stat_drop`, `before_after`).
- `hook_framework` (only when `format='carousel'`) — one of the 5 carousel cover-hook frameworks (`PAS`, `AIDA`, `before_after`, `loss_aversion`, `contrarian`).
- `pillar`: one of `ai_generalist`, `ai_solopreneur`, `vibe_coding`, `ai_agents`. Off-pillar posts get throttled by LinkedIn's Knowledge Graph.
- `pull_quote` (40-240 chars): a standalone quotable line from the blog's core argument.
- `angle` (20-200 chars): the specific framing this post takes on the blog's thesis.
- `title_draft` (10-120 chars): a draft title the admin panel can surface to the operator.
- `linkedin_conversion_confidence` (0-1): your honest confidence the blog material will perform as a LinkedIn post.

Hold the brief in working memory. Do not emit it yet.

If the blog is too short (<100 chars of content) or contains no argument worth surfacing, emit `status: 'failed'` with `error.step = 'brief'` in the final envelope at Step 4 and skip Steps 2-3.

## Step 2 — Branch on brief.format

### Step 2a — `format === 'text'`

Produce the `ConvertOutput` fields that will go into `envelope.post`:

- `post_text` (1100-1300 chars, **hard range**): 3-7 short paragraphs separated by `\n\n`, each paragraph 1-2 sentences max. First three lines (≤200 chars) must carry the hook — the rest of the post is invisible until the reader taps "See more".
- `hashtags` (3-5 entries, each matching `/^#[A-Za-z0-9]+$/`).
- `link_comment` (20-280 chars): the text that will go into the post's first comment, MUST contain an `https?://` URL pointing back to the blog (link-in-comment discipline, avoids the 60% reach penalty for in-body links).
- `char_count`: `post_text.length` (must equal the actual computed length).
- `paragraph_count`: count of `\n\n`-separated paragraphs in `post_text`.
- `hook_used`: the first paragraph's text (evidence the hook was applied).

`carousel` slot will be `null`. Continue to Step 3 (validation).

### Step 2b — `format === 'carousel'` — SHORT-CIRCUIT

Do NOT produce any carousel content. Do NOT score Depth Score. The backend dispatches `/carousel-gen` (universal carousel engine in the `ai-image-carousel-prompt-gen` plugin) using the brief + blog URL, runs `CarouselGenOutputAdapter` to assemble the slides[] envelope, and persists everything directly. Validation runs inside the `/carousel-gen` schema (structural invariants on slide count, layout hints, bilingual fields, etc.) — Depth Score does not apply to image-prompt carousels.

Skip Step 3 and emit the envelope at Step 4 with:

```json
{
  "status": "route_to_carousel_gen",
  "format": "carousel",
  "brief": { ... from Step 1 ... },
  "post": null,
  "carousel": null,
  "validation": null,
  "generated_at": "<ISO 8601 timestamp>"
}
```

## Step 3 — Score the Depth Score (text only — skipped for carousel)

Score the text post produced in Step 2a against the rubric in `refs-linkedin-playbook.md`. Produce the `Validation` fields that will go into `envelope.validation`:

- `depth_score` (0-100, integer): start at 100, subtract deductions as rules trigger.
- `passed`: MUST equal `(depth_score >= 80) AND (no failures with severity='critical')`. If your math disagrees with `passed`, you made an arithmetic error — recompute, do NOT patch `passed` to match.
- `format`: matches `brief.format`.
- `failures`: array of every triggered rule. Each entry carries `rule` (stable snake_case id), `message`, `severity` (`critical`/`important`/`minor`), `deduction`, optional `evidence` quoting the offending substring.
- `suggestions`: one actionable fix per critical/important failure (minor failures may skip).

Critical hard-fail rules (each -20 to -30, trigger `severity: 'critical'`, block `passed: true` regardless of score):
- `external_link_in_body` — any `https?://` inside `post_text`. Links go in `link_comment` only.
- `ai_slop_phrase` — any of the 7 banned phrases listed in the Anti-slop section below, scanned case-insensitively.
- `engagement_bait` — any of the 5 bait phrases listed in the Anti-slop section below.

Important rules (-5 to -20, do NOT block `passed` on their own unless score drops below 80):
- `hook_strength_missing` — first-3-lines contain no digit, timeframe word, contrarian marker, or curiosity-gap signal.
- `char_count_out_of_range` — text post outside 1100-1300.
- `paragraph_rhythm_violation` — any paragraph with 3+ lines.
- `missing_closing_question` — text post not ending with a 5+ word question.
- `hashtag_count_out_of_range` / `hashtag_format_invalid`.
- `link_comment_missing_url`.

Minor rules (-5): presentational nits.

Bonus: `pull_quote_verbatim_bonus` (+5) when `brief.pull_quote` appears verbatim inside `post_text`.

## Step 4 — Assemble and emit the envelope

Now emit exactly ONE JSON object matching `OrchestratorOutputSchema`. This is the only JSON emission in your entire response — no intermediate JSON blobs for the brief, post, or validation.

Shape of the emission:

```json
{
  "status": "complete",
  "format": "text",
  "brief": { ... from Step 1 ... },
  "post": { ... from Step 2a ... },
  "carousel": null,
  "validation": { ... from Step 3 ... },
  "generated_at": "<ISO 8601 timestamp>"
}
```

Or for carousel (route to /carousel-gen):

```json
{
  "status": "route_to_carousel_gen",
  "format": "carousel",
  "brief": { ... from Step 1 ... },
  "post": null,
  "carousel": null,
  "validation": null,
  "generated_at": "<ISO 8601 timestamp>"
}
```

Or on failure at any phase:

```json
{
  "status": "failed",
  "format": "text",
  "brief": { ... if produced ... } ,
  "post": null,
  "carousel": null,
  "validation": null,
  "error": { "step": "brief", "message": "<what failed and why>" },
  "generated_at": "<ISO 8601 timestamp>"
}
```

### Output formatting rules

**Pipeline mode** (the default — called by admin panel or cron via SSH): your entire response is ONE JSON object. No prose before the opening `{`. No prose after the closing `}`. No markdown code fences (no ` ```json `, no ` ``` `). No leading commentary. No trailing summary. The admin panel's parser expects a raw JSON document, not prose with JSON embedded.

**Interactive mode** (operator debugging via Claude Code CLI): same raw JSON first, then if the operator explicitly asked for a summary you MAY append a brief human-readable recap after a blank line. Summaries are presentational and must NOT appear inside the JSON blob.

When in doubt about mode, emit pipeline mode — a parseable JSON response is always safe; trailing prose might not be.

## Output

Authoritative shape: `skills/linkedin-gen/schema.ts` → `OrchestratorOutputSchema`.

Invariants (enforced by superRefine in the schema):

- `status='complete'` + `format='text'` ⇒ `post` + `validation` non-null AND `carousel=null`
- `status='route_to_carousel_gen'` + `format='carousel'` ⇒ brief non-null AND `post`/`carousel`/`validation` all null. Backend dispatches `/carousel-gen` from this envelope.
- `status='deferred_to_phase_c'` ⇒ `post`/`carousel`/`validation` all null (retained as a generic escape hatch for future formats without converters)
- `status='failed'` ⇒ `error` block present (step from `'brief' | 'convert' | 'validate'`, human-readable message)

The orchestrator NEVER retries with modified inputs to try to "fix" a low Depth Score. If scoring produces `passed: false, depth_score: 72`, surface that faithfully. The admin panel decides the next operator action (regenerate with feedback, manual edit, cancel).

## Anti-slop

Banned AI-slop phrases (case-insensitive, any occurrence triggers `rule: 'ai_slop_phrase', severity: 'critical', deduction: 20` per match):

1. "delve into"
2. "unlock the power of"
3. "in today's fast-paced digital landscape"
4. "at the end of the day"
5. "navigating the complexities of"
6. "harness the power of"
7. "seamlessly integrate"

Engagement-bait phrases (case-insensitive, any occurrence triggers `rule: 'engagement_bait', severity: 'critical', deduction: 20` per match):

- "Comment YES"
- "Type A for" / "Type A/B"
- "Drop a 🔥"
- "Smash that like button"

These are lockstep with the individual schema guards in `linkedin-convert/schema.ts` and `linkedin-validate/schema.ts`. If you produce content that contains any of the above, your own Depth Score scoring in Step 3 MUST catch it and emit the failure — do not silently scrub the phrase, do not pretend the content is clean. Faithful self-scoring is the whole point of this skill owning the full text pipeline.
