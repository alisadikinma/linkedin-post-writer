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

### Upstream image framework (single source of truth)

The general cinematic image framework — WOW 8-element gate, hyperrealistic anti-AI-look, hook visual library, prompt formulas, Nano Banana Pro literalism rules — lives in the sister plugin **`ai-image-carousel-prompt-gen`** (`D:\Projects\claude-plugin\ai-image-carousel-prompt-gen\references\`). The `refs-linkedin-carousel.md` shipped with this plugin is the **LinkedIn delta** over that framework — same standards, narrowed to LinkedIn slide count + slide types + brand chrome + caption authoring. When a rule in this skill conflicts with the upstream framework, the upstream framework wins on cinematography / image craft; this skill wins on LinkedIn-specific narrative + post-body authoring.

Treat the carousel-gen plugin as the canonical reference for: aspect ratio decisions, NB2 prompt sweet spot, character consistency across slides, split-panel rules, text rendering accuracy, failure modes. This skill should NOT re-derive any of those — it should defer.

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

## Step 3 — Author slides using the 5-act narrative framework

Every carousel follows the same narrative spine — **HOOK → FORESHADOW → BODY → PEAK → CTA**. This is not stylistic — it is structural. Without all 5 beats, the deck either dies on slide 1 (no hook), loses the reader by slide 4 (no foreshadow tension), wanders without payoff (no peak), or fails to convert engagement (no CTA). The structural template (`structure: 'build_in_public'`) maps the 5 acts to slide positions:

### The 5 acts

1. **HOOK** (slide 1, `cover`) — pattern interrupt that stops the scroll. Promises a specific payoff that only resolves on the final slide. Visually MUST be **nyentrik dan nyeleneh** — absurdist, surreal, anachronistic, or vividly literal — never a polite headshot or a stock-photo abstract. See §4.3 for the visual mandate.
2. **FORESHADOW** (slide 2, `body`) — the "wait, what?" moment after the hook. Sets the stakes, names what's at risk RIGHT NOW, and TEASES the structure of what's coming without spoiling it. The reader should finish slide 2 thinking "I need to keep swiping to see how this plays out". Tension > information here.
3. **BODY** (slides 3 → N-2, mix of `body` + `human_fingerprint`) — the substance. Proof, signals, evidence, items. The `human_fingerprint` slide (Ali's war story / proprietary metric / hard-won failure) sits inside this block, NOT outside it — it's the credibility anchor that earns the right to the PEAK that follows. Each body slide MUST advance the argument; no filler.
4. **PEAK** (slide N-1, `direct_answer`) — the climactic insight. The single AHA moment the entire deck has been building toward. This is also the AI-search-optimized `direct_answer_block` — Perplexity / ChatGPT search crawlers scrape this paragraph as the article's canonical answer. PEAK = the payoff promised in the HOOK, finally landed.
5. **CTA** (slide N, `cta`) — comment-prompting question + link-in-comments reminder. Visually MUST be **nyentrik dan nyeleneh** at the same level as the HOOK — this is the structural twin of slide 1, not a polite sign-off. A bland CTA after a striking cover is a cliff-edge for engagement. See §4.4.1 for the visual mandate.

### Slide-position mapping (9-slide default; adjust counts for 7 or 10 total)

Each row's `Length (per language)` applies to BOTH `copy_id` and `copy_en` — same range, schema-enforced via per-layout invariants in `superRefine`.

| Slide | Act | layout_hint | Purpose | Length (per language) |
|---|---|---|---|---|
| 1 | **HOOK** | `cover` (is_cover=true) | Hook per `brief.hook_framework`. 5-12 word headline that promises a specific payoff, resolved only on the PEAK slide. | **40-180 chars** |
| 2 | **FORESHADOW** | `body` | Set the stakes + tease the framework. Why this matters NOW. End on tension that demands the next swipe. | 80-260 chars |
| 3 | BODY | `body` | First proof / first listicle item / first signal. | 80-260 chars |
| 4 | BODY | `human_fingerprint` | Ali's war story / proprietary metric / hard-won failure. Authentic first-person voice. The credibility anchor before more proof. | 120-320 chars |
| 5 | BODY | `body` | Continue proof / listicle items 2-3. | 80-260 chars |
| 6 | BODY | `body` | Continue proof / listicle items 4-5. | 80-260 chars |
| 7 | BODY | `body` | Final proof / listicle items 6-7. | 80-260 chars |
| 8 | **PEAK** | `direct_answer` | Climactic insight — the payoff the HOOK promised. Short lead-in copy. The real substance lives in `direct_answer_block`: **30-80 words / 150-600 chars** — self-contained paragraph summarizing the post's core answer, optimized for AI search crawlers (Perplexity, ChatGPT search). Must be standalone-readable. English only — Indonesian readers don't query AI search engines for Indonesian-language answers at scale yet. | 60-240 chars copy + 150-600 chars direct_answer_block |
| 9 | **CTA** | `cta` (is_cta=true) | 5+ word comment-prompting question + "Blog link in comments 👇" reminder. Question targets the 15× Comment Quality weight in the Depth Score formula. | 100-320 chars |

For 7-slide listicles: HOOK (1) → FORESHADOW (2) → BODY (3-5, includes human_fingerprint) → PEAK (6) → CTA (7).
For 10-slide case studies: HOOK (1) → FORESHADOW (2) → BODY (3-8, includes human_fingerprint + extra proof) → PEAK (9) → CTA (10).

The HOOK and PEAK form a promise/payoff pair — the wording on slide 1 should match the resolution on slide N-1. If the cover says "Why $60B isn't crazy", the PEAK paragraph must explicitly answer that question. Mismatched HOOK/PEAK reads as bait-and-switch and tanks Depth Score.

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

Each `image_prompt` is **300-2500 characters** (schema-enforced; target ~1500-2200 chars of cinematic prose for production-quality renders), written to instruct GeminiGen / Nano Banana Pro to render BOTH the slide's `copy_id` (Indonesian, main headline) and `copy_en` (English, subtitle) AS IN-FRAME TYPOGRAPHY plus full brand chrome — not as an overlay applied afterward. A single image generation call produces the final slide PNG.

**The full image standards spec lives in `refs-linkedin-carousel.md` §07 (Carousel Image Standards) — it is already in your system prompt. This section is a quick checklist.** When in doubt, follow §07 §1-§14 as the law.

### 4.1 Brand chrome (every slide, baked in via prompt)

These elements are NON-NEGOTIABLE on every slide. Express them in the text-overlay paragraph of the prompt:

- **Page number** `"{slide_number}/{total_slides}"` — top-left corner, ~75px from edges, small white text. e.g., `"3/9"`.
- **Brand icon** — circular badge centered horizontally and vertically, **thirty percent opacity** (NEVER write "30%"), positioned directly above the @handle watermark. Render from the provided brand reference image — do not generate a new logo.
- **@handle watermark** — the literal text `"@alisadikinma"` in white, **thirty percent opacity**, centered horizontally directly below the brand icon.
- **SWIPE indicator** — the literal text `"SWIPE (GESER) >"` in small white, positioned directly beneath the headline text with minimal gap. **Omit this on the CTA slide only.**
- **CTA social block (last slide ONLY)** — replaces the SWIPE indicator. Render: `"Three small social media icons (Instagram logo, TikTok logo, LinkedIn logo) in a single horizontal row with '@alisadikinma' in white text beside the icons row. Below the icons row, 'https://alisadikinma.com' in white text at slightly smaller size."`

### 4.2 Bilingual headline contract (every slide — TWO required fields, schema-enforced)

Every slide carries TWO copy fields, both REQUIRED by the schema. Each plays a specific rendering role inside the generated image:

- **`copy_id`** (Indonesian) → rendered AS THE MAIN HEADLINE inside the image. White `#FFFFFF`, ALL CAPS, extra-bold condensed sans-serif (Oswald Black / Bebas Neue Bold / Impact family), the largest possible font size that fills the width.
- **`copy_en`** (English) → rendered AS THE SUBTITLE directly below the Indonesian headline. Golden `#F5A623` (NEVER white — must create visual hierarchy), 70-80% size of main headline.

Plus this third element baked into the main headline:

- **Accent keywords (2-4 within `copy_id` rendering)** — pick 2-4 emotionally impactful keywords inside the Indonesian headline and render them in golden `#F5A623`. Same massive size and weight. NEVER highlight just one keyword. The `image_prompt` body specifies which words to accent.

**Per-layout length limits (schema-enforced — applies to BOTH `copy_id` and `copy_en`):**

| Layout | Min | Max | Word count target |
|---|---|---|---|
| `cover` | 40 chars | 180 chars | **5-12 word billboard headline** |
| `body` | 80 chars | 260 chars | proof / listicle item |
| `human_fingerprint` | 120 chars | 320 chars | first-person war story |
| `direct_answer` | 60 chars | 240 chars | short lead-in (real substance lives in `direct_answer_block`) |
| `cta` | 100 chars | 320 chars | comment-prompting question + reminder |

**Why per-layout (the v0.4.5 cover-bloat regression):** the prior schema used a uniform `min(10), max(420)` range. Production draft #26 cover ended up at 210+ chars / 30 words / 3 sentences instead of the spec'd 5-12 words — the bilingual headline overflow ate the visual hook. v0.4.6 hard-fails any cover above 180 chars at schema validation time.

**`copy_en` is the canonical copy for downstream:** Depth Score scoring, banned-phrase scanning, engagement-bait scanning, link-in-comment URL enforcement all run against `copy_en` (and the matching `copy_id`, since slop sometimes leaks via direct translation — "menyelami" for "delve into").

The `image_prompt` body MUST quote BOTH `copy_id` and `copy_en` verbatim so the image generator renders both as in-frame typography.

Both lines positioned starting from the **vertical center of the image extending downward, NOT crammed at the very bottom**. The text-overlay paragraph MUST include all three of these literal phrases:

1. `"remaining text in white"` after specifying accent-colored keywords
2. `"positioned starting from the vertical center of the image extending downward, not crammed at the very bottom"`
3. `"subtitle must not be white"` after the subtitle line specification

Missing any one = REJECTED. These three guard against bad text hierarchy.

### 4.3 Visual Hook (cover slide — HOOK act, slide 1) — must be NYENTRIK DAN NYELENENG

The cover slide's `image_prompt` MUST describe a **nyentrik dan nyeleneh** scene — eccentric, absurdist, anachronistic, or vividly literal — that takes a metaphor from the topic and renders it as a hyperrealistic photographic moment. "Nyentrik dan nyeleneh" is not a stylistic suggestion — it is the structural job of the HOOK. A polite or expected scene fails to interrupt the scroll and the entire deck dies on slide 1.

Reference examples that ship the bar:
- "6 INSANE billionaire routines" → brain transplant scene with Elon Musk, Mark Zuckerberg, Jeff Bezos in surgical chairs while Ali Sadikin operates as the surgeon extracting glowing brains into specimen jars.
- "Future of war isn't about bombs" → Ali Sadikin as a Roman gladiator with a battered shield deflecting bullets in mid-air, sparks ricocheting off the metal, modern automatic rifles firing from off-frame, set against a crumbling temple at dusk (anachronism — gladiator + bullets).
- "Cursor's $60B moat" → Ali standing on a chess board the size of a city block, holding a queen the size of a person, billionaires in suits frozen in mid-step around him as opponents.

What makes these "nyentrik": ONE of these techniques is in play —
1. **Anachronism** — gladiator with bullets, samurai with smartphone, cavemen running an LLM
2. **Scale absurdism** — chess piece the size of a person, brain in a specimen jar, Earth held in palm
3. **Hyperbolic literalism** — taking the topic's idiomatic metaphor and rendering it as a literal photographic scene (e.g., "code editor moat" → Ali surrounded by an actual water moat with floating IDE windows)
4. **Impossible-but-believable composition** — surgery on minds, bodies, or brands; levitation; time freeze; inversion; body-horror-lite; ritual

**Critical mandates (production-verified failures if violated):**

1. **Ali Sadikin MUST appear in the scene as primary or co-primary subject.** Pushing the creator face URL to `face_refs` alone is NOT enough — Nano Banana Pro will only render Ali if the prompt body explicitly places a person in the scene. The prompt's first paragraph MUST start with "Ali Sadikin [doing X], wearing [outfit], [expression keyword]". A cover with no person in the prose will render with NO creator face regardless of face_refs.

2. **The cover MUST be a SCENE first, with text as overlay second.** A cover with a giant text block dominating 60% of the canvas plus a small graphic on the side is a v0.3.0 anti-pattern that already shipped to production and was rejected. Visual content fills 70-80% of the canvas; text is in the lower 30-40% only as a smooth gradient overlay that does NOT obscure Ali's face.

3. **Pick a Visual Action category (one of 16)** from §07 §4.4 — surgery, levitation, explosion, public-figure crowd, giant scale, apocalypse, time freeze, inversion, body horror, animal/object hybrid, heist, magic, sports, construction, game show, ritual. The action takes the topic's metaphor and renders it as an impossible/striking photographic moment.

4. **Pick a Hook Expression** from §07 §4.3 — match `brief.hook_framework` to the matching expression library entry (PAS=intense protective, AIDA=jaw-dropped awe, before_after=split-face transformation, loss_aversion=worried-finger-pointing, contrarian=smirk-asymmetric). Bake the expression keywords into the prompt's first paragraph.

5. **Public figures named directly** when relevant — "Elon Musk on the left, Mark Zuckerberg next to him". Nano Banana Pro recognizes them. Ali stands beside or operates on them.

6. **Hyperrealistic photography** — NOT illustrated, NOT cartoon, NOT vector. Visible skin pores, fabric weave, real lighting.

7. **Subject brand context** — the topic's logos / UI / product visible in the scene to anchor the topic.

Anti-patterns (verified rejection causes):
- ❌ Cover where Ali's face is absent (face_refs alone won't render it)
- ❌ Cover where text occupies more than 40% of the canvas
- ❌ Two-panel split: text on one side, screenshot on the other (the "Engineer xAI" v0.3.0 mistake)
- ❌ Stock photo of person at laptop / generic abstract gradient with floating icons
- ❌ AI-perfect glossy faces with no pores or imperfections
- ❌ "Modern minimalist" with no specific scene direction

