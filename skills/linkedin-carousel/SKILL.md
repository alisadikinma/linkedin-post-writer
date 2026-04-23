---
name: linkedin-carousel
description: Convert a blog post + carousel brief into a 7-10 slide carousel JSON with cinematic image prompts (text baked in). Each slide is 1080x1350 portrait, body font 24pt+, mobile dead zones enforced. Triggers on carousel, linkedin carousel, slides, generate carousel.
model: sonnet
triggers: [carousel, linkedin carousel, slides, generate carousel]
---

# linkedin-carousel — Blog + Brief to 7-10 Slide Carousel JSON

## Purpose

Transform a finalized `Brief` (from `linkedin-brief`, `format='carousel'`) plus the source blog into a 7-10 slide carousel JSON. Each slide specifies the on-slide `copy` plus a 300-500 word cinematic `image_prompt` that instructs GeminiGen / Nano Banana Pro to render the copy AS TYPOGRAPHY IN-FRAME — not as an overlay applied afterwards. This is the D9 "text baked in AI prompt" rule from Addendum 2: a single image generation call produces the final slide PNG with background, figure, and copy all composed in one render.

## Scope boundary (Addendum 3)

This skill emits JSON only. It does NOT render images (that is GeminiGen / NB2, invoked by the backend). It does NOT compose the PDF (that is TCPDF inside the backend's `LinkedInPdfCompositionService` per Addendum 2 D10). It does NOT upload, schedule, or publish anywhere — scheduling and publishing live entirely inside the Portfolio_v2 admin panel, consuming the JSON this skill emits. Downstream concerns are explicitly out of scope.

## Reference Files

These are injected via `--append-system-prompt-file` at runtime by `LinkedInGenerationService` — do NOT read them with the Read tool.

- `refs-linkedin-carousel.md` — cover hook frameworks, slide-count rules, dead zones, typography scale, "Build in Public" flow, Human Fingerprint guidance, Direct Answer Block spec
- `refs-linkedin-playbook.md` — 2026 algorithm mechanics, pillars, anti-slop blacklist, hashtag rules

## Inputs

The calling pipeline (`linkedin-gen` orchestrator or direct subagent) passes a JSON object matching `CarouselInputSchema` (see `schema.ts`):

- `brief: Brief` — finalized output of `linkedin-brief`. MUST have `format: 'carousel'` plus `hook_framework` (one of PAS / AIDA / before_after / loss_aversion / contrarian), `pillar`, `pull_quote`, `angle`, `title_draft`. If `brief.format === 'text'`, STOP and route to `linkedin-convert`.
- `blog: { url: string; title: string; content: string }` — source post. `url` is the canonical blog URL (used only in the post's first comment — NEVER in any slide copy). `content` is the raw markdown body the slides are drawn from.

## Step 1 — Validate inputs and assert carousel format

Read `brief` and `blog` from the input JSON. First checks:

1. `brief.format === 'carousel'`. If the brief is text-format, emit `{"error":"wrong_format","detail":"brief is text; route to linkedin-convert"}` and stop. Do NOT upgrade a text brief into slides — the format decision belongs to `linkedin-brief`.
2. `brief.hook_framework` is one of: `PAS`, `AIDA`, `before_after`, `loss_aversion`, `contrarian`. If missing, stop — the cover slide cannot be authored without the framework signal.

Re-read `brief.pull_quote` verbatim. The spirit of the pull quote should land in the Human Fingerprint slide (war story / proprietary data) or the Direct Answer slide.

## Step 2 — Decide slide count based on blog shape

Inspect `blog.content` for structural cues. Target slide count by content type (from RAG 06 §2):

| Blog shape | Signal | Slide count |
|---|---|---|
| Listicle / checklist | numbered section headings (`## 1.`, `## 2.`, ...) or explicit "N patterns / N mistakes / N steps" | **9** (cover + expand + 6 items/proof + direct_answer + CTA) — pick 7 if list has ≤5 items, 10 if ≥8 items |
| Framework / tutorial | single unified model with named parts | 5-8 (denser, one part per slide) |
| Case study | narrative arc with outcome + numbers | 8-10 (more proof slides) |

Default for listicle inputs: **9 slides**. Always fall within the [7, 10] range — schema rejects anything outside.

`total_slides` MUST equal `slides.length` in the output; the schema enforces this.

## Step 3 — Author slides using the "Build in Public" structure

Every carousel in v1.0 uses the same structural template (`structure: 'build_in_public'`). Slot the 9-slide flow like this (adjust counts for 7 or 10 total):

| Slide | layout_hint | Purpose | Copy length guidance |
|---|---|---|---|
| 1 | `cover` (is_cover=true) | Hook per `brief.hook_framework`. 5-12 word headline that promises a specific payoff, resolved only on the final slide. | 40-180 chars |
| 2 | `body` | Expand the stakes. Why this matters right now. | 80-260 chars |
| 3 | `body` | Proof / first insight (or first listicle item for listicle inputs). | 80-260 chars |
| 4 | `human_fingerprint` | Ali's war story / proprietary metric / hard-won failure. Reuses `creator_brand_logo` asset as the hero figure (Addendum 2 D11). Authentic first-person voice. | 120-320 chars |
| 5 | `body` | Continue proof / listicle items 2-3. | 80-260 chars |
| 6 | `body` | Continue proof / listicle items 4-5. | 80-260 chars |
| 7 | `body` | Final proof / listicle items 6-7 / the insight payoff. | 80-260 chars |
| 8 | `direct_answer` | **30-80 word** (150-600 char) `direct_answer_block` — self-contained paragraph summarizing the post's core answer, optimized for AI search crawlers (Perplexity, ChatGPT search). Must be standalone-readable. | 200-560 chars copy, 150-600 chars in direct_answer_block |
| 9 | `cta` (is_cta=true) | 5+ word comment-prompting question + "Blog link in comments 👇" reminder. Question targets the 15× Comment Quality weight in the Depth Score formula. | 100-320 chars |

Hard structural invariants (schema-enforced):

- Exactly ONE cover slide (`is_cover: true`, `layout_hint: 'cover'`, `slide_number: 1`)
- Exactly ONE CTA slide (`is_cta: true`, `layout_hint: 'cta'`, `slide_number: total_slides`)
- At least ONE `human_fingerprint` slide (authenticity signal, RAG 06 §5 + §8)
- At least ONE `direct_answer` slide with a non-empty `direct_answer_block`
- `slide_number` forms a gapless 1..N sequence (no duplicates, no skips)
- Cover hook's signal matches `brief.hook_framework`:
  - **PAS** → slide 1 names the pain verbatim; agitates in slide 2; solution tease in slide 7-8
  - **AIDA** → slide 1 attention-grabs with a specific number or forecast
  - **before_after** → slide 1 states measurable before → after transformation
  - **loss_aversion** → slide 1 frames as "N mistakes / things costing you X"
  - **contrarian** → slide 1 cuts against a consensus LinkedIn opinion ("Stop doing X", "Everyone is wrong about Y")

## Step 4 — Build the `image_prompt` for each slide (CRITICAL — text-baked-in)

This is where Addendum 2 D9 lives. Each `image_prompt` is **300-500 words**, cinematic, written to instruct GeminiGen / Nano Banana Pro to render the slide's `copy` AS IN-FRAME TYPOGRAPHY — not as an overlay applied afterward. A single image generation call produces the final slide PNG with background, figure, and copy all composed together.

Every `image_prompt` MUST include the following specifications (in natural prose — not bullet lists — the image model responds better to prose briefs):

1. **Dimensions:** 1080×1350 pixel portrait canvas (LinkedIn's Reach King ratio).
2. **Brand palette — Dark Cinema:** deep navy `#0a0f1e` or charcoal `#121826` background, warm ember accent `#ff6b35` or teal accent `#2dd4bf`, cream / off-white text `#f3f4f6` for headline and body copy. High-contrast minimalist — not corporate blue, not gradient, not generic.
3. **Typography in-frame:**
   - Headlines in Space Grotesk Bold
   - Body copy in Inter at 24pt-equivalent sizing for the 1080px canvas (i.e., body glyphs should each measure roughly 36-48px tall in the rendered image — large enough that the final frame feels readable on a phone)
   - Data / metric labels in JetBrains Mono when the slide calls out a number
4. **The slide copy verbatim:** include the slide's `copy` field INSIDE the prompt, surrounded by double-quotes, with the instruction "render this exact text as large Space Grotesk / Inter typography filling the composition's primary copy band". This is non-negotiable — the image model must see the exact string.
5. **Mobile dead-zone discipline:** top 150 pixels of the canvas MUST be empty negative space (LinkedIn's profile overlay sits there). Bottom 200 pixels MUST be empty except for a small page-number band. Left/right 75 pixel margins kept as breathing room. Phrase this to the image model as "leave the top 150px empty with textured background only — no text, no figures, no logos. Leave the bottom 200px similarly empty except for a small centered page indicator."
6. **Page indicator:** explicit instruction to render `"{slide_number}/{total_slides}"` (e.g. `"3/9"`) in JetBrains Mono at roughly 18pt-equivalent, centered in the safe band ~120 pixels above the bottom edge (between the 75px margin and the 200px bottom dead zone).
7. **Human Fingerprint slide only:** include the explicit instruction "use `creator_brand_logo` brand asset as the hero figure, centered-left in the composition at roughly 40% canvas height, with the quoted copy filling the right 55% of the frame in Space Grotesk". This signals the backend's compositing step which asset to layer in (Addendum 2 D11 — reuses existing `creator_brand_logo` until v1.1 re-litigates).
8. **Cinematic detail:** describe mood, lighting, texture, depth. This is not decoration — cinematic prompts get better renders than flat "modern minimalist" prompts. Lean into the Dark Cinema brand: low-key lighting, subtle film grain, soft volumetric rim light on any figure, matte-paper paper-white text blocks.
9. **Zero URLs:** NEVER include any `https://` or `http://` string in `image_prompt`. Links live only in the post's first comment, not in any slide image.

The prompt should read like a cinematographer briefing a DOP, not like a bulleted spec sheet. 300-500 words of dense, readable prose per slide.

## Step 5 — Assemble the output JSON

Emit a single JSON object matching `CarouselOutputSchema` (see `schema.ts`). Structural contract:

```json
{
  "slides": [
    {
      "slide_number": 1,
      "layout_hint": "cover",
      "copy": "<5-12 word hook headline>",
      "image_prompt": "<300-500 word cinematic brief with copy baked in>",
      "is_cover": true,
      "is_cta": false
    },
    { "slide_number": 2, "layout_hint": "body", "copy": "...", "image_prompt": "...", "is_cover": false, "is_cta": false },
    { "slide_number": 4, "layout_hint": "human_fingerprint", "copy": "...", "image_prompt": "... use creator_brand_logo ...", "is_cover": false, "is_cta": false },
    { "slide_number": 8, "layout_hint": "direct_answer", "copy": "...", "image_prompt": "...", "is_cover": false, "is_cta": false, "direct_answer_block": "<30-80 word AI-search-scrapable summary>" },
    { "slide_number": 9, "layout_hint": "cta", "copy": "... Blog link in comments 👇", "image_prompt": "...", "is_cover": false, "is_cta": true }
  ],
  "total_slides": 9,
  "hook_framework": "AIDA",
  "structure": "build_in_public"
}
```

The schema's 12 `superRefine` invariants catch everything: exactly-one-cover, exactly-one-CTA, cover is slide 1, CTA is last, total_slides matches slides.length, at least one human_fingerprint, at least one direct_answer, gapless slide_number sequence, no banned phrases, no engagement bait, no http(s) URLs in slide text. If any invariant trips, re-author the offending slide — do NOT patch metadata to lie about the content.

## Anti-slop guards

Neither `copy` nor `direct_answer_block` on any slide may contain any of these phrases (case-insensitive; schema hard-fails):

- "delve into"
- "unlock the power of"
- "in today's fast-paced digital landscape"
- "at the end of the day"
- "navigating the complexities of"
- "harness the power of"
- "seamlessly integrate"

Neither `copy` nor `direct_answer_block` may contain any engagement bait CTA:

- "Comment YES"
- "Type A for" / "Type A/B"
- "Drop a 🔥"
- "Smash that like button"

And neither field may contain any `https://` or `http://` URL. Blog links belong ONLY in the post's first comment (authored by `linkedin-convert`, not this skill). A carousel that ships with a URL baked into a slide eats the 60% body-link reach penalty per RAG 06 §10 and CLAUDE.md §2026 LinkedIn Algorithm Mechanics.

If the source blog uses any banned phrase, rewrite in Ali's direct voice — concrete numbers, specific timeframes, named failure modes. The contrarian and specific-number hook frameworks are structural antidotes to slop; if a draft reaches for "delve into", switch to a proprietary metric or a contrarian thesis instead.
