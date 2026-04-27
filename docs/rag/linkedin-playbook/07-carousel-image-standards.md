# 07 — Carousel Image Standards (Visual Hook + Branding + Bilingual)

> **Source of truth** for the image_prompt body that every `linkedin-carousel`
> slide must produce. Mirrors `D:\Projects\claude-plugin\ai-image-carousel-prompt-gen`
> standards (global-config.md + creator-bible.md + prompt-formulas.md), trimmed
> to LinkedIn-only spec (4:5 portrait, no TikTok/IG variants).
>
> Companion to `06-carousel-design.md` (which covers slide COPY discipline). This
> file covers the IMAGE PROMPT discipline — the cinematic brief sent to GeminiGen
> / Nano Banana Pro to produce the actual rendered slide PNG.

## 1. Why a separate spec for image prompts

`linkedin-carousel` skill produces two things per slide:

1. `copy` — the human-readable text shown on the slide (governed by 06)
2. `image_prompt` — the 300-2500 char cinematic brief that tells the AI image
   model how to render the entire slide as a single PNG

`copy` discipline is about LinkedIn algorithm performance (hook frameworks,
human fingerprint, anti-slop, depth score). `image_prompt` discipline is about
**visual scroll-stopping power** — the brand-consistent, instantly recognizable,
cinematically-rich frame that makes a thumb stop mid-scroll.

If the copy is perfect but the image is generic stock-style, the carousel dies
in the feed. If the image is a visual hook but the copy is engagement-bait, the
algorithm demotes it. Both must be excellent. This file is the spec for the
visual side.

## 2. Brand identity contract (NON-NEGOTIABLE)

Every slide's `image_prompt` MUST instruct the renderer to bake these elements
in-frame. They are not post-production overlays — Nano Banana Pro renders text
and logos as part of the image itself.

### 2.1 Page number

- Position: top-left corner, ~75px from edges
- Format: `"{N}/{total}"` — e.g., `"1/9"`, `"5/9"`
- Style: small white text, ~18pt-equivalent on the 1080×1350 canvas
- Slides: ALL slides

### 2.2 Brand icon (creator brand logo)

- Source: `creator_brand_logo` reference image (URL passed via GeminiGen `file_urls`)
- Position: **center of image, vertically above the @handle watermark**
- Style: small circular badge, **thirty percent opacity** (NEVER write "30%" — render as text). Use the EXACT logo from the file, do not generate a new one.
- Slides: ALL slides

### 2.3 @handle watermark

- Text: `@alisadikinma` (rendered verbatim as visible text in white)
- Position: **center of image, directly below the brand icon** (forms a centered branding stack with the icon)
- Style: white text, **thirty percent opacity**, subtle background mark
- Slides: ALL slides

> Both at thirty percent opacity ensures the branding is always discoverable
> without ever competing with the headline or the visual hook.

### 2.4 SWIPE indicator

- Text: `"SWIPE (GESER) >"` (literal, both languages on one line)
- Position: bottom center, beneath the headline text with minimal gap (NOT crammed against the canvas bottom edge)
- Style: small white text
- Slides: ALL slides EXCEPT the CTA slide (last slide)

### 2.5 Bilingual headline / subtitle

For all slides with headline copy (cover, foreshadow, body, direct_answer, CTA):

- **Main headline**: Bahasa Indonesia, **white** `#FFFFFF`, ALL CAPS, extra-bold condensed sans-serif (Oswald Black / Bebas Neue Bold / Impact family). The largest possible font size that fills the width.
- **Accent keywords (2-4 within headline)**: golden `#F5A623`, same massive size and weight. Pick 2-4 emotionally impactful keywords. NEVER highlight just one.
- **Subtitle**: English translation, golden `#F5A623` (NEVER white — must create visual hierarchy with main headline), 70-80% size of the main headline, positioned directly below.

Both lines positioned starting from the **vertical center of the image extending downward, NOT crammed at the very bottom** — leaves clean breathing room for the SWIPE indicator and bottom branding stack.