### 4.4 Creator face allocation per slide type

When the creator's face (Ali) appears in the rendered image:

| Slide type | Creator face? | Scene direction |
|---|---|---|
| `cover` | **YES — mandatory in prompt body** | Match hook framework expression (§4.3 + §07 §4.3). Place Ali in the visual action scene (§07 §4.4) as primary or co-primary subject. |
| `body` (no human figures in scene) | NO | Pure object / abstract / B-roll. Subject brand UI / logo / product visible. |
| `body` (with human figures) | **YES — mandatory in prompt body** | Ali as the most prominent foreground figure, slightly closer to camera in crowd scenes. |
| `body` (about a specific public figure) | Public figure primary, Ali optional companion | Name the public figure directly; Ali stands beside or interacts with them. |
| `human_fingerprint` | **YES — Ali IS the war story** | First-person scene: late-night debugging, whiteboard mid-thought, post-launch fatigue. Authentic micro-imperfections (sweat, stubble, tired eyes, unkempt hair). |
| `direct_answer` | Optional — only when scene benefits | Text-forward composition; creator face only if it adds meaning. |
| `cta` | **YES — mandatory + must be nyentrik (striking)** | See §4.4.1 below — the CTA must compel the viewer to comment / follow / share. NOT a polite head-and-shoulders headshot. |

