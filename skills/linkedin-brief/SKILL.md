---
name: linkedin-brief
description: Convert a blog post into a LinkedIn brief JSON (format decision, hook selection, pillar routing, pull quote). Triggers on brief, linkedin brief, convert blog, plan linkedin post.
model: sonnet
triggers: [brief, linkedin brief, convert blog, plan linkedin post]
---

# linkedin-brief — Blog to LinkedIn Strategic Brief

## Purpose

Transform a published blog post (URL or raw markdown) into a strategic brief JSON that downstream skills (`linkedin-convert`, `linkedin-carousel`, `linkedin-validate`) consume as their input contract. The brief decides the surface format (text vs carousel), picks the hook formula, routes the post to one of Ali's four brand pillars, extracts the single most quotable pull quote, states the LinkedIn-specific angle (which is often narrower or more opinionated than the blog thesis), and scores conversion confidence. No draft copy is produced at this stage — that is `linkedin-convert` / `linkedin-carousel`'s job. This skill is the planning gate.

## Reference Files

These are injected via `--append-system-prompt-file` at runtime by `LinkedInGenerationService` — do NOT read them with the Read tool.

- `refs-linkedin-playbook.md` — 2026 algorithm mechanics, Depth Score formula, pillars, anti-slop blacklist, hashtag rules
- `refs-linkedin-templates.md` — 12 text-post hook formulas + post structure catalog + CTA bank
- `refs-linkedin-formats.md` — format decision matrix (carousel vs text vs video) with engagement-rate benchmarks

## Step 1 — Read the blog post

Input arrives as either a blog URL (fetch content from `alisadikinma.com/blog`) or raw markdown containing the title plus body content. Normalize to `{ title, body_markdown, h2_headings[] }`. The downstream format decision depends on accurate H2 counting, so preserve heading structure faithfully.

## Step 2 — Decide format (text vs carousel)

Apply this deterministic heuristic (matches the format-decision matrix in `refs-linkedin-formats.md`):

1. Count `## ` H2 headings in the blog body.
2. Detect listicle / tutorial signals:
   - Numbered headings ("1. ", "2. ", "Step 1", "Step 2")
   - "Top N", "N Ways To", "N Mistakes", "N Patterns", "N Reasons"
   - Sequential step-by-step structure (Step A → Step B → Step C)
   - Explicit framework breakdown where each H2 is one framework component
3. Apply the rule:
   - **If H2 count >= 5 OR listicle/tutorial signal detected** → `format: carousel` (target 7-10 slides; sweet spot per design doc Appendix B.1; short frameworks compress to 5-8; case studies expand to 8-10)
   - **Otherwise** → `format: text` (target 1100-1300 chars, the dwell-time sweet spot)

Carousel earns ~3x engagement vs text (21-24% vs 3-4% per `refs-linkedin-formats.md`), so when in doubt between text and carousel, prefer carousel — BUT only when the content genuinely has enough distinct ideas to fill 7+ slides without diluting focus. Short opinion pieces with 2 H2s will feel stretched as a carousel.

## Step 3 — Pick the hook

### Text path (`format: text`) — choose one `hook_id` from the 12-formula catalog

The `hook_id` enum in `schema.ts` mirrors the 12 formulas in `refs-linkedin-templates.md` §1:

| hook_id | When to use |
|---|---|
| `pas` | Clear pain point the blog agitates before solving |
| `aida` | Curiosity-gap opener with a payoff |
| `contrarian` | Blog challenges a consensus view — high signal for opinion pieces |
| `pattern_interrupt` | Shock opener that breaks the reader's scrolling rhythm |
| `loss_aversion` | "X mistakes / things killing your Y" — authority + risk |
| `curiosity_gap` | Open loop that only resolves later in the post |
| `specific_number` | "I shipped 12 projects in 90 days" — concrete proprietary metric |
| `bold_claim` | "The AI Generalist era is over" — forecast / thesis |
| `story_opener` | Cold-open narrative / war-room scene |
| `question` | Community trigger — invites first-comment |
| `stat_drop` | Proprietary data point as opening authority signal |
| `before_after` | Transformation story — measurable delta from A to B |

Do NOT invent new hook IDs. If nothing in the catalog fits, the blog probably shouldn't convert — reflect that via a low `linkedin_conversion_confidence`.

### Carousel path (`format: carousel`) — choose one `hook_framework` from the 5-framework catalog

Per design doc Appendix B.C.4:

| hook_framework | When to use |
|---|---|
| `PAS` | Problem-Agitation-Solution — emotional urgency leads |
| `AIDA` | Attention-Interest-Desire-Action — curiosity gap leads |
| `before_after` | Before/After transformation — immediate-proof leads |
| `loss_aversion` | Mistakes / errors to avoid — authority + risk leads |
| `contrarian` | Contrarian take — debate / friction leads |

