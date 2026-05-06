---
name: linkedin-convert
description: Convert a blog post + brief into a native LinkedIn text post (1100-1300 chars, 3-5 hashtags, Link-in-Comment pattern, dwell-time-optimized paragraphs). Triggers on convert, linkedin convert, text post, write linkedin post.
model: sonnet
triggers: [convert, linkedin convert, text post, write linkedin post]
---

# linkedin-convert — Blog + Brief to LinkedIn Text Post

## Authoring Language: ENGLISH (v0.6.0+)

**HARD RULE**: every `post_text` field MUST be authored in English — regardless of the source blog's primary language. The backend SSH bridge (Portfolio_v2's `LinkedInGenerationService::buildBlogPayload`, May 6 2026) feeds this skill the EN translation of the source blog when available, falling back to ID only when no EN translation exists. The target audience is global (US founders + EU + APAC + ID-fluent devs), and per `refs-linkedin-playbook.md` §05 line 177 `primary_language = "en"` for algorithmic distribution reasons (LinkedIn routes ID-language posts predominantly to the Indonesian market only).

Do not mix Indonesian sentences into the body — Indonesian *terms* used as cultural shorthand (e.g. "Indonesian indie hacker community", "WIB timing") are fine, but grammar + connective tissue stays English.

Set `caption_language: 'en'` in the orchestrator output envelope (see `linkedin-gen/schema.ts`) for backend telemetry.

## Purpose

Transform a finalized `Brief` (from `linkedin-brief`) plus the source blog into a native LinkedIn text post that is engineered to clear a Depth Score ≥80 in the validator downstream. The output is pure text (no images, no external links in the body) sized to the 1100-1300-character dwell-time sweet spot, with a first-comment payload carrying the blog URL. No carousel slides, no images, no video — that is the `linkedin-carousel` skill's job. This skill owns text-format posts only.

## Reference Files

These are injected via `--append-system-prompt-file` at runtime by `LinkedInGenerationService` — do NOT read them with the Read tool.

- `refs-linkedin-playbook.md` — 2026 algorithm mechanics, Depth Score formula, pillars, anti-slop blacklist, hashtag rules
- `refs-linkedin-templates.md` — 12 text-post hook formulas + post-structure catalog + CTA bank + line-break rhythm patterns

## Inputs

The calling pipeline (`linkedin-gen` orchestrator or direct subagent) passes a JSON object matching `ConvertInputSchema` (see `schema.ts`):

- `brief: Brief` — finalized output of `linkedin-brief`. MUST have `format: 'text'`, plus `hook_id`, `pillar`, `pull_quote`, `angle`, and `title_draft`. If `brief.format === 'carousel'`, STOP and route to `linkedin-carousel` — this skill refuses carousel input.
- `blog: { url: string; title: string; content: string }` — source post. `url` is the canonical blog URL used in the first comment (link-in-comment pattern). `content` is the raw markdown body the conversion draws from.

## Step 1 — Load inputs and assert text format

Read `brief` and `blog` from the input JSON. The FIRST check: `brief.format === 'text'`. If the brief is for a carousel, emit a short error object (`{"error":"wrong_format","detail":"brief is carousel; route to linkedin-carousel"}`) and stop. Do NOT attempt to downgrade a carousel brief into text — the format decision belongs to `linkedin-brief`.

Re-read `brief.pull_quote` verbatim. You will paste this string into the post body exactly, so keep it in memory unmodified.

## Step 2 — Generate the hook (first 3 lines)

The hook is the **first 3 lines** of the post — the portion rendered above LinkedIn's "...see more" fold. Everything else is gated behind a click. The hook's sole job is to earn that click.

Pick the formula from `refs-linkedin-templates.md` §1 matching `brief.hook_id` (12-formula catalog):

| hook_id | Formula signature |
|---|---|
| `specific_number` | Open with a concrete proprietary metric. E.g. "18 months and 12 client projects taught me X." The number must come from the blog content, not invented. |
| `contrarian` | State a thesis that cuts against the consensus view on LinkedIn. E.g. "Everyone is wrong about niching down." |
| `pas` | Problem → Agitation → Solution teaser. Line 1 names the pain, line 2 sharpens it, line 3 promises relief. |
| `aida` | Attention → Interest payoff. Line 1 is the attention-grab; line 2-3 earn the "see more" click. |
| `pattern_interrupt` | Start with a claim that stops the scroll — counter to AI-era conventional wisdom. |
| `loss_aversion` | "Mistakes / things killing your X" — authority + risk framing. |
| `curiosity_gap` | Open loop that only resolves deeper in the post. |
| `bold_claim` | Forecast / thesis statement. "The AI Generalist era is over." |
| `story_opener` | Cold-open narrative — drop the reader into a scene. |
| `question` | One-sentence provocation that triggers first-comment engagement. |
| `stat_drop` | Proprietary data point as opening authority signal. |
| `before_after` | Measurable transformation from A → B. |

Hook constraints (hard rules):

- **Max ~200 chars across the first 3 lines combined** — must fit above the "see more" fold on mobile.
- **No external `https://` or `http://` links** anywhere in the hook (or anywhere in the body — see Step 3).
- **No engagement bait** ("Comment YES", "Type A/B", "Drop a 🔥", "Smash that like button").
- The hook MUST be capturable as `hook_used` in the output JSON — you will emit the literal hook text there for analytics.

## Step 3 — Build the post body (target 1100-1300 chars total)

After the hook, extend the post into a full body targeting the **1100-1300 character** dwell-time sweet spot (per RAG 01-main-playbook §Depth Score mechanics). This is the total length of `post_text` including the hook, not the body alone.