When creator face is required, include in the prompt body's first paragraph:
"**Ali Sadikin [doing specific action], wearing [specific outfit], [specific
expression keyword from §07 §4.3]**." Then append: "Maintain exact appearance
from the provided creator face reference image." The backend
(`CarouselSlideEnhancer`) wires the actual face URL into GeminiGen `face_refs`,
but the prompt body MUST place him in the scene first.

### 4.4.1 CTA slide visual direction (last slide — CTA act) — must be NYENTRIK DAN NYELENENG

The CTA is the structural twin of the HOOK — same act-of-narrative weight, same nyentrik mandate. It is the second-most-important slide after the cover and the last visual the reader sees before deciding to comment, follow, or share. A bland corporate headshot here cliffs engagement off whatever the deck has built up.

Apply the same nyentrik techniques as §4.3 (anachronism, scale absurdism, hyperbolic literalism, impossible-but-believable composition) to the CTA scene — not a "polite question pose" but a visual moment that earns the action. Reference example shipping the bar: cover slide shows Ali as a Roman gladiator deflecting bullets; CTA slide ALSO keeps Ali in the gladiator armor but in a thoughtful close-up with floating tech icons (rocket, satellite, shield, glowing dust) around him. The visual continuity is intentional — the CTA must feel like the same nyentrik universe as the cover, NOT a sudden return to corporate Ali.