## Step 4 — Identify pillar

Every brief MUST fit exactly one of Ali's 4 brand pillars (from CLAUDE.md §Pillars). Off-pillar content gets throttled by LinkedIn's Knowledge Graph Validation (RAG 01-main-playbook §2, Phase 3 audit):

- `ai_generalist` — positioning as the AI Generalist Expert; broad AI transformation frameworks, synthesis across subfields
- `ai_solopreneur` — solo operator stack, time/money leverage, indie hacking with AI
- `vibe_coding` — dev productivity with AI coding assistants, prompt-driven development workflows
- `ai_agents` — automation, agent architectures, multi-agent orchestration, SDK/tooling for agents

If the blog straddles two pillars, pick the one that opens the stronger LinkedIn lane — typically the more specific one (e.g., an "AI agents for solopreneurs" blog → `ai_agents` unless the solopreneur framing dominates).

## Step 5 — Pull quote

Extract the single most quotable insight from the blog body — the sentence (or two-sentence block) Ali would want LinkedIn readers to remember and share verbatim. Constraints:

- 12-30 words (40-240 characters, enforced by the Zod schema)
- Scannable at a glance on mobile — no subordinate clauses that wrap awkwardly
- LinkedIn-native tone — direct, first-person acceptable, no blog-ish "In this article, we'll explore..." throat-clearing
- Quote must be self-contained: it should make sense stripped of the blog's surrounding context

This is the seed the `linkedin-convert` / `linkedin-carousel` skill uses to keep the LinkedIn voice consistent with the blog's strongest line.

## Step 6 — Angle and title

- `angle` — ONE sentence positioning what this LinkedIn post says on LinkedIn specifically, vs the blog's broader thesis. Often narrower, often more opinionated. Example: blog thesis = "AI agents change software workflows"; LinkedIn angle = "Most dev teams are using AI agents as fancy autocomplete — here's the 3-layer stack that actually ships features." 20-200 chars.
- `title_draft` — working title for the LinkedIn post itself (the cover-slide H1 for carousel, or the working concept for text). 10-120 chars. Does NOT have to match the blog title; the LinkedIn post has its own angle from Step 6.

## Step 7 — Conversion confidence

Score `linkedin_conversion_confidence` in [0.0, 1.0]. This signals whether the blog is a strong LinkedIn candidate:

- **0.85-1.00** — high-signal blog: clear pillar fit, obvious hook, pull quote that stands on its own, first 3 lines will work as the "See More" trigger
- **0.60-0.84** — good candidate but needs more angle work; hook catalog fits but not ideally
- **0.30-0.59** — weak: content is too broad, off-pillar, or lacks a sharp pull quote; downstream skills will struggle
- **0.00-0.29** — should NOT convert; blog is off-brand or too shallow. Flag to operator for manual decision.

Downstream scheduling may gate on this score (separate from Depth Score which gates on the generated POST, not the brief).

## Output schema

The JSON shape is defined in `schema.ts` (Zod, single source of truth). Output MUST be valid JSON that parses against `BriefSchema`. Structural contract:

```json
{
  "format": "text" | "carousel",
  "hook_framework": "PAS | AIDA | before_after | loss_aversion | contrarian" (carousel only),
  "hook_id": "pas | aida | contrarian | pattern_interrupt | loss_aversion | curiosity_gap | specific_number | bold_claim | story_opener | question | stat_drop | before_after" (text only),
  "pillar": "ai_generalist | ai_solopreneur | vibe_coding | ai_agents",
  "pull_quote": "12-30 word verbatim quote from blog",
  "angle": "one-sentence LinkedIn positioning (20-200 chars)",
  "title_draft": "working title for the post (10-120 chars)",
  "linkedin_conversion_confidence": 0.0-1.0
}
```

Exactly one of `hook_framework` / `hook_id` MUST be present, matching `format`. The `superRefine` guard in `schema.ts` enforces this — output that violates it fails validation.

## Anti-slop guards

The brief MUST NOT contain any of these phrases anywhere in `pull_quote`, `angle`, or `title_draft` (hard-fail at validation):

- "delve into"
- "unlock the power of"
- "in today's fast-paced digital landscape"
- "at the end of the day"
- "navigating the complexities of"
- "harness the power of"
- "seamlessly integrate"

The brief MUST NOT reference engagement bait that will leak downstream:

- "Comment YES"
- "Type A/B"
- "Drop a 🔥"

If the source blog contains any of the above, rewrite the pull quote in Ali's direct voice instead of extracting verbatim. The pillar routing and hook selection should sidestep these patterns structurally — a `contrarian` or `specific_number` hook is the antidote to generic "delve into" prose.
