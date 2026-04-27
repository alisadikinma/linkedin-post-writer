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

- `refs-linkedin-carousel.md` — TWO bundled docs: (1) cover hook frameworks, slide-count rules, dead zones, typography scale, "Build in Public" flow, Human Fingerprint guidance, Direct Answer Block spec; (2) **Carousel Image Standards** — visual hook spec, bilingual headline contract, branding chrome (page number / brand icon / @handle / SWIPE), creator-face allocation, WOW 8-element gate, hyperrealistic anti-AI-look rules, mobile dead zones
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
| 8 | `direct_answer` | Short lead-in copy (~150-400 chars, within the uniform schema bound of 10-420). The real substance lives in the separate `direct_answer_block` field: **30-80 words / 150-600 chars** — self-contained paragraph summarizing the post's core answer, optimized for AI search crawlers (Perplexity, ChatGPT search). Must be standalone-readable. | 10-420 chars copy (lead-in) + 150-600 chars direct_answer_block |
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

Each `image_prompt` is **300-2500 characters** (schema-enforced; target ~1500-2200 chars of cinematic prose for production-quality renders), written to instruct GeminiGen / Nano Banana Pro to render the slide's `copy` AS IN-FRAME TYPOGRAPHY plus full brand chrome — not as an overlay applied afterward. A single image generation call produces the final slide PNG.

**The full image standards spec lives in `refs-linkedin-carousel.md` §07 (Carousel Image Standards) — it is already in your system prompt. This section is a quick checklist.** When in doubt, follow §07 §1-§14 as the law.

### 4.1 Brand chrome (every slide, baked in via prompt)

These elements are NON-NEGOTIABLE on every slide. Express them in the text-overlay paragraph of the prompt:

- **Page number** `"{slide_number}/{total_slides}"` — top-left corner, ~75px from edges, small white text. e.g., `"3/9"`.
- **Brand icon** — circular badge centered horizontally and vertically, **thirty percent opacity** (NEVER write "30%"), positioned directly above the @handle watermark. Render from the provided brand reference image — do not generate a new logo.
- **@handle watermark** — the literal text `"@alisadikinma"` in white, **thirty percent opacity**, centered horizontally directly below the brand icon.
- **SWIPE indicator** — the literal text `"SWIPE (GESER) >"` in small white, positioned directly beneath the headline text with minimal gap. **Omit this on the CTA slide only.**
- **CTA social block (last slide ONLY)** — replaces the SWIPE indicator. Render: `"Three small social media icons (Instagram logo, TikTok logo, LinkedIn logo) in a single horizontal row with '@alisadikinma' in white text beside the icons row. Below the icons row, 'https://alisadikinma.com' in white text at slightly smaller size."`

### 4.2 Bilingual headline contract (every slide that has headline copy)

The slide's `copy` field is rendered in TWO LANGUAGES inside the image:

- **Main headline (Bahasa Indonesia)** — translate the slide `copy` to Indonesian. White `#FFFFFF`, ALL CAPS, extra-bold condensed sans-serif (Oswald Black / Bebas Neue Bold / Impact family), the largest possible font size that fills the width.
- **Accent keywords (2-4 within main headline)** — pick 2-4 emotionally impactful keywords inside the headline and render them in golden `#F5A623`. Same massive size and weight. NEVER highlight just one keyword.
- **Subtitle (English)** — the original/equivalent English version, golden `#F5A623` (NEVER white — must create visual hierarchy), 70-80% size of main headline, positioned directly below.

The `copy` field on the slide JSON should hold the **English** version as the canonical copy (for downstream Depth Score / banned-phrase scanning). The `image_prompt` body must spell out the **Indonesian translation** to bake in as the main headline plus the English subtitle.

Both lines positioned starting from the **vertical center of the image extending downward, NOT crammed at the very bottom**. The text-overlay paragraph MUST include all three of these literal phrases:

1. `"remaining text in white"` after specifying accent-colored keywords
2. `"positioned starting from the vertical center of the image extending downward, not crammed at the very bottom"`
3. `"subtitle must not be white"` after the subtitle line specification

Missing any one = REJECTED. These three guard against bad text hierarchy.

### 4.3 Visual Hook (cover slide ONLY — slide 1)

The cover slide's `image_prompt` MUST describe an **absurdist, surreal, or vividly literal scene** that takes a metaphor from the topic and renders it as a hyperrealistic photographic moment. Reference example: "6 INSANE billionaire routines" → brain transplant scene with Elon Musk, Mark Zuckerberg, Jeff Bezos in surgical chairs while a doctor extracts glowing brains into specimen jars.

Visual hook requirements:

- Hyperrealistic photography (NOT illustrated, NOT cartoon, NOT vector)
- Public figures named directly when relevant — Nano Banana Pro recognizes them
- Layered composition (foreground + middle + background)
- Cinematic lighting — Rembrandt 4:1, 3200K warm tungsten, volumetric haze
- Subject brand context if the topic discusses a specific brand

Anti-patterns to avoid: stock photos at laptops, generic gradients with floating icons, single text blocks on flat color, AI-perfect glossy faces with no pores or imperfections.

### 4.4 Creator face allocation per slide type

When the creator's face (Ali) appears in the rendered image:

| Slide type | Creator face? | Notes |
|---|---|---|
| `cover` | **YES** — exaggerated emotion matching hook framework | Use `{{CREATOR_FACE}}` placeholder |
| `body` (no human figures in scene) | NO | Pure object/abstract/B-roll |
| `body` (with human figures) | **YES** | Creator most prominent foreground figure |
| `body` (about a specific public figure) | Public figure primary, creator optional companion | Name public figures directly |
| `human_fingerprint` | **YES** — first-person war story | Authentic, slight imperfections (sweat, tired eyes) |
| `direct_answer` | Optional | Text-forward — only when scene benefits |
| `cta` | **YES** — warm generous expression | MS shot |

When creator face is required, include in the prompt body: `"Maintain exact appearance from the provided creator face reference image."` The backend (`CarouselSlideEnhancer`) wires the actual face URL into GeminiGen `face_refs`.

### 4.5 WOW Quality Gate (mandatory — minimum 6/8, all 8 elements present)

Every `image_prompt` must explicitly include all 8 cinematic specifications. Score 1 point per element; 6/8 minimum to ship; 8/8 ideal:

1. **Lighting drama** — pattern + ratio + Kelvin (e.g., "Rembrandt 4:1 ratio, 3200K warm tungsten")
2. **Depth layers** — three distinct planes (foreground + subject + background)
3. **Atmosphere** — haze, volumetric particles, fog, bokeh, environmental effect
4. **Color contrast** — warm-cool tension, accent color highlights
5. **Emotional peak** — specific expression keyword (creator) or scene emotion (B-roll), never just "smiling"
6. **Camera intention** — shot type + lens + aperture + angle (e.g., "85mm f/1.8 medium close-up, slightly low angle")
7. **Texture realism** — skin pores, fabric weave, surface materials
8. **Cinematic reference** — film stock + color grade (e.g., "Kodak Portra 400, warm golden amber grade, subtle film grain")

A prompt scoring below 6/8 reads as generic AI-stock and dies in the feed.

### 4.6 Hyperrealistic anti-AI-look (mandatory micro-imperfections)

Pull 1-2 specifics per prompt from these categories to prevent the "AI-perfect glossy plastic" look: **skin** (visible pores, subtle under-eye texture, micro-sweat), **hair** (stray hairs catching light), **fabric** (natural creases, slight wrinkles), **surfaces** (scuff marks, fingerprints on metal, dust), **composition** (slight asymmetry preferred), **light** (natural falloff, slight color fringing at edges, subtle lens vignetting).

### 4.7 Mobile dead zones + technical specs

- **Top 150px**: empty negative space — LinkedIn profile overlay sits here
- **Bottom 200px**: empty except for the page-indicator band and (non-CTA) SWIPE indicator
- **Left/right 75px**: breathing margins — no headline glyphs cross these

Phrase to the model: `"leave the top 150px empty with textured background only — no text, no figures, no logos. Leave the bottom 200px similarly empty except for the centered page indicator and SWIPE (GESER) > indicator."`

Fixed technical specs (mention in paragraph 5 of every prompt):

- Aspect ratio: 1080×1350 portrait (4:5)
- Default film stock: Kodak Portra 400
- Color temperature: 3200-3500K (warm)
- Color grade: warm golden amber
- Image style: hyperrealistic

### 4.8 Prompt body rendering rules (Nano Banana Pro literalism)

Nano Banana Pro renders **every word in the prompt** as visible image content unless contextualized otherwise. Strict rules:

- **Only IN-IMAGE text in ALL CAPS** — never write "MANDATORY: render the icon" (use lowercase: "render the icon")
- **No raw percentages** — write "thirty percent opacity" not "30%"
- **No raw filenames** — write "the provided brand logo reference image" not "creator-brand.png"
- **No `//` separators** in HUD/data callouts
- **Sizing via description** — "the largest possible font size that fills the width, extra bold weight" not "MASSIVE billboard-scale"
- **Positioning lowercase** — "centered in the middle" not "CENTERED in middle"

What MAY appear in ALL CAPS: the actual in-image text (headline quoted verbatim, subtitle quoted verbatim, "@alisadikinma", "SWIPE (GESER) >", "3/9", "$60B", etc).

### 4.9 Required prompt structure (5-paragraph form)

Each `image_prompt` MUST use paragraph breaks separating these sections — single-block monolith prompts get rejected:

1. **Subject + expression + wardrobe + action**
2. **Scene + environment + spatial layers** (foreground / middle / background)
3. **Lens + lighting + film stock + atmosphere + texture** (cinematographer's spec sheet)
4. **Text overlay block** — main headline (Indonesian, white) + accent keywords (golden) + subtitle (English, golden) + brand icon center thirty percent + @alisadikinma watermark center thirty percent + SWIPE (GESER) > below headline + page number top-left
5. **Aspect ratio + constraints** — 1080×1350 portrait canvas, mobile dead zones, in-image text rendering, no URLs

### 4.10 Zero URLs in slide images

NEVER include any `https://` or `http://` string in `image_prompt`. The blog link belongs ONLY in the post's first comment (authored by `linkedin-convert`, not this skill). The CTA slide's `https://alisadikinma.com` is the ONE exception — it's the portfolio URL, NOT a blog link, and is rendered as part of the social block on the CTA slide only.

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