### 2.6 CTA slide social block (last slide only)

Replaces the SWIPE indicator on the CTA slide:

```
Three small social media icons (Instagram logo, TikTok logo, LinkedIn logo) arranged in a single horizontal row with "@alisadikinma" in white text beside the icons row.
Below the icons row, "https://alisadikinma.com" in white text at slightly smaller size.
```

Position: lower third of canvas, centered, above the bottom dead zone.

## 3. Creator face allocation per slide type

When does the creator's face (Ali) appear in the rendered image?

| Slide type | Creator face? | Notes |
|---|---|---|
| `cover` (slide 1, hook) | **YES — always** | Exaggerated emotion matching hook framework. CU/MCU shot. |
| `body` (no human figures in scene) | NO | Pure object/abstract/B-roll visuals. |
| `body` (with human figures in scene) | **YES — always** | Creator must be the most prominent foreground figure (slightly closer to camera in crowd scenes). |
| `body` (about a public figure) | **Public figure primary**, creator optional companion | Hard rule: when the topic centers on a named public figure (CEO, head of state, criminal, celebrity), body slides show the public figure's face as primary. Creator may stand beside as a smaller companion. |
| `human_fingerprint` | **YES** | Creator IS the war story. Authentic first-person scene. |
| `direct_answer` | Optional (depends on scene) | Slide is more text-heavy; creator only when the visual benefits. |
| `cta` (last slide) | **YES — always** | Warm, generous expression. MS shot. |