Pick ONE CTA type matching the topic's engagement goal:

Pick ONE CTA type matching the topic's engagement goal:

| CTA type | Ali's posture + expression | Scene direction |
|---|---|---|
| **Polarize** ("Which side are you on?") | Smirk, one eyebrow raised, arms crossed in confident challenge | Ali standing between two physical sides — left side bright/clean, right side dark/cluttered — gesturing the viewer to pick |
| **Question** ("What would you do?") | Warm direct gaze into camera, head tilted, hand at chin in genuine curiosity | Tight close-up of Ali's face with subject brand element softly out of focus in the background |
| **Identity Tag** ("If you're a [type], comment X") | Open laughing warmth, nudging gesture toward camera | Ali surrounded by representations of the identity types (laptops for devs, mics for creators, etc.) |
| **Engagement Reward** ("Comment 'GUIDE' for the framework") | Generous excitement, presenting a glowing object/document toward camera | Ali holding a literal "reward" — a glowing book, a key, a folder labeled with the prize |

Anti-patterns for CTA:
- ❌ Boring corporate headshot of Ali smiling at the camera with text "What do you think?"
- ❌ Empty hands, neutral pose, no scene context
- ❌ CTA without subject brand context (the viewer should still know what topic this is about)
- ❌ Text-heavy slide where the social block (IG/TikTok/LinkedIn icons + handle + URL) is buried

