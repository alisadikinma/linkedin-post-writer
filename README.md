# LinkedIn Post Writer — Claude Code Plugin

Auto-converts every newly published blog post from `alisadikinma.com/blog` into a 2026-algorithm-optimized LinkedIn post (text or 7-10 slide carousel), validates against Depth Score ≥80, and auto-publishes via MixPost OSS — with a 15-minute Telegram cancel window as soft override and a `LINKEDIN_AUTO_PUBLISH` env kill-switch as hard brake. Built on 127-source RAG research aggregated via NotebookLM, encoding the Depth Score formula (`(Dwell × 2) + (Comment Quality × 15) + (Saves/Shares × 5) − Bounce`), 12 hook formulas, 5 post-format decision matrix, Link-in-Comment pattern (avoids 60% reach penalty), and AI-slop vocabulary bans.

> **Status — v0.2.0 (Skeleton Phase)**
> This release ships the plugin root scaffold (`plugin.json`, `README.md`, `LICENSE`) plus the 6-file RAG playbook under `docs/rag/linkedin-playbook/`. Skills, agent, compiled references, hooks, and backend integration land in Phases B–E of the implementation plan. Until then, invoking any `/linkedin-*` command returns "skill not found". See `docs/plans/2026-04-23-plugin-architecture-full-auto-plan.md` for phase-by-phase progress.

## Install

```bash
# Via ai-content-suite marketplace
claude plugins marketplace add alisadikinma/ai-content-suite
claude plugins install linkedin-post-writer

# Or direct
claude plugins install alisadikinma/linkedin-post-writer
```

## Skills

All 6 skills use `model: sonnet` with compiled reference bundles injected via `--append-system-prompt-file`. See `docs/plans/2026-04-23-plugin-architecture-full-auto.md` §3 for skill-to-reference mapping.

| Skill | Trigger | Description | Status |
|-------|---------|-------------|--------|
| `linkedin-gen` | `/linkedin-gen` | End-to-end orchestrator: brief → convert (and/or carousel) → validate → schedule. Entry point for cron-driven full-auto pipeline | Phase B5 |
| `linkedin-brief` | `/linkedin-brief` | Blog post → brief JSON (format decision using 5-factor matrix, hook formula selection from 12 templates, pillar routing across AI Generalist / AI Solopreneur / Vibe Coding / AI Agents) | Phase B1 |
| `linkedin-convert` | `/linkedin-convert` | Brief + blog → native LinkedIn text post (1100–1300 chars, 3-5 hashtags, Link-in-Comment pattern, dwell-time-optimized paragraph structure) | Phase B2 |
| `linkedin-carousel` | `/linkedin-carousel` | Brief + blog → 7-10 slide JSON (1080×1350 portrait, 75px margins, 24pt body minimum, mobile safe zones enforced, per-slide image prompts for GeminiGen.AI) | Phase C2 |
| `linkedin-validate` | `/linkedin-validate` | Depth Score 0–100 gate with hard-fail rules (AI slop, engagement bait, external links in body, dead-zone text in carousels). Score ≥80 advances to publish, <80 routes to manual review | Phase B3 + C3 |
| `linkedin-schedule` | `/linkedin-schedule` | Backend bridge: POST validated draft to `/api/automation/linkedin/{id}/schedule`. Backend handles MixPost publishing + Telegram cancel-window state machine | Phase B4 |

## Agent

| Agent | Description | Status |
|-------|-------------|--------|
| `linkedin-writer` | Self-contained batch subagent for multi-post conversion. Mirrors the same brief → convert → carousel → validate → schedule flow with all rules inline, useful for backfilling historical blog posts in one pass | Phase B5 |

## Architecture

LinkedIn Post Writer is a **content-repurposing plugin** that runs as the downstream consumer of the blog publishing pipeline. Daily at 03:00 WIB, a Laravel cron command (`linkedin:scan-and-generate`) scans `alisadikinma.com/blog` for posts published in the last 24 hours that have no `linkedin_posts` row, creates a pending record per post, and dispatches a `GenerateLinkedInPost` job. The job SSHes to a `claudesn` user on the same VPS and invokes `claude -p "/linkedin-gen {id}"` with all four compiled reference bundles injected via `--append-system-prompt-file`. Sub-skills run in order (brief → convert → optional carousel → validate → schedule), each reporting progress back via PUT callbacks to the backend API. Drafts that score ≥80 on the Depth Score formula enter a 15-minute Telegram cancel window before auto-publishing through MixPost OSS to LinkedIn. Drafts that score <80 skip auto-publish and route to admin review.