The face reference URL flows in via GeminiGen `face_refs` (causes the "maintain
exact facial identity, appearance, and features" instruction to be appended).
The image prompt should also explicitly reference the character with a sentence
like: `"Maintain exact appearance from the provided creator face reference image."`

## 4. Visual Hook (cover slide only)

The cover slide is the scroll-stopper. The image_prompt for slide 1 must
include a **VISUAL HOOK**: an absurd, unexpected, emotionally-charged scene
that has nothing to do with stock photography. The reference example is the
"brain transplant of the tech billionaires" scene — Elon Musk, Mark Zuckerberg,
Jeff Bezos seated in surgical chairs while a doctor extracts glowing brains
into specimen jars. The visual is impossible, vivid, and instantly readable.

### Visual hook requirements

1. **Absurdist, surreal, or vividly literal** — the scene takes a metaphor
   from the topic and renders it as a hyperrealistic photographic moment.
   "6 INSANE billionaire routines" → brain extraction scene. "AI is replacing
   designers" → designer being literally unplugged from a Wacom tablet by a
   robot hand.
2. **Hyperrealistic execution** — render style is photographic, NOT
   illustrated, NOT cartoon. Visible skin pores, fabric weave, real lighting.
3. **Public figures named** when relevant — name them directly ("Elon Musk
   in chair on the left"). Nano Banana Pro recognizes public figures.
4. **Layered composition** — foreground subject + middle ground action +
   background context. Not a single centered figure on a flat backdrop.
5. **Cinematic lighting** — Rembrandt 4:1 ratio, 3200K warm tungsten,
   volumetric haze, rim lighting. Read `cinematography-lut.md` if specifics
   needed.
6. **Subject brand context** — when the topic discusses a specific brand
   (Anthropic, Google, OpenAI), the relevant logos / UI / product must be
   visible in the scene to anchor the topic. Otherwise the visual hook is
   unmoored from the carousel content.

### Visual hook anti-patterns

- ❌ Stock photo of person at laptop
- ❌ Generic abstract gradient with floating icons
- ❌ A single text block on a flat colored background
- ❌ AI-perfect glossy faces (must include micro-imperfections)
- ❌ "Modern minimalist" with no specific scene direction

## 5. Subject brand context (factual body slides)

When a body slide discusses a specific company / product / service (e.g.,
"Anthropic shipped X", "Cursor raised $60B"), the rendered scene MUST include
the recognizable brand element of the SUBJECT being discussed:

- Logo visible on a screen / sign / device in scene
- UI screenshot visible in the composition (e.g., the actual ChatGPT chat UI
  fragment) when the slide discusses platform behavior
- Product visible (e.g., a Vision Pro headset on a desk for an Apple slide)

Without subject brand context, the factual claim is meaningless — the viewer
sees text and abstract imagery and has no anchor to the topic.

Subject brand ≠ creator brand. Creator brand (Ali's logo + @alisadikinma) is
ALWAYS present at thirty percent opacity in the center stack. Subject brand
is the topic's brand and is ALWAYS visible at full prominence in the scene.

## 6. WOW Quality Gate (mandatory 6/8 minimum, all 8 elements present)

Every `image_prompt` must include all 8 of these cinematic specifications.
Score 1 point per element. Minimum 6/8 to ship; aim for 8/8.

| # | Element | What the prompt must include |
|---|---|---|
| 1 | **Lighting drama** | Lighting pattern + ratio + Kelvin (e.g., "Rembrandt 4:1 ratio, 3200K warm tungsten") |
| 2 | **Depth layers** | Foreground + subject + background — three distinct planes |
| 3 | **Atmosphere** | Haze, volumetric particles, fog, bokeh, or environmental effect |
| 4 | **Color contrast** | Warm-cool tension, accent color highlights, complementary palette |
| 5 | **Emotional peak** | Specific expression keyword (creator) or scene emotion (B-roll) — never just "smiling" |
| 6 | **Camera intention** | Shot type + lens + aperture + angle (e.g., "85mm f/1.8 medium close-up, slightly low angle") |
| 7 | **Texture realism** | Skin pores, fabric weave, surface materials, environmental textures |
| 8 | **Cinematic reference** | Film stock + color grade (e.g., "Kodak Portra 400, warm golden amber grade, subtle film grain") |

A `image_prompt` that scores below 6/8 reads as generic AI-stock and dies in
the feed. Re-author until at least 6 elements are explicit in the prompt body.

## 7. Hyperrealistic standard (anti-AI-look)

Every prompt MUST include language pulling from these 6 micro-imperfection
categories. Without these, Nano Banana Pro defaults to glossy "AI-perfect"
faces and surfaces that scream synthetic.

| Category | Required imperfections (paraphrase any 1-2 per prompt) |
|---|---|
| Skin | visible pores, subtle under-eye texture, micro-sweat, natural color variation |
| Hair | stray hairs catching light, not perfectly groomed |
| Fabric | natural creases, slight wrinkles, not perfectly pressed |
| Surfaces | scuff marks, fingerprints on metal, dust on shelves |
| Composition | slight asymmetry preferred, avoid perfect centering |
| Light | natural falloff, slight color fringing at edges, realistic shadow gradients, subtle lens vignetting |

## 8. Technical specs (LinkedIn carousel — fixed)

| Spec | Value |
|---|---|
| Image platform | Nano Banana Pro (exclusive) |
| Aspect ratio | 4:5 (1080×1350 portrait) |
| Resolution target | 4K (Nano Banana Pro setting) |
| Default film stock | Kodak Portra 400 |
| Color temperature | 3200-3500K (warm) |
| Color grade | Warm golden amber |
| Image style | hyperrealistic |
| Prompt length | 300-2500 chars (target ~1500-2000 of cinematic prose) |

## 9. Mobile dead zones (1080×1350 canvas)

LinkedIn UI overlays and reader gestures clip the edges. Reserve:

- **Top 150px**: empty negative space — no text, no figures, no logos. Profile overlay sits here.
- **Bottom 200px**: empty except for the small page-indicator band and (on non-CTA slides) the SWIPE indicator. Brand stack (icon + watermark) sits in the centered safe band.
- **Left/right 75px**: breathing margins — no headline glyphs cross these boundaries.

Phrase to the model: `"leave the top 150px empty with textured background only — no text, no figures, no logos. Leave the bottom 200px similarly empty except for the centered page indicator and (non-CTA slides) the SWIPE (GESER) > indicator."`

## 10. Prompt body rendering rules (Nano Banana Pro literalism)

Nano Banana Pro renders **every word in the prompt** as visible image content
unless contextualized otherwise. Strict rules to prevent text artifacts in
generated images:

| Rule | Wrong (renders as text) | Correct |
|---|---|---|
| Only IN-IMAGE text in ALL CAPS | "Text must be ULTRA MASSIVE" | "the text uses the largest possible font size" |
| No instruction caps | "MANDATORY: render the icon" | "render the icon" |
| No `//` separators | "120 TB/SEC // SPEED: LIGHT" | "120 TB/SEC" (core data only) |
| No raw percentages | "30% opacity" | "thirty percent opacity, subtle background mark only" |
| No raw filenames in body | "creator-brand.png in corner" | "render the creator's brand icon from the provided brand reference image" |
| No "Shot on" prefix | "Shot on 85mm f/1.8" | "lens: 85mm f/1.8" |
| Sizing via description | "MASSIVE billboard-scale" | "the largest possible font size that fills the width, extra bold weight" |
| Positioning lowercase | "CENTERED in middle" | "centered in the middle" |
| Negations lowercase | "NOT cold blue" | "not cold blue" |

### What MAY appear in ALL CAPS in the prompt body

Only the ACTUAL IN-IMAGE TEXT that the renderer should bake as typography:

- Headline text quoted verbatim: `"INSANE — 6 RUTINITAS GILA MILIARDER TECH"`
- Subtitle text quoted verbatim: `"The Insane Daily Habits Behind Their Billions"`
- HUD/data callouts: `"$60B"`, `"99,000 SEARCHES/SEC"`
- CTA literal: `"SWIPE (GESER) >"`
- Watermark handle: `"@alisadikinma"`
- Page number: `"3/9"`

Everything else — instructions, scene description, camera specs — lowercase
prose.

## 11. Prompt structure (5-paragraph form)

Each `image_prompt` MUST use paragraph breaks separating these sections.
Single-block monolith prompts get rejected.

1. **Subject + expression + wardrobe + action** — who is in the frame, what they're doing, what they're wearing, what mood they project.
2. **Scene + environment + spatial layers** — where, with foreground / middle ground / background description.
3. **Lens + lighting + film stock + atmosphere + texture** — the cinematographer's spec sheet.
4. **Text overlay block** — main headline (Indonesian, white), accent keywords (golden), subtitle (English, golden), brand icon center, @handle watermark center, SWIPE (GESER) > below headline, page number top-left.
5. **Aspect ratio + constraints** — 1080×1350 portrait canvas, mobile dead zones, in-image text rendering, no URLs anywhere in slide.

## 12. Text overlay enforcement (ALL THREE rules — omit any one = REJECTED)

The text-overlay paragraph MUST include these literal phrases (or close
paraphrases):

1. **Remaining text in white** — after specifying accent-colored keywords, explicitly state "remaining text in white" so the model doesn't accidentally tint the rest.
2. **Not crammed at the very bottom** — include "positioned starting from the vertical center of the image extending downward, not crammed at the very bottom".
3. **Subtitle must not be white** — include "subtitle must not be white" after the subtitle line specification, to force the golden / accent color and break the visual tie with the main headline.

Missing any = bad text hierarchy in the rendered image, reads as amateur.

## 13. Slot-by-slot quick reference

When authoring `image_prompt` for each slide type, walk down this checklist:

### Cover (slide 1 — hook)

- [ ] Visual hook scene (absurdist / surreal / vividly literal)
- [ ] Creator face primary OR public figures primary + creator companion
- [ ] Hyperrealistic photographic execution + micro-imperfections
- [ ] 5-paragraph prompt structure
- [ ] Bilingual headline: ID big white + EN small golden
- [ ] Accent keywords in golden (2-4 within headline)
- [ ] Page number "1/{N}" top-left
- [ ] Brand icon center, thirty percent opacity, above watermark
- [ ] @alisadikinma watermark center, thirty percent opacity, below brand icon
- [ ] SWIPE (GESER) > below headline (NOT bottom-cramped)
- [ ] Mobile dead zones respected (top 150px / bottom 200px / 75px margins)
- [ ] WOW gate 6/8+ — all 8 elements present
- [ ] Aspect ratio 1080×1350 portrait
- [ ] No http:// or https:// URLs anywhere

### Body (proof / listicle items)

- [ ] Subject brand context if discussing specific brand (logo / UI / product visible)
- [ ] Creator face only if scene has human figures (and topic isn't about a different public figure)
- [ ] Hyperrealistic, 5-paragraph structure, WOW 6/8+
- [ ] Bilingual headline + accent keywords
- [ ] Page number, brand icon, watermark, SWIPE — same as cover
- [ ] Cinematic detail (lighting / depth / atmosphere)

### Human Fingerprint (war story slide)

- [ ] Creator IS the subject, first-person scene
- [ ] Authentic moment: late-night debugging, whiteboard mid-thought, post-launch fatigue
- [ ] Hyperrealistic with extra emphasis on imperfections (sweat, stubble, tired eyes)
- [ ] Bilingual headline tells the war story compactly
- [ ] All branding elements + page number + SWIPE

### Direct Answer

- [ ] Cleaner, less busy composition (text-forward)
- [ ] 30-80 word `direct_answer_block` rendered as readable body copy in-frame (NOT as headline)
- [ ] Optional creator face if scene benefits
- [ ] All branding elements + page number + SWIPE

### CTA (last slide)

- [ ] Creator face primary (warm, generous expression)
- [ ] Bilingual headline asking the comment-prompting question
- [ ] **No SWIPE indicator** (last slide)
- [ ] **Social block instead**: IG/TikTok/LinkedIn icons row + "@alisadikinma" + "https://alisadikinma.com" below
- [ ] Brand icon + watermark center stack still present
- [ ] Page number top-left ("9/9" etc)

## 14. Reference image flow (what the backend wires in)

The plugin's `image_prompt` is **prose only** — it must NOT bake any URLs or
filenames into the prompt body. The backend (`CarouselSlideEnhancer`) is
responsible for:

- Resolving the creator face URL from `Setting where group=about, key=profile_photo`
- Resolving the brand logo URL from `Setting where group=creator_brand, key=creator_brand_logo`
- Adding both URLs to the GeminiGen `face_refs` and `file_urls` parameters
- Appending the per-slide branding instruction string (page number, brand icon, watermark, SWIPE / social block) AFTER the plugin's cinematic prose

The plugin authors the **scene**, the **cinematography**, the **bilingual
text content**, and the **visual hook concept**. The backend stamps the
**brand chrome** consistently on every slide. This separation lets the
brand chrome change in one place (backend Settings) without re-running the
plugin.

When the plugin authors the prompt body, it MAY use these placeholder tokens
(backend will replace them at dispatch time):

- `{{CREATOR_FACE}}` — replaced with "the provided creator face reference image" (face_refs URL is wired in by GeminiGen)
- `{{BRAND_LOGO}}` — replaced with "the provided brand logo reference image"
- `{{HANDLE}}` — replaced with literal `@alisadikinma`
- `{{PORTFOLIO_URL}}` — replaced with literal `https://alisadikinma.com` (CTA slide only)
- `{{PAGE_INDICATOR}}` — replaced with `"{N}/{total}"`
- `{{SWIPE_TEXT}}` — replaced with `"SWIPE (GESER) >"` (or omitted on CTA slide)

Tokens are optional — plugin may also write the literal values directly.
Backend's enhancer is idempotent and inserts brand instructions only if
they're not already present.