The CTA MUST include the social block — IG/TikTok/LinkedIn icons in a row, `@alisadikinma` next to the icons, `https://alisadikinma.com` below — in the lower third of the canvas. Backend's `CarouselSlideEnhancer` appends this automatically; do NOT bake it into the prompt body.

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

The canvas is **3:4 portrait (1080×1440)** — Imagen-native ratio (one of `1:1, 16:9, 9:16, 4:3, 3:4`), set by the backend wrapper (`LinkedInCarouselImageService::buildPayload`) sending `aspect_ratio: '3:4'` to GeminiGen. Chosen over 1:1 to give the bilingual headline + visual hook more vertical real estate, and over 4:5 because GeminiGen empirically rejected 4:5 on draft #28's first render (fell back to 16:9 default).

**Cross-platform reuse** — the same 3:4 (1080×1440) image posts cleanly on all three target platforms:

| Platform | Native carousel ratio | What 3:4 does there |
|---|---|---|
| LinkedIn carousel | 4:5 or 1:1 | Renders full-bleed; both ratios supported |
| Instagram Feed | 4:5 (1080×1350) | Center-cropped to 4:5 — minor top/bottom trim, no letterbox |
| TikTok photo carousel | 9:16 (1080×1920) | Centered with small top/bottom letterbox — image stays sharp |

Authoring discipline: keep the **headline text band + brand chrome (page number / SWIPE / social block) inside the inner 1080×1350 4:5 safe zone** so when Instagram crops, no critical text is lost. The visual hero (Ali, scene, props) can extend into the full 1440 height — those pixels will simply be trimmed on IG without losing the message.