This plugin mirrors the sibling `article-content-writer` pattern one-to-one — same SSH-triggered CLI invocation, same split skill + compiled reference architecture, same backend service layout (`LinkedInGenerationService` is a fork of `ArticleGenerationService`), same Telegram notification integration. The full design with 8 locked decisions, FSM diagram, database schema, risk register, and carousel design constraints is documented in `docs/plans/2026-04-23-plugin-architecture-full-auto.md`. The phase-by-phase implementation plan with TDD checkpoints and stop-points is in `docs/plans/2026-04-23-plugin-architecture-full-auto-plan.md`.

## 2026 LinkedIn Algorithm Mechanics

All skills encode these rules as hard validation constraints:

| Constraint | Value |
|------------|-------|
| Depth Score formula | `(Dwell × 2) + (Comment Quality × 15) + (Saves/Shares × 5) − Bounce` |
| Depth Score gate | ≥ 80 (configurable via `LINKEDIN_DEPTH_SCORE_THRESHOLD`) |
| Text post char range | 1100–1300 (dwell-time sweet spot) |
| Hashtag count | 3–5 (≥10 triggers −15% reach per Oct-2024 change) |
| Paragraph length | 1–2 sentences max, aggressive line breaks |
| Hook window | First 3 lines must force "See More" expand |
| External link policy | Body → 60% reach penalty. Always Link-in-Comment |
| Carousel dimensions | 1080×1350 portrait PDF, 75px internal margins |
| Carousel body font | 24pt minimum on 1080px canvas |
| Carousel mobile dead zones | Top 150px + bottom 200px (no text allowed) |
| Carousel slide count | 7-10 sweet spot (5-8 for short frameworks, 8-10 for case studies) |

Banned vocabulary (auto-fail): "delve into", "unlock the power of", "in today's fast-paced digital landscape", "at the end of the day", "navigating the complexities of", "harness the power of", "seamlessly integrate". Banned CTAs: "Comment YES", "Type A/B", "Drop a 🔥", "Smash that like button". Full list maintained in `docs/rag/linkedin-playbook/01-main-playbook.md` and compiled into `references/compiled/refs-linkedin-playbook.md`.

## Pillars (Ali's Brand Routing)

Every draft must fit one of four content pillars. Off-pillar posts get throttled by LinkedIn's Knowledge Graph Validation; the plugin trusts conversion logic (not a separate gate) to stay on-brand.

1. **AI Generalist Expert** — primary positioning
2. **AI Solopreneur** — solo-operator business mechanics with AI leverage
3. **Vibe Coding** — dev productivity with AI assistance
4. **AI Agents** — automation and agent architectures

## Pipeline Flow

```
03:00 WIB cron
  → ScanBlogForLinkedInConversion (scans last 24h)
    → LinkedInPost row (status=pending_generation)
      → GenerateLinkedInPost job
        → SSH claudesn@localhost
          → claude -p "/linkedin-gen {id}" --model sonnet
               --append-system-prompt-file refs-linkedin-playbook.md
               --append-system-prompt-file refs-linkedin-templates.md
               --append-system-prompt-file refs-linkedin-formats.md
               --append-system-prompt-file refs-linkedin-carousel.md

Sub-skill chain inside /linkedin-gen:
  Step 1  linkedin-brief       (format decision + hook + pillar)
  Step 2a linkedin-convert     (text post, always)
  Step 2b linkedin-carousel    (conditional on brief.format == "carousel")
  Step 3  linkedin-validate    (Depth Score gate)
  Step 4  linkedin-schedule    (POST to backend)

Backend state machine:
  Depth ≥ 80 → awaiting_publish + Telegram preview (cancel button, 15 min)
  Depth < 80 → manual_review + Telegram alert (no auto-publish)

Cancel window (15 min):
  Cancel clicked → status=cancelled
  Window elapsed + LINKEDIN_AUTO_PUBLISH=true → publish via MixPost → status=published
  Window elapsed + kill-switch OFF → manual_review
```

