# LinkedIn Post Writer — Claude Project Instructions

> **Status (2026-04-23):** Design + implementation plan complete + **Addendum 2 closes all 7 remaining Open Questions**. Plugin scaffold is **NOT YET BUILT**. Next session must start at Phase A1 via `/gaspol-execute`.
>
> **Addendum 2 (2026-04-23 session 2)** — see design doc §12 — locks: slide composition = text-baked-in-AI-prompt (D9), PDF lib = TCPDF (D10), Human Fingerprint = `creator_brand_logo` reuse (D11 ⚠️ **flagged** for v1.1 re-litigation if Depth Score median < 82), `carousel_slides` JSON = flat slide array (D12), link-in-comment = delayed LinkedIn API job via `LinkedInCommentService` (D13), Telegram webhook = 2-layer sig (`secret_token` header + HMAC callback_data) + 2-step cancel confirm (D14a/b). Plan file has updated Phase D9 + D11 + new Phase D11b.

## Project Overview

Claude Code plugin `linkedin-post-writer` that auto-converts every newly published blog post from `alisadikinma.com/blog` into an algorithm-optimized LinkedIn post (text or 7-10 slide carousel), validates against Depth Score ≥80, and auto-publishes via MixPost OSS — with a 15-minute Telegram cancel window as soft override and a kill-switch env var as hard brake.

**Target state v1.0:** 6 skills + 1 agent + 4 compiled reference bundles, integrated with Portfolio_v2 Laravel backend via SSH-triggered Claude CLI (same pattern as sibling `article-content-writer`). Daily cron (03:00 WIB) scans blog for un-converted posts, generates drafts, validates, publishes — fully autonomous happy path.

**Current state v0.1.0:** Only `.claude-plugin/plugin.json` + `docs/rag/linkedin-playbook/` (6 RAG files) + this CLAUDE.md + design doc + implementation plan exist. All skills, scripts, hooks, references (compiled), agent, backend wiring — pending.

## Critical Context Files (READ FIRST)

Before touching ANY code:

1. **`docs/plans/2026-04-23-plugin-architecture-full-auto.md`** — design doc (696 lines). Covers architecture, all 8 locked design decisions, FSM diagram, DB schema, env vars, risk register, carousel design constraints (Appendix B cross-references RAG 06).
2. **`docs/plans/2026-04-23-plugin-architecture-full-auto-plan.md`** — implementation plan (companion). 33 sub-phases with TDD step 1 + Verification blocks. Data Integration Map (24 rows). Stop-points flagged.
3. **`docs/rag/linkedin-playbook/INDEX.md`** — RAG overview. 127 sources aggregated via NotebookLM (`li-rag` alias). Points to 6 playbook files.
4. **`D:\Projects\Portfolio_v2\CLAUDE.md`** — backend project context. Proven patterns (HasStatusTransitions, PipelineGuard, ArticleGenerationService SSH pattern, TelegramNotificationService) that this plugin's backend integration reuses verbatim.
5. **`D:\Projects\claude-plugin\article-content-writer\`** — sibling plugin. File structure, compile-refs approach, hooks, scripts are 1:1 patterns to mirror.

## Architecture

### Target file tree (what Phase A-C produces)

```
linkedin-post-writer/
├── .claude-plugin/plugin.json         ✅ EXISTS (v0.1.0, bump to 0.2.0 in Phase A1)
├── CLAUDE.md                          ✅ THIS FILE
├── README.md                          ❌ Phase A1
├── LICENSE                            ❌ Phase A1 (MIT, copy from sibling)
├── package.json                       ❌ Phase A2 (add zod, vitest, tsx, msw)
├── tsconfig.json                      ❌ Phase A2
├── vitest.config.ts                   ❌ Phase A2
│
├── skills/
│   ├── linkedin-gen/SKILL.md          ❌ Phase B5 — all-in-one orchestrator
│   ├── linkedin-brief/SKILL.md        ❌ Phase B1 — blog → brief JSON (format decision + hook + pillar)
│   ├── linkedin-convert/SKILL.md      ❌ Phase B2 — brief+blog → text post (1100-1300 char)
│   ├── linkedin-carousel/SKILL.md     ❌ Phase C2 — brief+blog → 7-10 slide JSON
│   ├── linkedin-validate/SKILL.md     ❌ Phase B3 + C3 — Depth Score 0-100 gate
│   └── linkedin-schedule/SKILL.md     ❌ Phase B4 — POST to backend /schedule endpoint
│
├── agents/
│   └── linkedin-writer.md             ❌ Phase B5 — self-contained batch subagent
│
├── references/
│   ├── raw/                           ❌ Phase A2 (symlinks → docs/rag/linkedin-playbook/*.md)
│   └── compiled/
│       ├── refs-linkedin-playbook.md  ❌ Phase A2 (01-main + 05-hashtags merged)
│       ├── refs-linkedin-templates.md ❌ Phase A2 (02-templates-hooks)
│       ├── refs-linkedin-formats.md   ❌ Phase A2 (04-media-format-decision)
│       └── refs-linkedin-carousel.md  ❌ Phase A2 (06-carousel-design)
│
├── hooks/
│   └── session-start.sh               ❌ Phase A3 (mirror sibling)
│
├── scripts/
│   ├── compile-refs.ts                ❌ Phase A2 (raw → compiled)
│   └── upload-skills.ts               ❌ Phase A4 (dry-run first, execution deferred)
│
├── tests/                             ❌ Phase A2+ (vitest harness)
│   ├── helpers/skill-runner.ts        ❌ Phase B1 (fixture-driven skill test helper)
│   ├── fixtures/                      ❌ Per-skill fixture pairs (input + expected-output)
│   │   ├── brief/, convert/, validate/, carousel/, schedule/
│   └── skills/*.test.ts               ❌ One per skill
│
└── docs/
    ├── rag/
    │   └── linkedin-playbook/         ✅ ALL 6 FILES + INDEX.md COMPLETE
    │       ├── INDEX.md
    │       ├── 01-main-playbook.md        (algorithm 2026, Depth Score formula, pillars)
    │       ├── 02-templates-hooks.md      (12 hook formulas, 7 structures, CTA bank)
    │       ├── 03-autopost-tools.md       (MixPost choice — operator ref)
    │       ├── 04-media-format-decision.md (text vs carousel vs video matrix)
    │       ├── 05-hashtags-timing-language.md
    │       └── 06-carousel-design.md       (NEW 2026-04-23 — design specifics)
    ├── plans/
    │   ├── 2026-04-23-plugin-architecture-full-auto.md       (DESIGN — 696 lines)
    │   └── 2026-04-23-plugin-architecture-full-auto-plan.md  (PLAN — TDD phases)
    └── archive/                       ❌ Phase B6, C4 smoke test results will land here
```

### Skill-to-reference mapping

| Skill | `--append-system-prompt-file` refs | Purpose |
|-------|-------------------------------------|---------|
| `linkedin-brief` | `refs-linkedin-playbook.md` + `refs-linkedin-templates.md` + `refs-linkedin-formats.md` | Format decision + hook selection + pillar routing |
| `linkedin-convert` | `refs-linkedin-playbook.md` + `refs-linkedin-templates.md` | Text post generation with hook + CTA + hashtags |
| `linkedin-carousel` | `refs-linkedin-carousel.md` + `refs-linkedin-playbook.md` | 7-10 slide JSON with per-slide image prompts |
| `linkedin-validate` | `refs-linkedin-playbook.md` + `refs-linkedin-carousel.md` | Depth Score gate with hard-fail rules |
| `linkedin-schedule` | (none — lightweight API client) | Backend bridge |
| `linkedin-gen` | All 4 refs | Orchestrator |

## Locked Design Decisions (from brainstorm 2026-04-23)

See design doc Section 2 for rationale. These are **NOT up for re-litigation** without explicit user instruction:

| # | Decision | Short form |
|---|----------|-----------|
| 1 | Full plugin mirror (not lean MVP) | Replicate article-content-writer pattern verbatim |
| 2 | Full-auto trigger | Cron → generate → validate → publish. No manual review for happy path |
| 3 | Safety gates | (a) Depth Score ≥80 hard threshold, (b) Telegram 15-min cancel window, (c) `LINKEDIN_AUTO_PUBLISH` env kill-switch |
| 4 | Scope v1.0 | Text + 7-10 slide carousel only. No video, no multi-image, no GIF |
| 5 | Research-backed carousel design | RAG 06 generated via NotebookLM — drives `linkedin-carousel` skill |
| 6 | MixPost OSS | `inovector/mixpost` composer package. No SaaS middleware |
| 7 | Uniform Sonnet model | All skills use Sonnet. No Opus (cost/quality sweet spot) |
| 8 | Single canonical post per blog v1.0 | No A/B variation rotation |

**Dropped (do NOT re-add without user instruction):**
- Knowledge Graph pillar check as separate gate (user trusts conversion logic)
- Rate limit Tue+Thu only (user wants blog velocity → LinkedIn velocity parity)

### Addendum 2 — Session 2 Locks (2026-04-23)

| # | Area | Decision | Note |
|---|---|---|---|
| D9 | Slide composition | Text baked in AI prompt (single GeminiGen call renders bg + copy) | No PHP text overlay in body slides. Enforce EN-primary copy, prompt discipline |
| D10 | PDF lib | `tecnickcom/tcpdf` | Free LGPL, pure PHP. Zero text rendering in PDF (text sudah di PNG). Service: `LinkedInPdfCompositionService` |
| D11 | Human Fingerprint slide image | Reuse `creator_brand_logo` (existing settings) | ⚠️ **FLAG** — violates RAG 06 §10 semantic (candid photo expected). Re-litigate in v1.1 if Depth Score median < 82 across first 20 published carousels |
| D12 | `carousel_slides` JSON schema | Flat 1-indexed array of slide objects | `{slide_number, layout_hint, copy, image_prompt, image_url, is_cover, is_cta, direct_answer_block?}`. Zod: min 7, max 10, exactly-one cover + exactly-one CTA invariants |
| D13 | Link-in-Comment automation | `LinkedInCommentService` + `PostLinkedInFirstComment` job | 30s delayed after MixPost publish. Reuses MixPost OAuth token. Telegram fallback on API fail |
| D14a | Telegram webhook signature | 2-layer (`secret_token` header + HMAC `callback_data`) | Middleware: `VerifyTelegramSignature` |
| D14b | Cancel button UX | 2-step confirm via `editMessageReplyMarkup` | `[❌ Cancel]` → `[✅ Ya, cancel] [↩️ Batalkan]` |

## 2026 LinkedIn Algorithm Mechanics (encode in every skill)

From RAG `01-main-playbook.md` + `06-carousel-design.md`. These rules drive validation scoring:

### Depth Score formula
```
Depth Score = (Dwell Time × 2) + (Comment Quality × 15) + (Saves/Shares × 5) − Bounce Rate
```
Comment Quality carries **15× weight**. Post must end with question that prompts 5+ word reply.

### Hard-fail rules (each is -20 to -30 pts)
- External link in post body → 60% reach penalty (use Link-in-Comment always)
- AI Slop phrases: "delve into", "unlock the power of", "in today's fast-paced digital landscape", "at the end of the day", "navigating the complexities"
- Engagement bait: "Comment YES", "Type A for..."
- Text in mobile Dead Zones (carousel): top 150px + bottom 200px of 1080×1350 canvas

### Text post constraints
- Char count: 1100-1300 (sweet spot for dwell time)
- Paragraph: 1-2 sentences max, aggressive line breaks
- Hashtags: 3-5 (over 10 → −15% reach per Oct-2024 change)
- First 3 lines MUST hook (forces "See More" expand)

### Carousel constraints (see design doc Appendix B)
- Slide count: 7-10 sweet spot (5-8 short frameworks, 8-10 case studies)
- Dimensions: 1080×1350 portrait PDF
- Body font: 24pt minimum on 1080px canvas
- Mobile safe zones: 150px top + 200px bottom = DEAD
- Margins: 75px internal
- Cover hook: 5 frameworks (PAS / AIDA / Before-After / Loss Aversion / Contrarian)
- Structure: hook → expand → proof (Human Fingerprint slide 3-5) → insight → direct-answer-block → CTA
- Direct Answer Block: 30-80 words, near top, AI-search-scrapable
- Page numbers mandatory

### Pillars (Ali's brand — posts must fit one)
1. AI Generalist Expert (primary positioning)
2. AI Solopreneur
3. Vibe Coding (dev productivity with AI)
4. AI Agents (automation + agents)

Off-pillar posts get throttled by Knowledge Graph Validation. Plugin trusts conversion logic to stay on-brand (no separate pillar gate per design decision #3).

## Pipeline Flow

```
┌────────────────────────────────────────────────────────────────┐
│ 03:00 WIB daily → ScanBlogForLinkedInConversion command        │
│   └─► posts published in last 24h with no linkedin_posts row   │
│        └─► LinkedInPost::create(status='pending_generation')   │
│             └─► dispatch GenerateLinkedInPost job              │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│ LinkedInGenerationService::generate (Portfolio_v2 backend)     │
│   SSH → claudesn@localhost                                     │
│     claude -p "/linkedin-gen {id}" --model sonnet              │
│       --append-system-prompt-file refs-linkedin-*.md (4 files) │
│                                                                │
│   Sub-skills invoked in order:                                 │
│   └─► Step 1: linkedin-brief    (format decision + hook)       │
│   └─► Step 2a: linkedin-convert  (text — always)               │
│   └─► Step 2b: linkedin-carousel (conditional on brief.format) │
│   └─► Step 3: linkedin-validate  (Depth Score gate)            │
│   └─► Step 4: linkedin-schedule  (POST to backend)             │
│                                                                │
│   Progress callbacks → PUT /automation/linkedin/{id}/progress  │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
                    Depth Score ≥ 80?
                   ┌───────┴────────┐
                   │YES             │NO
                   ▼                ▼
        status=awaiting_publish   status=manual_review
        Telegram preview +         Telegram alert
        cancel button              (no auto-publish)
        scheduled+15min
                   │
                   ▼
        [15 min cancel window]
                   │
           ┌───────┴────────┐
           ▼                ▼
     Cancel clicked     Window elapsed
     status=cancelled   kill-switch check
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                ON → publish        OFF → manual_review
                status=published
                + Telegram success
```

See design doc Section 5 for complete state diagram + branches.

## FSM (LinkedInPostStatus)

Backend model uses `HasStatusTransitions` trait from Portfolio_v2. 8 states + strict adjacency map:

```
pending_generation → generating → validating → awaiting_publish → published
                          ↓            ↓              ↓
                       failed     manual_review   cancelled
                                    ↑↓
                           (admin edit + approve)
```

Illegal transitions throw `InvalidStateTransitionException`. Audit log in `pipeline_state_log` JSON column (rotating 20 entries). All transitions wrapped in `PipelineGuard::advance` for uniform logging.

## Environment Variables (Portfolio_v2 .env)

Set on VPS during deployment. Full list in design doc Section 4.4:

```env
# Kill-switch + gate
LINKEDIN_AUTO_PUBLISH=true
LINKEDIN_DEPTH_SCORE_THRESHOLD=80
LINKEDIN_CANCEL_WINDOW_MINUTES=15
LINKEDIN_CRON_SCHEDULE="0 3 * * *"

# Generation service (mirror ARTICLE_GEN_*)
LINKEDIN_GEN_DRIVER=ssh
LINKEDIN_GEN_SSH_HOST=localhost
LINKEDIN_GEN_SSH_USER=claudesn
LINKEDIN_GEN_SSH_KEY=/var/www/.ssh/id_ed25519
LINKEDIN_GEN_CLAUDE_PATH=claude
LINKEDIN_GEN_API_URL=https://alisadikinma.com/api
LINKEDIN_GEN_API_TOKEN=...

# Compiled refs on VPS
LINKEDIN_GEN_REFS_PLAYBOOK=/home/claudesn/refs-linkedin-playbook.md
LINKEDIN_GEN_REFS_TEMPLATES=/home/claudesn/refs-linkedin-templates.md
LINKEDIN_GEN_REFS_FORMATS=/home/claudesn/refs-linkedin-formats.md
LINKEDIN_GEN_REFS_CAROUSEL=/home/claudesn/refs-linkedin-carousel.md

# Uniform Sonnet
LINKEDIN_GEN_MODEL_BRIEF=sonnet
LINKEDIN_GEN_MODEL_CONVERT=sonnet
LINKEDIN_GEN_MODEL_CAROUSEL=sonnet
LINKEDIN_GEN_MODEL_VALIDATE=sonnet

# MixPost (set after OAuth connect)
MIXPOST_LINKEDIN_ACCOUNT_ID=...

# Telegram event flags
TELEGRAM_NOTIFY_LINKEDIN_PREVIEW=true
TELEGRAM_NOTIFY_LINKEDIN_DEPTH_FAILED=true
TELEGRAM_NOTIFY_LINKEDIN_PUBLISHED=true

# Telegram webhook signature (Addendum 2 §12.1 D14a)
TELEGRAM_WEBHOOK_SECRET=                    # 32-char random, setWebhook secret_token param
TELEGRAM_CALLBACK_HMAC_KEY=                 # 32-char random, signs callback_data

# LinkedIn first-comment automation (Addendum 2 §12.1 D13)
LINKEDIN_FIRST_COMMENT_ENABLED=true
LINKEDIN_FIRST_COMMENT_DELAY_SECONDS=30

# PDF composition (Addendum 2 §12.1 D10 — TCPDF)
LINKEDIN_PDF_TEMP_DIR=/tmp/linkedin-pdfs
```

## Backend Integration (Portfolio_v2)

### New tables
- `linkedin_posts` (24 cols — see design doc §4.2) — schema finalized, migration in Phase D1

### New services
- `LinkedInGenerationService` — SSH/local exec, fork of `ArticleGenerationService`
- `LinkedInPublishService` — MixPost wrapper, kill-switch + cancel check
- Extended `TelegramNotificationService` — add `sendWithInlineKeyboard` method for cancel button

### New admin endpoints (auth:sanctum, 7 routes)
```
GET    /api/admin/linkedin-drafts              list + filter by status
GET    /api/admin/linkedin-drafts/{id}         show detail
PUT    /api/admin/linkedin-drafts/{id}         edit content
POST   /api/admin/linkedin-drafts/{id}/regenerate
POST   /api/admin/linkedin-drafts/{id}/approve
POST   /api/admin/linkedin-drafts/{id}/cancel
POST   /api/admin/linkedin-drafts/{id}/publish-now
```

### New automation endpoints (token-gated, 8 routes)
```
GET    /api/automation/linkedin/pending
GET    /api/automation/linkedin/{id}
PUT    /api/automation/linkedin/{id}/progress
PUT    /api/automation/linkedin/{id}/save-brief
PUT    /api/automation/linkedin/{id}/save-post
PUT    /api/automation/linkedin/{id}/save-carousel
PUT    /api/automation/linkedin/{id}/save-validation
POST   /api/automation/linkedin/{id}/schedule
```

### New Telegram webhook
```
POST   /api/telegram/callback  (HMAC-verified, handles inline cancel buttons)
```

### New cron
```php
// app/Console/Kernel.php
$schedule->command('linkedin:scan-and-generate')->dailyAt('03:00');
```

### Reuse (NO forking or duplicating)
- `HasStatusTransitions` trait — FSM pattern
- `PipelineGuard::advance` — transition logging
- `ArticleGenerationService` — SSH pattern (fork, don't edit)
- `ImageGenerationService` — extend with `context='linkedin_carousel'` + `segment_type='slide-N'`
- `CoverBrandingEnhancer` — watermark + branded filename flow (re-use, NO changes)
- `DispatchTelegramNotification` job — add new event types
- `CarouselDraftsList.vue` — 50% copy source for `LinkedInDraftsList.vue`
- `useCarouselDrafts.js` — 80% copy source for `useLinkedInDrafts.js`

## Code Style

### Plugin (TypeScript scripts + markdown skills)
- TypeScript strict mode, no `any`
- `zod` schemas for ALL skill I/O contracts (input + output)
- Vitest for TypeScript tests, fixture-driven for skills
- SKILL.md frontmatter required: `name`, `description`, `model: sonnet`, `triggers: [...]`
- No placeholder/TODO comments ever — if unimplementable, STOP and ask
- Commit messages: conventional (`feat(skill): ...`, `feat(plugin): ...`, `test(plugin): ...`, `docs: ...`)

### Backend (Laravel 12)
- Mirror Portfolio_v2 conventions (from root CLAUDE.md)
- Form Requests for all mutations
- API Resources for all responses
- Response format: `{success, data, message}` on 2xx; `{success:false, error:{code, message}}` otherwise
- All FSM transitions via `HasStatusTransitions::transitionTo` or `PipelineGuard::advance` — never direct `update(['status'=>...])`
- PHPUnit via Pest (follow existing suites)

### Frontend (Vue 3)
- `<script setup>` only
- TanStack Query for all server state
- `staleTime: 30s + refetchOnMount: 'always'` for operator-edited views (match Page Sections convention)
- Dark cinema theme (ULTRA Redesign tokens from root CLAUDE.md)

## Testing Convention

### Plugin skill tests (fixture-driven)
```
tests/fixtures/{skill}/input-*.json       ← fixture inputs
tests/fixtures/{skill}/expected-*.json     ← expected outputs (structural match)
tests/skills/{skill}.test.ts                ← vitest tests using skill-runner helper
```

Skill runner spawns Claude CLI with SKILL.md + fixture input, captures JSON, validates against Zod schema + structural equality to expected. Tolerates minor wording variance, asserts structural + numeric bounds (char count, slide count, depth_score range).

### Backend tests (Pest / PHPUnit)
- Feature tests for all endpoints (auth, mutations, FSM)
- Unit tests for services (mock SSH, mock MixPost facade)
- E2E tests gated to `--group=e2e` (slow, need real blog post)

### Smoke tests (manual)
- Phase B6: 3 real blog posts → text path
- Phase C4: 2 real listicle blogs → carousel path
- Phase E1-E4: E2E happy/cancel/kill-switch/depth-fail

Results saved to `docs/archive/2026-04-23-{path}-smoke-test.md`.

## Anti-Slop Enforcement (LinkedIn-specific)

Every skill MUST encode these hard rules. `linkedin-validate` checks them.

### Prohibited vocabulary (auto-fail)
- `delve into` / `delving into`
- `unlock the power of`
- `in today's fast-paced digital landscape`
- `at the end of the day`
- `navigating the complexities of`
- `harness the power of`
- `seamlessly integrate`

(Extend list as RAG research surfaces more — maintain in `refs-linkedin-playbook.md`)

### Prohibited CTAs (engagement bait — triggers algorithm demotion)
- `Comment YES if you agree`
- `Type A/B in the comments`
- `Drop a 🔥 if...`
- `Smash that like button`

### Prohibited structural patterns
- External links in post body (outside first comment) → 60% reach penalty
- Generic "AI Generalist" openers without specificity
- More than one hashtag per line
- Hashtag dumps (≥10 hashtags)

## Next Session Startup Checklist

When opening a new session in `D:\Projects\claude-plugin\linkedin-post-writer`:

1. Read this `CLAUDE.md` (already loaded as project memory)
2. Read `docs/plans/2026-04-23-plugin-architecture-full-auto.md` (design)
3. Read `docs/plans/2026-04-23-plugin-architecture-full-auto-plan.md` (execution plan)
4. Check current state: `git log --oneline -10` and `ls -la`
5. Identify which phase the last commit landed in. Typically:
   - If only `.claude-plugin/plugin.json` + `docs/` + `CLAUDE.md` exist → start Phase A1
   - If `CLAUDE.md` + `README.md` + `LICENSE` exist but no `skills/` → start Phase A2
   - etc.
6. Invoke `/gaspol-execute` with the plan file path. Executor will pick up at next undone phase.

## Stop-Points During Execution

Executor MUST pause and ask user at these points (flagged in plan):

1. **Phase D7** — `composer require inovector/mixpost` (confirm install + OAuth step)
2. **Phase D7 step 4** — MixPost admin UI manual OAuth connect (user provides `MIXPOST_LINKEDIN_ACCOUNT_ID`)
3. ~~**Phase D11** — PDF library choice~~ ✅ **Resolved per Addendum 2 D10: TCPDF locked, no stop needed**
4. **Phase D9** — Telegram webhook public endpoint confirmation + generate `TELEGRAM_WEBHOOK_SECRET` + `TELEGRAM_CALLBACK_HMAC_KEY` (2-layer sig approach locked per D14a)
5. **Phase D11b (NEW)** — LinkedIn API `/socialActions/{urn}/comments` smoke test. If 403 on own-post comment (unlikely for Personal account), fallback to Telegram manual-paste flow
6. **Phase E6** — Managed Agents upload confirmation (optional, defer if not ready)

Additional stop-points from plan §Open Decisions — see plan file.

## Success Criteria (v1.0 ship gate)

All must pass before declaring v1.0 complete:

- ≥80% of blogs published in last 7 days have linkedin_posts row
- ≥70% pass Depth Score ≥80 on first try (others → manual_review, acceptable)
- <10% cancel rate across first 20 auto-publishes
- Time-to-publish ≤24h from blog publish on happy path
- No stuck states in production for >6h
- Kill-switch verified operational
- Portfolio_v2 root `CLAUDE.md` updated with LinkedIn pipeline section
- This `CLAUDE.md` updated to reflect shipped state (remove ❌ markers)

## RAG Foundation Status

✅ Complete (2026-04-23). 6 files + INDEX at `docs/rag/linkedin-playbook/`. 127 sources via NotebookLM (`li-rag`).

To refresh RAG (quarterly or on algorithm drift):
```bash
nlm notebook query li-rag "specific question about latest LinkedIn behavior"
nlm report create li-rag --format "Create Your Own" --prompt "..." --confirm
```

To regenerate compiled refs after editing raw files:
```bash
npx tsx scripts/compile-refs.ts
```

## External Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| NotebookLM CLI (`nlm`) | ✅ Installed 0.5.17 | For RAG research + report generation. Auth expires 20 min |
| Claude Code CLI on VPS | ✅ Installed | Used via SSH from backend. User `claudesn`, key `/var/www/.ssh/id_ed25519` |
| MixPost OSS | ❌ Not installed | Phase D7 `composer require inovector/mixpost` |
| PDF generation lib | ❌ Not decided | Phase D11 stop-point |
| LinkedIn OAuth | ❌ Not connected | One-time manual via MixPost admin UI post-install |

## License

MIT (matches sibling plugins in the workspace). Copyright Ali Sadikin 2026.

---

**Maintainer:** Ali Sadikin (ali.sadikincom85@gmail.com)
**Pattern source:** `D:\Projects\claude-plugin\article-content-writer\`
**Backend host:** `D:\Projects\Portfolio_v2\` (Laravel 12 + Vue 3 SPA)
**Production:** https://alisadikinma.com
**Last Updated:** 2026-04-23 — Design + plan complete, Phase A1 next action