Body rules:

- **Paragraph rhythm:** 1-2 sentences per paragraph. Blank line between every paragraph. Aggressive line breaks — this is the "Punchy 1-2-1" rhythm from `refs-linkedin-templates.md` §4. Total paragraph count will land in 4-12 (enforced by schema).
- **Mobile width:** keep lines under 40-50 chars where possible — avoids awkward word-wrap on the 70%+ of readers on phones.
- **Pull quote placement:** the `brief.pull_quote` string MUST appear verbatim somewhere in the body, set apart in its own paragraph (no prefix, no "Quote:" label — just the line itself, visually punchy). Target the middle third of the post for placement so it lands during peak dwell.
- **Closing question:** the final paragraph MUST be a question designed to prompt a 5+ word reply (not a one-word yes/no). This drives Comment Quality, which carries a 15× weight in the Depth Score formula. Examples: "Which layer is the one breaking first when you try to scale?" "What is the contrarian take you are still holding back from your network?"
- **No external URLs:** the body MUST NOT contain any `https://` or `http://` string. LinkedIn applies a ~60% reach penalty for body links. Links go ONLY in the first comment (Step 4).
- **No engagement bait CTAs:** "Comment YES if you agree", "Type A/B in the comments", "Drop a 🔥", "Smash that like button" — these trigger algorithmic demotion in the 2024+ ranker.
- **No banned AI-slop phrases** (see Anti-slop section below).
- **Voice:** first-person, direct, specific. Numbers and timeframes beat abstractions. Name the exact metric, the exact timeframe, the exact failure mode from the source blog. The pull quote is the seed; extend Ali's direct voice outward from it.

Count characters after drafting. If under 1100, add more specific proof (a number, a timeframe, a client example). If over 1300, collapse the weakest paragraph. Do NOT pad with filler to reach the range — fewer but sharper sentences beat more but softer ones.

## Step 4 — Author the first comment (link-in-comment payload)

The `link_comment` field is a short standalone comment the operator will post below the main post within the first minute of publish. This is how the post delivers the blog URL without eating the 60% body-link penalty.

Format:

```
[1-2 sentence context sentence]. Full breakdown: {blog.url}
```

Constraints:

- 20-280 characters total (schema-enforced).
- MUST contain the literal `blog.url` value.
- Conversational tone — this is a comment, not an ad. "Full breakdown with the exact onboarding test I run: {url}" is better than "Click here for more: {url}".

## Step 5 — Pick hashtags (3-5 total)

Per `refs-linkedin-templates.md` §5 and `refs-linkedin-playbook.md` §Hashtags, emit **3-5 hashtags** (never more — 10+ triggers a −15% reach penalty per the Oct-2024 algorithm change noted in CLAUDE.md §Text post constraints).

Mix recipe:

- **1-2 pillar-scoped** — match `brief.pillar` exactly:
  - `ai_generalist` → `#AIGeneralist`, `#AIStrategy`
  - `ai_solopreneur` → `#AISolopreneur`, `#Solopreneur`, `#IndieMaker`
  - `vibe_coding` → `#VibeCoding`, `#AIEngineering`, `#DeveloperProductivity`
  - `ai_agents` → `#AIAgents`, `#AgenticAI`, `#Automation`
- **1-2 niche-specific** — tied to the post's angle: `#LinkedInAlgorithm`, `#ContentStrategy`, `#PromptEngineering`, `#RAG`, `#MultiAgent`, etc.
- **1 broad** — `#AI`, `#Tech`, `#Productivity`.

Formatting:

- Each hashtag MUST match `/^#[A-Za-z0-9]+$/` — no spaces, no punctuation, no hyphens, no emoji. Schema rejects anything else.
- Prefer CamelCase for multi-word tags (`#AISolopreneur`, not `#aisolopreneur`) — LinkedIn normalizes case internally but CamelCase is more scannable for humans.
- Hashtags are emitted as a JSON array field (`hashtags`), NOT appended to `post_text`. The production pipeline assembles the final published text.

## Step 6 — Assemble output JSON

Emit a single JSON object matching `ConvertOutputSchema` (see `schema.ts`). Structural contract:

```json
{
  "post_text": "<1100-1300 chars, hook + body + question, no URLs, no banned phrases>",
  "link_comment": "<20-280 chars, contains blog.url>",
  "hashtags": ["#PillarTag", "#NicheTag", "#BroadTag"],
  "char_count": <integer, MUST equal post_text.length>,
  "paragraph_count": <integer in [4, 12]>,
  "hook_used": "<verbatim first-3-lines string, 10-200 chars>"
}
```

The `superRefine` guards in `schema.ts` enforce:
- `char_count === post_text.length` (no stale metadata drift)
- no http(s) URLs in `post_text`
- no banned phrases in `post_text`
- no engagement bait in `post_text`

If any guard trips, you did not follow the rules above — re-draft the body, do NOT patch the metadata to lie about it.

## Anti-slop guards

`post_text` MUST NOT contain any of these phrases anywhere (case-insensitive; schema hard-fails):

- "delve into"
- "unlock the power of"
- "in today's fast-paced digital landscape"
- "at the end of the day"
- "navigating the complexities of"
- "harness the power of"
- "seamlessly integrate"

`post_text` MUST NOT contain any engagement bait CTA:

- "Comment YES"
- "Type A for" / "Type A/B"
- "Drop a 🔥"
- "Smash that like button"

If the source blog uses any of the above, rewrite in Ali's direct voice. The contrarian and specific_number hook formulas are structural antidotes to slop — if you catch yourself reaching for "delve into", switch to a concrete number or a contrarian thesis instead.
