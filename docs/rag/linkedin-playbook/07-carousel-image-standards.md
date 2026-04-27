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

### 4.1 Visual hook requirements

1. **Ali (creator) MUST appear in the scene as the primary or co-primary subject** —
   describe him by name and physical action. The brand-chrome face_refs alone is
   NOT enough; Nano Banana Pro will only render Ali's face if the prompt body
   places a person in the scene. Default form: "Ali Sadikin standing in the
   foreground, [doing X action], wearing [outfit], [expression keyword]".
2. **Absurdist, surreal, or vividly literal** — take a metaphor from the topic
   and render it as a hyperrealistic photographic moment. "6 INSANE billionaire
   routines" → brain extraction scene with Ali as the surgeon. "AI is replacing
   designers" → designer being literally unplugged from a Wacom tablet by a
   robot hand while Ali watches with shock. "Cursor raised $60B" → Ali standing
   on a mountain of $100 bills, looking up at a glowing Cursor logo in the sky.
3. **Hyperrealistic execution** — render style is photographic, NOT
   illustrated, NOT cartoon. Visible skin pores, fabric weave, real lighting.
4. **Public figures named** when relevant — "Elon Musk in chair on the left,
   Mark Zuckerberg next to him, Jeff Bezos third". Nano Banana Pro recognizes
   public figures. Ali stands beside or operates on them.
5. **Layered composition** — foreground subject + middle ground action +
   background context. NOT a single centered figure on a flat backdrop. NOT
   one big text block dominating the canvas.
6. **Cinematic lighting** — Rembrandt 4:1 ratio, 3200K warm tungsten,
   volumetric haze, rim lighting on Ali's face for separation.
7. **Subject brand context** — when the topic discusses a specific brand
   (Anthropic, Google, OpenAI, Cursor, xAI), the relevant logos / UI / product
   must be visible in the scene to anchor the topic. Otherwise the visual hook
   is unmoored from the carousel content.

### 4.2 Visual-to-text ratio (NON-NEGOTIABLE)

**The image is mostly visual; text occupies a controlled lower band.**

- **70-80% of the canvas = visual content** (Ali in scene, props, background, atmosphere)
- **30-40% of the canvas = text overlay zone** (lower portion only, with smooth dark gradient blending into the visual above)
- **The text overlay MUST NOT obscure Ali's face or the focal subject** — Ali's face stays in the upper or middle portion of the frame, fully visible
- **The dark gradient zone occupies the bottom half** (smooth dark-to-transparent gradient, NOT a hard horizontal line cut)
- Anti-pattern: a slide that's 60% giant text on a flat background with a tiny graphic on the side. That's a v0.3.0 mistake — the cover MUST be a SCENE first, with text as overlay second.

### 4.3 Hook expression library (cover slide — pick one matching the framework)

Each `brief.hook_framework` maps to a specific Ali expression. Bake the
expression keywords directly into the prompt body's first paragraph.

| Hook framework | Ali's face/body | Expression phrase |
|---|---|---|
| **PAS** (pain → agitate → solve) | Furrowed brow, narrowed eyes, hands gripping head OR pointing accusingly at the pain source | "Ali Sadikin with intense protective urgency, brows drawn together creating a deep vertical furrow, jaw set with determination, looking directly into camera with a 'this matters — listen to me' gravity" |
| **AIDA** (attention number) | Eyes wide, mouth slightly parted in awe, gesturing at the data point | "Ali Sadikin's eyes blown wide open with full iris visible, eyebrows shot up high creating deep forehead lines, jaw dropped slightly in genuine astonishment, hand raised palm-out at shoulder height" |
| **before_after** | Split face — half tired/skeptical, half lit-up/transformed; OR holding before-vs-after objects | "Ali Sadikin caught mid-transformation, half his face under cool dim light showing tiredness, the other half catching warm golden rim light with a fresh awakening expression, contrast made visible" |
| **loss_aversion** | Worried, leaning forward, finger pointed at the audience | "Ali Sadikin chin lowered five degrees, looking up through brows with worried protective concern, one finger pointed at camera, body squared in confrontational authority" |
| **contrarian** | Smirk, one eyebrow raised, arms crossed OR holding the consensus thing dismissively | "Ali Sadikin closed-lip smirk with one corner lifted, one eyebrow raised higher than the other creating asymmetric intrigue, head tilted ten degrees to one side, arms crossed in 'I know better' confidence" |

### 4.4 Visual action library (16 absurd action types — pick one)

The cover scene needs an ABSURD VISUAL ACTION that makes the viewer stop
scrolling. Mix the action with the topic's metaphor. These are categories,
not literal — adapt to topic.

| # | Action | Example application |
|---|---|---|
| 1 | **Surgery / dissection** | Operating on a brain, computer, or company logo on a surgical table |
| 2 | **Levitation / floating** | Subject floating mid-air, surrounded by floating objects |
| 3 | **Explosion / shattering** | Glass / building / device shattering mid-frame |
| 4 | **Crowd of public figures** | 3-5 famous people lined up, Ali among them or operating on them |
| 5 | **Giant scale / miniature** | Ali tiny inside a giant phone; OR holding a tiny version of a billion-dollar company in his palm |
| 6 | **Apocalypse / dystopia** | Burning city, smoke, but Ali calmly walking through with a laptop |
| 7 | **Time freeze / motion frozen** | Coffee mid-pour suspended in air, papers frozen mid-fly |
| 8 | **Inversion / upside-down** | Office turned 90 or 180 degrees, Ali walking on the ceiling |
| 9 | **Body horror / impossible anatomy** | Brain glowing through skull, eyes replaced by data displays, third hand emerging |
| 10 | **Animal / object hybrid** | Computer with octopus tentacles plugged into 8 monitors |
| 11 | **Heist / spy thriller** | Ali in a vault stealing data crystals; OR cracking a corporate safe |
| 12 | **Magic / supernatural** | Glowing runes around a laptop, Ali casting a spell at code |
| 13 | **Sports / competition** | Ali in a boxing ring with two AI assistants in opposite corners |
| 14 | **Construction / industrial** | Ali welding code together with a literal welding torch |
| 15 | **Game show / trial** | Tech CEOs in a game show set, Ali as the host |
| 16 | **Ritual / ceremony** | Ali as high priest at a tech altar with employees bowing |