| Ratio | Top dead zone | Bottom dead zone | Side margins | Visual area | Text band |
|---|---|---|---|---|---|
| **3:4 (1080×1440)** — current default | 160px | 240px | 75px | upper ~1040px | lower ~280px |
| 4:5 IG-safe inner band | 105px (top trim ~45px on IG) | 195px (bottom trim ~45px on IG) | 75px | — | — |

Phrase to the model: `"leave the top 160 pixels empty with textured background only — no text, no figures, no logos. The bottom 240 pixels house the headline text band with a smooth dark gradient blending into the visual content above. Side margins of 75 pixels on left and right. Keep the headline text and brand chrome (page number, swipe indicator, social block) within the central 1080 by 1350 area so the image crops cleanly when reposted on Instagram Feed."`

Fixed technical specs (mention in paragraph 5 of every prompt):

- Aspect ratio: 1080×1440 portrait (3:4) — IMPORTANT, do not request other ratios; the wrapper hardcodes 3:4
- Default film stock: Kodak Portra 400
- Color temperature: 3200-3500K (warm)
- Color grade: warm golden amber
- Image style: hyperrealistic

### 4.8 Prompt body rendering rules (Nano Banana Pro literalism)

Nano Banana Pro renders **every word in the prompt** as visible image content unless contextualized otherwise. The full rule set is in §07 §10. Most-violated rules summarized here:

- **Only IN-IMAGE text in ALL CAPS** — never write "MANDATORY: render the icon" (use lowercase: "render the icon")
- **No raw percentages** — write "thirty percent opacity" not "30%"
- **No raw filenames** — write "the provided brand logo reference image" not "creator-brand.png"
- **No `//` separators** in HUD/data callouts
- **Sizing via description** — "the largest possible font size that fills the width, extra bold weight" not "MASSIVE billboard-scale"
- **Positioning lowercase** — "centered in the middle" not "CENTERED in middle"

**CRITICAL — NEVER write font names, point sizes, lens specs, or film stock names as text fragments.** Verified production failure: a v0.3.0 cover prompt contained "JetBrains Mono 20pt" as a text-overlay direction; Nano Banana Pro rendered the literal string "1/9 JetBrains Mono 20pt" in the corner of the image. See §07 §10.1 for the full anti-pattern table:

| ❌ WRONG (leaks as text) | ✅ CORRECT (renders as visual property) |
|---|---|
| "Headlines in Space Grotesk Bold" | "headlines in a clean condensed sans-serif at extra-bold weight" |
| "Page indicator in JetBrains Mono at 18pt" | "page indicator in a small clean monospace style numeric label" |
| "Lens: 85mm f/1.8" | "shallow depth of field with a slightly compressed focal length feel" |
| "Kodak Portra 400" | "warm golden cinematic color grade with subtle film grain" |

What MAY appear in ALL CAPS or as literal quoted strings: the actual in-image text the model should render as typography (headline quoted verbatim, subtitle quoted verbatim, "@alisadikinma", "SWIPE (GESER) >", "3/9", "$60B", etc). Anything that looks like a spec sheet entry — units, brand names, ratios — describe AROUND the meaning instead of naming it.

### 4.9 Required prompt structure (5-paragraph form)

Each `image_prompt` MUST use paragraph breaks separating these sections — single-block monolith prompts get rejected:

1. **Subject + expression + wardrobe + action** (Ali by name in cover / human-fingerprint / cta)
2. **Scene + environment + spatial layers** (foreground / middle / background)
3. **Lens + lighting + film stock + atmosphere + texture** (cinematographer's spec sheet — described as visual properties, NEVER as literal font names or lens specs per §4.8)
4. **Text overlay block** — main headline (Indonesian, white) + accent keywords (golden) + subtitle (English, golden) + brand icon center thirty percent + @alisadikinma watermark center thirty percent + SWIPE (GESER) > below headline + page number top-left
5. **Aspect ratio + constraints** — 1080×1440 portrait canvas (3:4), mobile dead zones (top 160px / bottom 240px / 75px side margins), keep headline + chrome inside central 1080×1350 IG-safe zone, in-image text rendering, no URLs in slide

### 4.10 Zero URLs in slide images

NEVER include any `https://` or `http://` string in `image_prompt`. The blog link belongs ONLY in the post's first comment (authored by `linkedin-convert`, not this skill). The CTA slide's `https://alisadikinma.com` is the ONE exception — it's the portfolio URL, NOT a blog link, and is rendered as part of the social block on the CTA slide only.

The prompt should read like a cinematographer briefing a DOP, not like a bulleted spec sheet. 300-500 words of dense, readable prose per slide.

## Step 5 — Author the LinkedIn post body (caption + hashtags + link_comment)

The carousel ships with a native LinkedIn post body — the text the reader sees ABOVE the carousel before they swipe. This is separate from per-slide copy (which is rendered IN-IMAGE) and from the cover slide hook headline. The schema requires THREE additional top-level fields:

### `caption` (800-1500 chars, target 1100-1300)

The post body. Same character budget as a text-format post (matches RAG 05 sweet spot). Functions as a **swipe teaser** — hooks the reader, gives just enough context to want to swipe, mentions the topic-specific stake. Does NOT recap the slides verbatim — that kills swipe motivation. Structure:

1. **Hook line (one sentence, 80-200 chars)** — the pattern interrupt that stops the scroll. Mirror the cover slide's hook framework (PAS / AIDA / before_after / loss_aversion / contrarian) but state it as prose, not a billboard headline.
2. **Stakes paragraph (2-3 sentences, ~250-400 chars)** — why this matters right now. Concrete numbers, named entities, specific timeframes. Sets up the "swipe to see" promise.
3. **Tease the framework (2-3 short sentences, ~200-300 chars)** — name what's in the carousel without spoiling it. "I broke this down into N signals across 9 slides" or "Here's what the $60B tells us, in 9 frames" — gives the reader a concrete reason to invest the swipe.
4. **Call to swipe (one short sentence, 40-100 chars)** — explicit invitation. "Swipe →" or "Geser →" or "Tap untuk lihat semuanya" works. NOT engagement bait ("Comment YES if...").
5. **Optional credibility note (one sentence, ~80-150 chars)** — first-person credibility marker. "Worked on this 6 years; never seen this dynamic" or "I've shipped 12 LLM features; here's what surprised me".

### `hashtags` (3-5 array of strings, each `#Word` format)

3-5 hashtags. Mix of broad (max 2) + niche (2-3) per RAG 05. LinkedIn's algorithm punishes hashtag stuffing — keep it conservative.

- **Broad** (high traffic, generic): `#AI`, `#Tech`, `#Startup`, `#Leadership`, `#ProductManagement`
- **Niche** (specific, lower volume but higher relevance): `#AnthropicAPI`, `#CursorIDE`, `#xAIGrok`, `#LLMOps`, `#DeveloperTools`

Pick hashtags that match the topic — for "Cursor acquisition" carousel: `#AI`, `#Cursor`, `#Anthropic`, `#xAI`, `#StartupStrategy` is appropriate. Avoid `#FollowMe`, `#LinkedInGrowth`, `#Influencer` style spam tags.

### `link_comment` (50-500 chars)

The text of the FIRST COMMENT that gets posted automatically after the carousel goes live. **Must contain exactly one http(s) URL** — the blog URL — schema-enforced. Format:

`[1-2 sentence bridge that ties the post body to the full article] [blog URL]`

Example: "Detail teknis lengkap soal kenapa Cursor punya 18 bulan moat, plus breakdown apa yang bikin code editor jadi defensible AI app: https://alisadikinma.com/blog/musks-60-billion-cursor-acquisition"

Why a separate comment instead of body link: LinkedIn applies a 60% reach penalty to posts with body links (RAG 06 §10 + CLAUDE.md §2026 LinkedIn Algorithm Mechanics). Putting the link in the first comment keeps the post body link-free → algorithm doesn't demote, then the comment surfaces the link to anyone interested.

## Step 6 — Assemble the output JSON

Emit a single JSON object matching `CarouselOutputSchema` (see `schema.ts`). Structural contract:

```json
{
  "slides": [
    {
      "slide_number": 1,
      "layout_hint": "cover",
      "copy_id": "<Indonesian 5-12 word billboard headline, ALL-CAPS feel — 40-180 chars>",
      "copy_en": "<English 5-12 word equivalent — 40-180 chars>",
      "image_prompt": "<300-2500 char cinematic brief with Ali in scene + BOTH copy_id and copy_en quoted verbatim for in-image typography + brand chrome>",
      "is_cover": true,
      "is_cta": false
    },
    { "slide_number": 2, "layout_hint": "body", "copy_id": "<ID, 80-260>", "copy_en": "<EN, 80-260>", "image_prompt": "...", "is_cover": false, "is_cta": false },
    { "slide_number": 4, "layout_hint": "human_fingerprint", "copy_id": "<ID war story, 120-320>", "copy_en": "<EN war story, 120-320>", "image_prompt": "... Ali in war-story scene ...", "is_cover": false, "is_cta": false },
    { "slide_number": 8, "layout_hint": "direct_answer", "copy_id": "<ID lead-in, 60-240>", "copy_en": "<EN lead-in, 60-240>", "image_prompt": "...", "is_cover": false, "is_cta": false, "direct_answer_block": "<30-80 word AI-search-scrapable summary, English only>" },
    { "slide_number": 9, "layout_hint": "cta", "copy_id": "<ID question + 'Blog link di kolom komentar 👇', 100-320>", "copy_en": "<EN question + 'Blog link in comments 👇', 100-320>", "image_prompt": "... Ali in nyentrik CTA scene ...", "is_cover": false, "is_cta": true }
  ],
  "total_slides": 9,
  "hook_framework": "AIDA",
  "structure": "build_in_public",
  "caption": "<800-1500 char LinkedIn post body — swipe teaser, NOT a slide recap>",
  "hashtags": ["#AI", "#Cursor", "#Anthropic", "#xAI", "#StartupStrategy"],
  "link_comment": "<50-500 chars — 1-2 sentence bridge + blog URL>"
}
```

The schema's `superRefine` invariants catch everything: exactly-one-cover, exactly-one-CTA, cover is slide 1, CTA is last, total_slides matches slides.length, at least one human_fingerprint, at least one direct_answer, gapless slide_number sequence, **per-layout copy length applied to BOTH copy_id and copy_en** (cover 40-180, body 80-260, human_fingerprint 120-320, direct_answer 60-240, cta 100-320), no banned phrases (in slides + caption + link_comment), no engagement bait, no http(s) URLs in slide text or caption, exactly one http(s) URL in link_comment. If any invariant trips, re-author the offending slide — do NOT patch metadata to lie about the content.

## Anti-slop guards

Neither `copy_id` nor `copy_en` nor `direct_answer_block` on any slide may contain any of these phrases (case-insensitive; schema hard-fails). Indonesian translations of these phrases are also flagged — Sonnet sometimes sneaks slop in via direct translation ("delve into" → "menyelami"):

- "delve into"
- "unlock the power of"
- "in today's fast-paced digital landscape"
- "at the end of the day"
- "navigating the complexities of"
- "harness the power of"
- "seamlessly integrate"

Neither `copy_id` nor `copy_en` nor `direct_answer_block` may contain any engagement bait CTA:

- "Comment YES"
- "Type A for" / "Type A/B"
- "Drop a 🔥"
- "Smash that like button"

And neither field may contain any `https://` or `http://` URL. Blog links belong ONLY in the post's first comment (authored by `linkedin-convert`, not this skill). A carousel that ships with a URL baked into a slide eats the 60% body-link reach penalty per RAG 06 §10 and CLAUDE.md §2026 LinkedIn Algorithm Mechanics.

If the source blog uses any banned phrase, rewrite in Ali's direct voice — concrete numbers, specific timeframes, named failure modes. The contrarian and specific-number hook frameworks are structural antidotes to slop; if a draft reaches for "delve into", switch to a proprietary metric or a contrarian thesis instead.