Full FSM with 8 states and adjacency map lives in `docs/plans/2026-04-23-plugin-architecture-full-auto.md` §5.

## Requirements

| Dependency | Purpose | Install |
|------------|---------|---------|
| Claude Code CLI | Local plugin invocation + VPS-side skill execution | [https://docs.claude.com/claude-code](https://docs.claude.com/claude-code) |
| Portfolio_v2 backend (Laravel 12) | Houses `linkedin_posts` table, MixPost integration, cron, SSH entry point | [https://github.com/alisadikinma/Portfolio_v2](https://github.com/alisadikinma/Portfolio_v2) |
| MixPost OSS | LinkedIn auto-publishing (OAuth + scheduled posts) | `composer require inovector/mixpost` |
| NotebookLM CLI (`nlm`) | RAG refresh workflow (quarterly or on algorithm drift) | `npm install -g @google/nlm` |
| Node.js 20+ | TypeScript scripts (`compile-refs.ts`, `upload-skills.ts`) and Vitest harness | [https://nodejs.org](https://nodejs.org) |

## Environment Variables

Configured in Portfolio_v2 `.env`. Full reference in design doc §4.4.

```env
LINKEDIN_AUTO_PUBLISH=true
LINKEDIN_DEPTH_SCORE_THRESHOLD=80
LINKEDIN_CANCEL_WINDOW_MINUTES=15
LINKEDIN_CRON_SCHEDULE="0 3 * * *"

LINKEDIN_GEN_DRIVER=ssh
LINKEDIN_GEN_SSH_HOST=localhost
LINKEDIN_GEN_SSH_USER=claudesn
LINKEDIN_GEN_SSH_KEY=/var/www/.ssh/id_ed25519
LINKEDIN_GEN_CLAUDE_PATH=claude
LINKEDIN_GEN_API_URL=https://alisadikinma.com/api
LINKEDIN_GEN_API_TOKEN=<generated>

LINKEDIN_GEN_REFS_PLAYBOOK=/home/claudesn/refs-linkedin-playbook.md
LINKEDIN_GEN_REFS_TEMPLATES=/home/claudesn/refs-linkedin-templates.md
LINKEDIN_GEN_REFS_FORMATS=/home/claudesn/refs-linkedin-formats.md
LINKEDIN_GEN_REFS_CAROUSEL=/home/claudesn/refs-linkedin-carousel.md

MIXPOST_LINKEDIN_ACCOUNT_ID=<set after OAuth connect>

TELEGRAM_NOTIFY_LINKEDIN_PREVIEW=true
TELEGRAM_NOTIFY_LINKEDIN_DEPTH_FAILED=true
TELEGRAM_NOTIFY_LINKEDIN_PUBLISHED=true
```

## RAG Foundation

127 LinkedIn-algorithm sources aggregated via NotebookLM (`li-rag` notebook) and distilled into 6 playbook files under `docs/rag/linkedin-playbook/`:

| File | Covers |
|------|--------|
| `01-main-playbook.md` | 2026 algorithm mechanics, Depth Score formula, 4 content pillars, AI-slop bans |
| `02-templates-hooks.md` | 12 hook formulas, 7 post structures, CTA bank |
| `03-autopost-tools.md` | MixPost selection rationale + operator reference |
| `04-media-format-decision.md` | Text vs carousel vs video decision matrix (5 factors) |
| `05-hashtags-timing-language.md` | Hashtag policy, send-time windows, bilingual handling |
| `06-carousel-design.md` | Slide structure, typography, mobile safe zones, Direct Answer Block |

Refresh command (quarterly or on algorithm drift):

```bash
nlm notebook query li-rag "latest LinkedIn reach penalty behaviors"
nlm report create li-rag --format "Create Your Own" --prompt "..." --confirm
```

Regenerate compiled reference bundles after editing any raw file:

```bash
npx tsx scripts/compile-refs.ts
```

## License

MIT — Copyright (c) 2026 Ali Sadikin. See [LICENSE](./LICENSE).