### 4.5 Visual hook anti-patterns (REJECT these — re-author if you find them)

- ❌ Stock photo of person at laptop
- ❌ Generic abstract gradient with floating icons
- ❌ A single text block on a flat colored background — a building screenshot on the side does NOT count as a visual hook
- ❌ AI-perfect glossy faces (must include micro-imperfections)
- ❌ "Modern minimalist" with no specific scene direction
- ❌ Cover where Ali's face is absent — the brand-chrome face_refs alone won't render him; the prompt body must place him in the scene
- ❌ Cover where text occupies more than 40% of the canvas
- ❌ Two-panel split with text on one side and a screenshot on the other (this is a v0.3.0 anti-pattern that produced the "engineer xAI" cover that lacked any visual hook)

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

### 10.1 Font name + point size leaks (CRITICAL — verified prompt-leak failure mode)

Nano Banana Pro renders the literal strings "JetBrains Mono", "Inter", "Space
Grotesk", "20pt", "24pt-equivalent", "Bold", "Black weight", "f/1.8", "85mm",
"Kodak Portra 400", etc. as visible text in the image whenever they appear in
the prompt body. This was observed in production on the very first carousel
generation: the cover image rendered "1/9 JetBrains Mono 20pt" as a literal
caption in the bottom-right corner, completely breaking the design.

**NEVER write font names, point sizes, lens specs, or film stock names as
distinct text fragments in the prompt body.** Describe them implicitly
through characteristics:

| ❌ WRONG (leaks as text) | ✅ CORRECT (renders as visual property) |
|---|---|
| "Headlines in Space Grotesk Bold" | "headlines in a clean condensed sans-serif at extra-bold weight" |
| "Body copy in Inter at 24pt-equivalent" | "body copy in a clean humanist sans-serif at the largest size that fills the width" |
| "Data labels in JetBrains Mono" | "data labels in a clean monospace style typeface" |
| "Page indicator in JetBrains Mono at 18pt" | "page indicator in a small clean monospace style numeric label" |
| "Lens: 85mm f/1.8" | "shallow depth of field with a slightly compressed focal length feel" |
| "Kodak Portra 400" | "warm golden cinematic color grade with subtle film grain" |
| "Rembrandt 4:1 ratio at 3200K" | "Rembrandt-style key light from front-left creating a triangle of light on the off-cheek, warm tungsten color cast" |

The rule of thumb: if a text fragment looks like a spec sheet entry (units,
brand name, ratio number, font name), describe it AROUND the meaning rather
than naming it directly. The image model already knows what "warm tungsten"
or "shallow depth of field" means — naming the lens or film stock just
spawns a literal text artifact.

### 10.2 Verbatim text strings — when ALL CAPS is acceptable

The ONLY strings that may appear ALL CAPS or as quoted literals in the prompt
body are the strings the image model should render as actual typography in
the image:

- Headline text quoted verbatim: `reading "INSANE — 6 RUTINITAS GILA MILIARDER TECH"` (the literal text that becomes the headline)
- Subtitle text quoted verbatim: `reading "The Insane Daily Habits Behind Their Billions"` (becomes the English subtitle)
- HUD/data callouts: `"$60B"`, `"99,000 SEARCHES/SEC"` (literal numbers in scene)
- CTA literal: `"SWIPE (GESER) >"` (rendered as the swipe indicator)
- Watermark handle: `"@alisadikinma"` (rendered as watermark text)
- Page number: `"3/9"` (rendered as page indicator)

Anything else — sizing instructions, positioning instructions, font name
guidance, lens specs — MUST be lowercase prose that describes the visual
property without naming it as a spec.

### 10.3 Brand chrome literals — let the backend handle them

The plugin authors prose ONLY. Backend (`CarouselSlideEnhancer`) appends the
brand chrome instruction paragraph automatically with the actual handle,
page indicator, swipe text, and social URL pulled from settings. **Do NOT
hand-write brand chrome literals into the prompt body** — they will be
duplicated, may conflict with the backend's append, or may use stale values.

If the plugin needs to anchor a chrome element (e.g., to position the
headline relative to the page indicator), use placeholder tokens:

- `{{HANDLE}}` → resolved to `@alisadikinma`
- `{{PORTFOLIO_URL}}` → resolved to `https://alisadikinma.com`
- `{{PAGE_INDICATOR}}` → resolved to `"3/9"`
- `{{SWIPE_TEXT}}` → resolved to `"SWIPE (GESER) >"` (empty on CTA)

These are interpolated by the backend at dispatch time. Authoring the literal
strings instead of the tokens is fine too — the backend's `appendBrandChrome`
is idempotent and skips the chrome paragraph when it detects the handle and
page indicator are already in the prompt.

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
