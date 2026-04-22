# LinkedIn Post Writer — Plugin Architecture Plan (Full-Auto)

**Status:** DRAFT (design phase)
**Date:** 2026-04-23
**Owner:** Ali Sadikin
**Scope:** Claude Code plugin `linkedin-post-writer` + Portfolio_v2 backend wiring
**Mode:** Full-auto (cron → generate → validate → auto-publish) with Depth Score gate + Telegram preview window + kill-switch

---

## 1. Context & Goal

### 1.1 Problem
Every blog post published to `alisadikinma.com/blog` should auto-convert to an algorithm-optimized LinkedIn post (text or carousel) and auto-publish via MixPost — without manual intervention per post. Current workflow is 100% manual: write blog → remember to re-package → hand-craft LinkedIn post → publish. Cadence inconsistent, quality inconsistent, leverage on existing blog investment = 0%.

### 1.2 Goal
Ship a `linkedin-post-writer` Claude Code plugin + Portfolio_v2 backend integration that:
- Detects newly published blog posts daily via cron
- Generates LinkedIn-optimized content (text + conditional carousel) using 2026 algorithm research (Depth Score formula, Interest Graph, 12 hook formulas)
- Validates output against a quality gate (Depth Score threshold, default 80/100)
- Auto-publishes via MixPost (Laravel-native package, `composer require`) with a 15-min Telegram-cancel window as soft kill-switch
- Kill-switch env var `LINKEDIN_AUTO_PUBLISH=false` instantly reverts to manual queue

### 1.3 Non-goals (v1.0)
- Multi-persona (company page, team members) — personal account only
- Multi-language — English-primary per RAG 05-playbook
- Video format (short-video) — deferred to v1.1+ (needs VEO pipeline reuse from ai-video-promo-engine)
- Multi-image + GIF formats — deferred to v1.1+ (text + carousel covers 90% of leverage per RAG 04)
- A/B variation rotation — single canonical post per blog in v1.0
- Rate limiting (Tue+Thu only) — explicitly dropped by user; cadence dictated by blog velocity
- Knowledge Graph pillar check — dropped by user; trust conversion logic to stay on-brand

---

## 2. Design Decisions Log

| # | Decision | Rationale | Source |
|---|---|---|---|
| 1 | **Full plugin mirror** (not lean MVP) | User wants the full pattern from article-content-writer replicated for LinkedIn — compiled refs, split skills, SSH-triggered CLI, backend FSM, admin UI | Brainstorm Q1 2026-04-23 |
| 2 | **Full-auto trigger** (cron → generate → publish, no human review for happy path) | User wants zero-friction throughput, trusts Depth Score gate + human-override to catch bad output | Brainstorm Q2 2026-04-23 |
| 3 | **Safety gates: Depth Score threshold + Telegram preview/cancel + kill-switch env var** | User selected these 2 of 4 safety options; rejected pillar check + rate limit | Brainstorm Q3 2026-04-23 |
| 4 | **Scope v1.0: text + carousel** (no video, no multi-image, no GIF) | Carousel = 21-24% engagement vs text 3-4% per RAG 04 (5× leverage); video + multi-image low-ROI until carousel pipeline stable | Brainstorm Q4 2026-04-23 |
| 5 | **Additional carousel research required** before finalizing `linkedin-carousel` skill | RAG 01-05 has format-decision matrix but lacks deep carousel-design specifics (slide composition, CTA placement, typography, PDF specs); new `06-carousel-design.md` generated via NotebookLM | User instruction 2026-04-23 |
| 6 | **MixPost OSS** (`inovector/mixpost`, not Mixpost Pro SaaS) | Laravel-native composer package, self-hosted, zero SaaS middleware, integrates directly with Portfolio_v2 DB + queues | Per RAG 03-autopost-tools |
| 7 | **Sonnet for all skills** (uniform model choice, mirror article-content-writer post-v2.0) | Cost/quality sweet spot; Opus overkill for content repurposing | Mirror article-content-writer env convention |
| 8 | **Single canonical post per blog** (v1.0 — no A/B variation) | Reduce complexity; A/B rotation can be added in v1.1 once base pipeline stable | YAGNI |

---

## 3. Architecture Overview

### 3.1 Two-side architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Plugin side: linkedin-post-writer (Claude Code plugin)         │
│  Location: D:\Projects\claude-plugin\linkedin-post-writer\      │
│                                                                 │
│  • Skills: linkedin-gen, -brief, -convert, -carousel,           │
│            -validate, -schedule                                 │
│  • Agent: linkedin-writer                                       │
│  • References: compiled refs-linkedin-*.md                      │
│  • Hooks: SessionStart logger (mirror article-content-writer)   │
│  • Scripts: compile-refs, upload-skills                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SSH (claude CLI -p "/linkedin-gen ...")
                           │ --append-system-prompt-file refs-*.md
                           │ Progress callbacks via HTTP
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend side: Portfolio_v2 (Laravel 12)                        │
│  Location: D:\Projects\Portfolio_v2\backend\                    │
│                                                                 │
│  • Services: LinkedInGenerationService, LinkedInPublishService  │
│  • Controllers: Admin\LinkedInDraftController (manual queue)    │
│  • Models: LinkedInPost (+ FSM via HasStatusTransitions)        │
│  • Commands: ScanBlogForLinkedInConversion (daily cron)         │
│  • Jobs: GenerateLinkedInPost, DispatchLinkedInPublish          │
│                                                                 │
│  Integrations:                                                  │
│  • MixPost OSS (composer require inovector/mixpost)             │
│  • Telegram (reuse DispatchTelegramNotification job)            │
│  • GeminiGen (reuse ImageGenerationService for carousel slides) │
│  • CoverBrandingEnhancer (reuse for slide watermark/filename)   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Plugin skills (6 skills + 1 agent)

| Skill | Purpose | Inputs | Outputs | Model |
|---|---|---|---|---|
| `linkedin-gen` | All-in-one end-to-end wrapper (interactive + pipeline fallback). Mirrors `article-gen` pattern | Blog post ID or URL | Complete draft ready for `linkedin-schedule` | Sonnet |
| `linkedin-brief` | **Step 1**: read blog post, decide format (text vs carousel via heuristic), pick hook formula (12 options per RAG 02), pick pillar slot, identify key quote/insight | Blog post content | `brief.json` (format, hook_id, pillar, angle, pull_quote) | Sonnet |
| `linkedin-convert` | **Step 2a (always)**: blog → LinkedIn text post. 1100-1300 chars, 1-2 sentence paragraphs, link-in-comment, inject hook + CTA + 3-5 hashtags | Brief + blog content | `post.json` (text, link_comment, hashtags[]) | Sonnet |
| `linkedin-carousel` | **Step 2b (conditional)**: if `brief.format=carousel`, generate 7-10 slide (strategic sweet spot per RAG 06; 5-8 for short frameworks) content + per-slide image prompts (reuse GeminiGen via backend). Authored against `refs-linkedin-carousel-design.md` (from NotebookLM 06-report) | Brief + blog content | `carousel.json` (slides[] with copy + image_prompt), slide count, aspect_ratio | Sonnet |
| `linkedin-validate` | **Step 3**: Depth Score gate — hook strength, char count, comment-bait presence, link compliance, hashtag count, paragraph rhythm, carousel-specific rules. Score 0-100 | Post + carousel | `validation.json` (score, failures[], suggestions[]) | Sonnet |
| `linkedin-schedule` | **Step 4**: hit backend `/automation/linkedin/schedule` → MixPost dispatch. Sets 15-min Telegram cancel window | Validated post | Schedule confirmation (mixpost_job_id, scheduled_at) | Sonnet |

Plus:
- `linkedin-writer` agent — self-contained subagent for batch production (mirror article-writer)

### 3.3 Plugin file structure (target)

```
D:\Projects\claude-plugin\linkedin-post-writer\
├── .claude-plugin/
│   └── plugin.json                  ✅ EXISTS (v0.1.0)
├── CLAUDE.md                        ❌ TODO (plugin-level rules, anti-slop, model routing)
├── README.md                        ❌ TODO (install + usage + architecture overview)
├── LICENSE                          ❌ TODO (MIT, copy from article-content-writer)
│
├── skills/                          ❌ TODO (6 skills)
│   ├── linkedin-gen/
│   │   ├── SKILL.md                 (frontmatter: name, description, model, triggers)
│   │   └── assets/                  (example outputs, JSON schemas)
│   ├── linkedin-brief/SKILL.md
│   ├── linkedin-convert/SKILL.md
│   ├── linkedin-carousel/SKILL.md
│   ├── linkedin-validate/SKILL.md
│   └── linkedin-schedule/SKILL.md
│
├── agents/                          ❌ TODO
│   └── linkedin-writer.md
│
├── references/                      ⚠️ PARTIAL (raw RAG exists in docs/rag/, refs not compiled)
│   ├── raw/                         (source markdown — will point to docs/rag/linkedin-playbook/)
│   └── compiled/                    ❌ TODO
│       ├── refs-linkedin-playbook.md      (01-main-playbook + 05-hashtags consolidated)
│       ├── refs-linkedin-templates.md     (02-templates-hooks + CTA bank)
│       ├── refs-linkedin-formats.md       (04-media-format-decision)
│       └── refs-linkedin-carousel.md      (06-carousel-design ← from NotebookLM, PENDING)
│
├── hooks/                           ❌ TODO
│   └── session-start.sh             (logger pattern mirror from article-content-writer)
│
├── scripts/                         ❌ TODO
│   ├── compile-refs.ts              (raw docs/rag/*.md → compiled refs-*.md)
│   └── upload-skills.ts             (for Managed Agents platform integration)
│
└── docs/
    ├── rag/
    │   └── linkedin-playbook/       ✅ EXISTS (01-05 + this 06 pending)
    │       ├── INDEX.md
    │       ├── 01-main-playbook.md
    │       ├── 02-templates-hooks.md
    │       ├── 03-autopost-tools.md
    │       ├── 04-media-format-decision.md
    │       ├── 05-hashtags-timing-language.md
    │       └── 06-carousel-design.md        ← PENDING (this session, NotebookLM)
    └── plans/
        └── 2026-04-23-plugin-architecture-full-auto.md   ← THIS FILE
```

---

## 4. Backend Wiring (Portfolio_v2)

### 4.1 New files

```
backend/
├── app/
│   ├── Services/
│   │   ├── LinkedInGenerationService.php         # SSH/local exec → claude CLI
│   │   ├── LinkedInPublishService.php            # MixPost dispatcher + Telegram gate
│   │   ├── LinkedInCommentService.php            # [ADDENDUM 2 §12.3] LinkedIn API /socialActions/{urn}/comments wrapper
│   │   └── LinkedInPdfCompositionService.php     # [ADDENDUM 2 §12.3] TCPDF 10 PNG → 1 PDF stitch
│   ├── Http/Controllers/Api/
│   │   ├── Admin/LinkedInDraftController.php     # Manual override queue
│   │   ├── Automation/LinkedInCallbackController.php  # Plugin callbacks
│   │   └── Telegram/TelegramCallbackController.php    # [ADDENDUM 2 §12] 2-step cancel webhook
│   ├── Http/Middleware/
│   │   └── VerifyTelegramSignature.php           # [ADDENDUM 2 §12.1 D14a] secret_token + HMAC callback_data verify
│   ├── Models/
│   │   └── LinkedInPost.php                      # + HasStatusTransitions trait
│   ├── Enums/
│   │   └── LinkedInPostStatus.php                # FSM enum
│   ├── Jobs/
│   │   ├── GenerateLinkedInPost.php              # Dispatched by cron
│   │   ├── DispatchLinkedInPublish.php           # 15-min delayed publish
│   │   ├── PostLinkedInFirstComment.php          # [ADDENDUM 2 §12.3] 30s delayed after publish
│   │   └── HandleTelegramCancelCallback.php      # Telegram button handler (2-step flow)
│   └── Console/Commands/
│       └── ScanBlogForLinkedInConversion.php     # Daily cron 03:00 WIB
│
├── database/migrations/
│   └── 2026_XX_XX_create_linkedin_posts_table.php
│
└── config/
    └── linkedin.php                          # Feature flags, thresholds

frontend/src/
├── views/admin/
│   ├── LinkedInDraftsList.vue                # Manual override queue
│   └── LinkedInDraftDetail.vue               # Edit + retry + manual publish
└── composables/
    └── useLinkedInDrafts.js                  # TanStack Query wrapper
```

### 4.2 DB schema — `linkedin_posts`

```php
Schema::create('linkedin_posts', function (Blueprint $table) {
    $table->id();

    // Blog source
    $table->foreignId('post_id')->constrained('posts')->cascadeOnDelete();

    // Content
    $table->enum('format', ['text', 'carousel']);
    $table->text('content');                    // LinkedIn post body
    $table->string('link_comment', 500)->nullable();  // First comment with blog link
    $table->json('hashtags');                   // ['#AI', '#Solopreneur', ...]
    $table->json('carousel_slides')->nullable(); // [{copy, image_url, image_prompt}, ...]
    $table->string('carousel_pdf_path')->nullable();  // Local path to generated PDF

    // Validation
    $table->unsignedTinyInteger('depth_score')->nullable();  // 0-100
    $table->json('validation_log')->nullable(); // {failures[], suggestions[]}

    // Scheduling
    $table->string('mixpost_account_id')->nullable();
    $table->string('mixpost_post_id')->nullable();  // MixPost's internal post ID
    $table->timestamp('scheduled_at')->nullable();
    $table->timestamp('cancel_window_ends_at')->nullable(); // scheduled_at - 15min? No: publish attempts at cancel_window_ends_at
    $table->timestamp('published_at')->nullable();
    $table->string('linkedin_post_url')->nullable();  // Final published URL

    // Status
    $table->enum('status', [
        'pending_generation', 'generating', 'validating',
        'awaiting_publish', 'published', 'cancelled',
        'failed', 'manual_review'
    ])->default('pending_generation');
    $table->json('state_log')->nullable();       // Rotating 20-entry audit log
    $table->text('last_error')->nullable();
    $table->unsignedTinyInteger('retry_count')->default(0);

    $table->timestamps();
    $table->softDeletes();

    $table->index(['status', 'scheduled_at']);
    $table->index('post_id');
});
```

### 4.3 FSM — `LinkedInPostStatus` enum

```
pending_generation
  │
  ▼
generating ─────────► failed (auto-retry 3x, then manual_review)
  │
  ▼
validating
  │     │
  │     └──► (depth_score < threshold) ──► manual_review (Telegram alert)
  ▼
awaiting_publish (cancel window open, Telegram preview sent)
  │     │
  │     └──► (user clicks cancel in Telegram) ──► cancelled
  │     │
  │     └──► (kill-switch LINKEDIN_AUTO_PUBLISH=false) ──► manual_review
  ▼
published

                   manual_review ──► (admin edits + approves) ──► awaiting_publish
                                 ──► (admin rejects) ──► cancelled
```

Transitions enforced via `HasStatusTransitions::transitionTo()` — same pattern as `ContentIdea`.

### 4.4 New env vars

```env
# Core
LINKEDIN_AUTO_PUBLISH=true                    # Master kill-switch
LINKEDIN_DEPTH_SCORE_THRESHOLD=80             # Min score to auto-publish
LINKEDIN_CANCEL_WINDOW_MINUTES=15             # Telegram override window
LINKEDIN_CRON_SCHEDULE="0 3 * * *"            # Daily 03:00 WIB

# Generation service (mirror ARTICLE_GEN_*)
LINKEDIN_GEN_DRIVER=ssh                       # ssh | local
LINKEDIN_GEN_SSH_HOST=localhost
LINKEDIN_GEN_SSH_USER=claudesn
LINKEDIN_GEN_SSH_KEY=/var/www/.ssh/id_ed25519
LINKEDIN_GEN_CLAUDE_PATH=claude
LINKEDIN_GEN_API_URL=https://alisadikinma.com/api
LINKEDIN_GEN_API_TOKEN=...                    # From admin Automation Tokens

# Compiled refs
LINKEDIN_GEN_REFS_PLAYBOOK=/home/claudesn/refs-linkedin-playbook.md
LINKEDIN_GEN_REFS_TEMPLATES=/home/claudesn/refs-linkedin-templates.md
LINKEDIN_GEN_REFS_FORMATS=/home/claudesn/refs-linkedin-formats.md
LINKEDIN_GEN_REFS_CAROUSEL=/home/claudesn/refs-linkedin-carousel.md

# Per-phase models (uniform sonnet for v1.0)
LINKEDIN_GEN_MODEL_BRIEF=sonnet
LINKEDIN_GEN_MODEL_CONVERT=sonnet
LINKEDIN_GEN_MODEL_CAROUSEL=sonnet
LINKEDIN_GEN_MODEL_VALIDATE=sonnet

# MixPost
MIXPOST_LINKEDIN_ACCOUNT_ID=...               # Set after OAuth connect

# Telegram (reuse existing — adds new notify flags)
TELEGRAM_NOTIFY_LINKEDIN_PREVIEW=true         # Send preview + cancel link
TELEGRAM_NOTIFY_LINKEDIN_DEPTH_FAILED=true
TELEGRAM_NOTIFY_LINKEDIN_PUBLISHED=true

# Telegram webhook signature (ADDENDUM 2 §12.4 — decision D14a)
TELEGRAM_WEBHOOK_SECRET=                      # 32-char random, passed to setWebhook secret_token param
TELEGRAM_CALLBACK_HMAC_KEY=                   # 32-char random, signs callback_data payload

# LinkedIn first-comment automation (ADDENDUM 2 §12.4 — decision D13)
LINKEDIN_FIRST_COMMENT_ENABLED=true           # Feature flag
LINKEDIN_FIRST_COMMENT_DELAY_SECONDS=30       # Delay before POST comment to /socialActions/{urn}/comments

# PDF composition (ADDENDUM 2 §12.4 — decision D10)
LINKEDIN_PDF_TEMP_DIR=/tmp/linkedin-pdfs      # Where TCPDF writes before upload to disk/S3
```

### 4.5 API routes

**Admin (auth:sanctum):**
```
GET    /api/admin/linkedin-drafts                    # List drafts (filter by status)
GET    /api/admin/linkedin-drafts/{id}               # Show draft detail
PUT    /api/admin/linkedin-drafts/{id}               # Edit content + carousel
POST   /api/admin/linkedin-drafts/{id}/regenerate    # Re-run /linkedin-gen on the same blog
POST   /api/admin/linkedin-drafts/{id}/approve       # manual_review → awaiting_publish
POST   /api/admin/linkedin-drafts/{id}/cancel        # any → cancelled
POST   /api/admin/linkedin-drafts/{id}/publish-now   # awaiting_publish → published (skip cancel window)
```

**Automation (public, token-gated — for plugin callbacks):**
```
GET    /api/automation/linkedin/pending              # Next pending_generation idea
GET    /api/automation/linkedin/{id}                 # Full draft data
PUT    /api/automation/linkedin/{id}/progress        # Progress callback (step, %, message)
PUT    /api/automation/linkedin/{id}/save-brief      # Step 1 output
PUT    /api/automation/linkedin/{id}/save-post       # Step 2a output (text)
PUT    /api/automation/linkedin/{id}/save-carousel   # Step 2b output
PUT    /api/automation/linkedin/{id}/save-validation # Step 3 output
POST   /api/automation/linkedin/{id}/schedule        # Step 4 trigger
```

**Telegram webhook (existing extension):**
```
POST   /api/telegram/callback                        # Handle inline button callbacks
                                                     # (reuse existing bot setup, add new callback_data prefixes)
```

---

## 5. Pipeline Flow

### 5.1 Happy path (full-auto)

```
[03:00 WIB daily]
  └─► ScanBlogForLinkedInConversion cron
        │
        └─► Query: posts published in last 24h WITH no linkedin_posts row
              │
              └─► Per post:
                    ├─► LinkedInPost::create(status='pending_generation')
                    └─► dispatch(GenerateLinkedInPost::class, $draft)
                          │
                          └─► LinkedInGenerationService::generate()
                                │
                                ├─► SSH: claude -p "/linkedin-gen <id>"
                                │        --model sonnet
                                │        --append-system-prompt-file refs-linkedin-*.md
                                │
                                ├─► status='generating' (Step 1 brief)
                                ├─► status='generating' (Step 2a convert — always)
                                ├─► status='generating' (Step 2b carousel — if format=carousel)
                                └─► status='validating' (Step 3 — validator scores 0-100)
                                      │
                                      ├─► score >= 80:
                                      │     └─► status='awaiting_publish'
                                      │          ├─► scheduled_at = now() + 15min
                                      │          ├─► cancel_window_ends_at = scheduled_at
                                      │          └─► dispatch(DispatchLinkedInPublish, delay=15min)
                                      │                └─► Telegram preview sent NOW with:
                                      │                      - Post text + carousel images thumbnail
                                      │                      - Inline button: [❌ Cancel (15 min left)]
                                      │                      - callback_data=cancel:{id}
                                      │
                                      └─► score < 80:
                                            └─► status='manual_review'
                                                 └─► Telegram alert: "Depth Score failed, review at /admin/linkedin-drafts/{id}"
                                                       (no inline button — admin reviews via web UI)
         [15 min elapses]
          │
          └─► DispatchLinkedInPublish fires (only if status still='awaiting_publish')
                │
                ├─► Check kill-switch: LINKEDIN_AUTO_PUBLISH
                │     ├─► false → demote to manual_review, Telegram alert
                │     └─► true  → continue
                │
                └─► LinkedInPublishService::publish()
                      │
                      ├─► MixPost API: create + schedule post
                      │     (text + carousel_pdf_path if carousel)
                      ├─► status='published'
                      ├─► linkedin_post_url = response.permalink
                      └─► Telegram: "✅ Published: {url}"
```

### 5.2 Cancel path (user clicks Telegram button within 15 min)

```
[Telegram inline button clicked]
  └─► POST /api/telegram/callback (callback_data=cancel:{id})
        └─► HandleTelegramCancelCallback job
              ├─► Find LinkedInPost where id={id} AND status='awaiting_publish'
              ├─► Atomic transitionTo('cancelled') — rejects if status changed
              ├─► DispatchLinkedInPublish job will no-op on fire (status check)
              └─► Telegram reply: "🚫 Cancelled — will not publish"
```

### 5.3 Kill-switch flip

```
Operator sets LINKEDIN_AUTO_PUBLISH=false in .env → php artisan config:cache
  │
  └─► Next time DispatchLinkedInPublish fires for any awaiting_publish draft:
        └─► Check fails, transitionTo('manual_review'), Telegram alert
        └─► New drafts still generate + validate, but terminate at manual_review
```

---

## 6. Data Integration Map

| Component | Data Source | Existing? | Notes |
|---|---|---|---|
| Read published blog post | `PostController@show` (reuse `GET /api/automation/posts/{id}`) | ✅ | No new endpoint needed |
| Trigger Claude CLI | `LinkedInGenerationService` (fork from `ArticleGenerationService`) | ⚠️ Adapt | Same SSH pattern, different refs + skills |
| Carousel image gen (7-10 slide (strategic sweet spot per RAG 06; 5-8 for short frameworks)s) | `ImageGenerationService` + `CoverBrandingEnhancer` | ✅ | Reuse with new `ImageGenerationJob.context='linkedin_carousel'` + new `segment_type='slide-N'` |
| Brand watermark + branded filename | `creator_brand` Settings group | ✅ | Zero new work, same `appendWatermark` flow. Filename: `alisadikinma-{slug}-slide-N.png` |
| Brief generation hook catalog | `refs-linkedin-templates.md` (compiled from 02-templates-hooks) | ⚠️ Compile | Script `compile-refs.ts` needs to build this |
| Format decision matrix | `refs-linkedin-formats.md` (from 04-media-format-decision) | ⚠️ Compile | Plugin reads this during Step 1 brief |
| Carousel design rules | `refs-linkedin-carousel.md` (from 06-carousel-design) | ❌ **BLOCKED** | Pending NotebookLM report generation this session |
| Depth Score validator rules | Embedded in `linkedin-validate` SKILL.md + `refs-linkedin-playbook.md` | ❌ New | Encode: hook strength, char count 1100-1300, hashtag count 3-5, link placement, paragraph rhythm |
| Telegram alerts | `DispatchTelegramNotification` + `TelegramNotificationService` | ✅ | New event types: `linkedin_preview`, `linkedin_depth_failed`, `linkedin_published`, `linkedin_cancelled` |
| Telegram inline button (cancel) | **New** — `TelegramNotificationService::sendWithCallback` | ❌ New | Extend service to accept `reply_markup.inline_keyboard[]`, add `callback_data` handler endpoint |
| FSM + audit log | `HasStatusTransitions` + `state_log` JSON column | ✅ | Pattern reuse, new enum `LinkedInPostStatus` |
| MixPost scheduling | `inovector/mixpost` Laravel package | ❌ New | `composer require` + OAuth one-time config via MixPost admin UI |
| Cron scheduler | Laravel Scheduler | ✅ | Add `ScanBlogForLinkedInConversion` to `app/Console/Kernel.php` |
| Admin override UI | Vue 3 + TanStack Query + dark cinema theme | ✅ | New views `LinkedInDraftsList.vue` + `LinkedInDraftDetail.vue` (~50% copy-paste from `CarouselDraftsList.vue`) |

---

## 7. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Bad auto-post damages personal brand** (Ali = AI Generalist Expert positioning) | HIGH | Depth Score gate (80 threshold, high bar) + Telegram cancel window (human-in-the-loop with 15 min) + kill-switch env var |
| 2 | **LinkedIn throttles off-niche content** (Knowledge Graph 2026) | MED | Plugin prompt must reference RAG 01-playbook pillars explicitly. Validator checks niche fit. Dropped as separate gate (trust conversion) but monitored post-publish |
| 3 | **MixPost OAuth breaks** (token refresh, LinkedIn API changes) | MED | MixPost handles this internally; plugin just hits MixPost API. Fallback: drafts stay in manual_review, Telegram alerts operator |
| 4 | **Carousel PDF generation fails** (image missing, dimensions wrong) | MED | Per-slide status + retry pipeline (mirror segment retry from ContentIdea). Skip + fallback to text-only post if carousel fails after retries |
| 5 | **Plugin RAG drift vs LinkedIn algorithm changes** | LOW | RAG regenerable via NotebookLM (`nlm report create li-rag`). Quarterly refresh cadence |
| 6 | **Duplicate posting** (blog edited after initial conversion) | LOW | Unique constraint on `linkedin_posts.post_id` (single row per blog). Edit → manual regenerate flow |
| 7 | **Rate limit from LinkedIn API** via MixPost | LOW | MixPost queues handle rate limiting. High unlikely given blog cadence ≤ 1/day |
| 8 | **Telegram down → kill-switch unreachable** | LOW | Kill-switch is env var, not Telegram. Telegram is only the soft-cancel UX |

---

## 8. Implementation Timeline

### Phase 1 — Plugin skeleton (3-4 days)
- [ ] `CLAUDE.md` — plugin-level rules (anti-slop, model routing, gotchas)
- [ ] `README.md` — install + usage + architecture overview
- [ ] `LICENSE` (MIT)
- [ ] `references/` — raw symlinks to `docs/rag/linkedin-playbook/*.md`
- [ ] `scripts/compile-refs.ts` — raw → compiled `refs-linkedin-*.md` (4 files)
- [ ] `hooks/session-start.sh` — mirror pattern
- [ ] `scripts/upload-skills.ts` — for Managed Agents platform (defer exec until ready)
- [ ] `.claude-plugin/plugin.json` — finalize skills array + agent reference
- [ ] Bump version to 0.2.0

**Deliverable:** plugin scaffolding matches article-content-writer file structure 1:1.

### Phase 2 — Text-only skills (3-4 days)
- [ ] `skills/linkedin-brief/SKILL.md` — read blog, decide format heuristic, pick hook from 12-formula library
- [ ] `skills/linkedin-convert/SKILL.md` — blog → LinkedIn text post (1100-1300 char sweet spot, link-in-comment)
- [ ] `skills/linkedin-validate/SKILL.md` — Depth Score gate (scoring rubric)
- [ ] `skills/linkedin-schedule/SKILL.md` — API call to backend schedule endpoint
- [ ] `skills/linkedin-gen/SKILL.md` — all-in-one orchestrator
- [ ] `agents/linkedin-writer.md` — batch agent
- [ ] Test end-to-end on 3 real blog posts manually (pre-backend)

**Deliverable:** `claude -p "/linkedin-gen {blogUrl}"` produces valid text post + validation JSON locally.

### Phase 3 — Carousel skill (3-4 days)
- [ ] `skills/linkedin-carousel/SKILL.md` — 7-10 slide (strategic sweet spot per RAG 06; 5-8 for short frameworks) content + per-slide image prompts
  - Uses `refs-linkedin-carousel.md` (06-carousel-design output)
  - Slide schema: `{index, copy, image_prompt, layout_hint}`
  - Cover slide hook + content slides + CTA slide structure per RAG
- [ ] Extend `linkedin-brief` to emit `format=carousel` when heuristic matches (>5 H2, listicle signals, tutorial content)
- [ ] Test end-to-end: blog with >5 H2 → 7-slide carousel JSON

**Deliverable:** plugin produces carousel JSON matching `refs-linkedin-carousel.md` spec.

### Phase 4 — Backend wiring (5-7 days)
- [ ] `composer require inovector/mixpost` + OAuth one-time LinkedIn connect
- [ ] Migration `create_linkedin_posts_table`
- [ ] `LinkedInPost` model + `LinkedInPostStatus` enum + `HasStatusTransitions` trait
- [ ] `LinkedInGenerationService` (SSH → claude CLI, progress callbacks)
- [ ] `LinkedInPublishService` (MixPost API wrapper + cancel window logic)
- [ ] `LinkedInDraftController` (admin override queue — 7 endpoints)
- [ ] `LinkedInCallbackController` (8 automation callbacks)
- [ ] `ScanBlogForLinkedInConversion` command + Kernel schedule
- [ ] `GenerateLinkedInPost` + `DispatchLinkedInPublish` + `HandleTelegramCancelCallback` jobs
- [ ] Extend `TelegramNotificationService` for inline-button callbacks
- [ ] Extend `ImageGenerationService` for `context='linkedin_carousel'` (new segment types)
- [ ] Frontend: `LinkedInDraftsList.vue` + `LinkedInDraftDetail.vue` + `useLinkedInDrafts.js`

**Deliverable:** cron fires → generates → validates → publishes (test mode with 15-min window default).

### Phase 5 — Integration + testing (3-5 days)
- [ ] E2E test: publish a real blog post → observe cron → Telegram preview → let publish fire → verify LinkedIn
- [ ] Test cancel path: click Telegram cancel → verify no publish
- [ ] Test kill-switch: flip env var → verify demote to manual_review
- [ ] Test carousel: blog with >5 H2 → verify 7-10 slide PDF uploaded
- [ ] Test Depth Score fail: craft intentionally bad output → verify manual_review
- [ ] CLAUDE.md update (both plugin and Portfolio_v2)

**Deliverable:** v1.0 shipped to production, auto-converts daily.

### Total estimate: **~3 weeks** (17-24 calendar days)

---

## 9. Open Questions

| # | Question | Decision owner | Blocker? | Status |
|---|---|---|---|---|
| 1 | **Which MixPost edition** — OSS vs Pro? OSS supports LinkedIn Personal only; Pro adds Company Page + analytics. Relevant: v1.0 scope = personal account only | Ali | No (defaults to OSS) | ✅ Resolved — MixPost OSS locked (design decision #6) |
| 2 | **Carousel PDF generation library** — `barryvdh/laravel-dompdf` vs programmatic slide composition | Tech decision, Phase 3 | Not yet | ✅ Resolved 2026-04-23 session 2 — **TCPDF** (§12.1 decision D10) |
| 3 | **Link-in-comment automation** — LinkedIn API doesn't support auto-commenting on your own post. MixPost Pro has this; OSS doesn't. Manual paste first comment after publish, OR delay via scheduled cron job? | Tech decision, Phase 4 | Not yet | ✅ Resolved 2026-04-23 session 2 — **delayed job + LinkedIn API direct** (§12.1 decision D13, §12.3 `LinkedInCommentService`) |
| 4 | **Blog velocity assumption** — Portfolio_v2 publishes X posts/week on average? Affects queue depth assumptions. No rate limit set per user decision | Observation, post-launch | No | 🟡 Open — to be measured post-launch |
| 5 | **Carousel research output** — is `06-carousel-design.md` complete and detailed enough to drive `linkedin-carousel` skill, or need more sources? | Ali, upon review | **YES — blocks Phase 3** | ✅ Resolved 2026-04-23 — RAG 06 accepted, drives §12 addendum decisions |
| 6 | **Telegram webhook signature approach** — HMAC vs native secret_token vs IP allowlist? | Tech decision, Phase D9 | Previously unflagged, now tracked | ✅ Resolved 2026-04-23 session 2 — **2-layer (secret_token + HMAC callback_data)** (§12.1 decision D14a) |
| 7 | **Cancel button UX** — single-tap vs two-step confirm vs rich 3-button layout? | Tech decision, Phase D9 | Previously unflagged | ✅ Resolved 2026-04-23 session 2 — **two-step confirm** (§12.1 decision D14b) |
| 8 | **Human Fingerprint slide image source** — candid photo library, portrait upload, or logo fallback? | Design decision, Phase 3 | Previously in Appendix C.8 | ⚠️ Resolved 2026-04-23 session 2 — **`creator_brand_logo` reuse** (§12.1 decision D11, **flagged for v1.1 re-litigation** if Depth Score median < 82) |

---

## 10. Success Metrics (post-launch)

- **Throughput:** ≥80% of published blogs get a LinkedIn post within 24h
- **Quality gate pass rate:** ≥70% pass Depth Score (others go to manual_review — acceptable if admin catches them)
- **Cancel rate:** <10% (high cancel = Depth Score threshold too lax)
- **Published engagement:** avg Depth Score of published posts tracked via MixPost analytics
- **Time-to-first-post:** from blog publish → LinkedIn publish ≤ 24h for happy path, ≤ 48h including manual review

---

## 11. Next Actions (this session, post-design-doc)

1. **[BLOCKED → UNBLOCK]** Finish NotebookLM `06-carousel-design.md` report (in progress, ~2-4 min)
2. Write `06-carousel-design.md` to both RAG locations + update INDEX.md
3. Cross-reference this planning doc's Phase 3 (carousel skill) against the actual 06-report — flag any architectural gaps
4. Commit planning doc + RAG updates (separate commits — plugin repo + Portfolio_v2)
5. Hand-off to `/gaspol-plan` for step-by-step implementation plan (appends to this file under `## Implementation Plan` section per hybrid file convention)

---

## Appendix A — RAG Foundation References

| File | Purpose in plugin |
|---|---|
| `docs/rag/linkedin-playbook/01-main-playbook.md` | Algorithm mechanics, Depth Score formula, pillars → compiled into `refs-linkedin-playbook.md` |
| `docs/rag/linkedin-playbook/02-templates-hooks.md` | 12 hook formulas, 7 post structures, CTA bank → compiled into `refs-linkedin-templates.md` |
| `docs/rag/linkedin-playbook/03-autopost-tools.md` | MixPost choice, operational notes (not compiled — reference only) |
| `docs/rag/linkedin-playbook/04-media-format-decision.md` | Format decision matrix → compiled into `refs-linkedin-formats.md` |
| `docs/rag/linkedin-playbook/05-hashtags-timing-language.md` | Hashtag rules, timing, EN-primary → merged into `refs-linkedin-playbook.md` |
| `docs/rag/linkedin-playbook/06-carousel-design.md` | **PENDING** — Carousel design specifics → compiled into `refs-linkedin-carousel.md` |

## Appendix B — Carousel Design Constraints (from RAG 06)

Consolidated from [`06-carousel-design.md`](../rag/linkedin-playbook/06-carousel-design.md) — these rules MUST be encoded in `linkedin-carousel` SKILL.md + `linkedin-validate` SKILL.md.

### C.1 Slide structure

| Constraint | Value | Applies to |
|---|---|---|
| Dimensions | **1080 × 1350 px** (portrait) | PDF export, each page |
| Slide count (strategic sweet spot) | **7–10 slides** | All formats |
| Slide count (listicles) | 7–10 (one item/slide) | Listicle detection |
| Slide count (frameworks/tutorials) | 5–8 | Framework detection |
| Slide count (case studies) | 8–10 | Case-study detection |
| PDF file size | < 100 MB | Export validation |

### C.2 Typography (Ali's brand kit mapped)

| Role | Font | Min size | Notes |
|---|---|---|---|
| H1 (cover hooks) | Space Grotesk | (no explicit min; 60pt+ from sibling research) | High-contrast, bold |
| Body | Inter | **24pt minimum** on 1080px canvas | Scannability on mobile |
| Labels/Data | JetBrains Mono | - | "Machine code" callouts only |
| Contrast ratio (H1 : body) | **≥ 2:1** | - | Hard rule |

### C.3 Mobile safe zones (MANDATORY)

```
┌─────────────────────┐
│ TOP DEAD ZONE       │  ← 150px (profile overlay)
│ (150px)             │    NO text, logos, or CTAs here
├─────────────────────┤
│                     │
│                     │
│   CONTENT AREA      │  75px margin left/right
│   (1000px tall)     │
│                     │
│                     │
├─────────────────────┤
│ BOTTOM DEAD ZONE    │  ← 200px (page counter + CTA buttons)
│ (200px)             │    NO text, logos, or CTAs here
└─────────────────────┘
```

### C.4 Cover slide hook frameworks (5, pick one per brief)

| Framework | Trigger | Example |
|---|---|---|
| **PAS** (Problem-Agitation-Solution) | Emotional urgency | "Your SaaS churn is killing your growth." |
| **AIDA** (Attention-Interest-Desire-Action) | Curiosity gap | "The secret to 10k followers in 30 days." |
| **Before/After** | Immediate proof | "How we cut design time from 10 hours to 10 minutes." |
| **Mistakes / Loss Aversion** | Authority + risk | "5 design errors ruining your brand credibility." |
| **Contrarian Take** | Debate trigger | "Stop building features your customers didn't ask for." |

`linkedin-brief` skill selects from THIS set for carousel format (distinct from the 12-formula set for text posts in RAG 02).

### C.5 Validator hard rules (MUST FAIL if violated)

The `linkedin-validate` skill checks these and subtracts from Depth Score:

| Rule | Violation | Deduction |
|---|---|---|
| Body font < 24pt | -15 pts |
| Text in top 150px or bottom 200px dead zone | -15 pts |
| AI Slop phrases present | -20 pts (hard fail) |
| Engagement bait ("Comment YES", "Type A for...") | -20 pts (hard fail) |
| External link in post body (not first comment) | -30 pts (hard fail — 60% reach penalty) |
| Slide 1 doesn't promise specific payoff | -10 pts |
| No Direct Answer Block (30–80 word summary) | -5 pts |
| No page numbers / progress indicators | -5 pts |
| Final slide missing CTA | -15 pts |
| Final slide missing Human Fingerprint image | -10 pts |
| Hashtag count outside 3–5 | -5 pts per hashtag over/under |

**AI Slop blacklist** (`linkedin-validate` substring match):
- "delve into" / "delving into"
- "unlock the power of"
- "in today's fast-paced digital landscape"
- "at the end of the day"
- "navigating the complexities"
- (extend list from RAG 01-main-playbook §AI Slop Classifier)

### C.6 Structure template ("Build in Public" flow — default for v1.0)

```
Slide 1 (Hook):       PAS/AIDA opener — specific problem or claim
Slide 2 (Expand):     Stakes / context — why this matters
Slide 3-5 (Proof):    "War stories" — proprietary data, personal failures, candid imagery
                      MUST include Human Fingerprint image on at least one slide
Slide 6-8 (Insight):  Framework / solution / new implementation
Slide 9 (Direct Answer Block): 30-80 word summary for AI search crawlers
Slide 10 (CTA):       Specific question asking for 5+ word comment
                      Link-in-comment reminder: "Blog link in comments 👇"
```

Minimum 7 slides to fit this arc; compress to 5 slides only when content is genuinely short (e.g., framework with 3 steps).

### C.7 Color palette direction (v1.0 default)

Per RAG 06 + Portfolio_v2 Ultra Redesign tokens (from root CLAUDE.md):

- **Prohibited:** Generic corporate blue (#0077B5 LinkedIn-default — contributes to "Strategic Convergence" AI-slop flagging)
- **Preferred v1.0:** Dark Cinema (matches Portfolio_v2 ULTRA theme)
  - `--bg-deep: #050506`
  - `--bg-elevated: #0C0C0F`
  - `--fg-primary: #EDEDEF`
  - `--accent-gold: #D4A843` (cover hook highlight + CTA)
  - `--accent-cyan: #06B6D4` (data highlight)
- **Alternative:** Data-Viz Brutalism (high contrast + grid) for data-heavy posts

The `linkedin-carousel` skill emits image prompts with these palette anchors baked in — slide image generator (GeminiGen) receives consistent style direction across 7-10 slide (strategic sweet spot per RAG 06; 5-8 for short frameworks)s.

### C.8 Open items for Phase 3 (carousel skill) — RESOLVED 2026-04-23 session 2

- [x] PDF generation lib → **TCPDF** (§12.1 D10) — pure PHP, free LGPL, per-page `AddPage()` + `Image()`
- [x] JSON schema for `carousel_slides` → **flat array of slide objects** (§12.1 D12, see §12.2 for full schema + Zod)
- [x] Slide composition strategy → **text baked in GeminiGen prompt** (§12.1 D9) — single API call per slide, zero PHP text rendering
- [x] Human Fingerprint slide image → **reuse `creator_brand_logo`** (§12.1 D11) — ⚠️ FLAGGED, v1.1 re-litigation if engagement drops

---

## Appendix C — Pattern Reuse From Portfolio_v2

Following proven patterns from article-content-writer + Content Engine:

1. **FSM via `HasStatusTransitions`** — strict adjacency map, audit log, `InvalidStateTransitionException` on illegal transitions
2. **`PipelineGuard::advance`** — uniform logging wrapper for orchestrator code
3. **SSH-triggered Claude CLI** with `--append-system-prompt-file` — proven pattern from `ArticleGenerationService`
4. **Progress callbacks** (step, percentage, message) with polling-based UI
5. **Telegram dispatch** via `DispatchTelegramNotification` job + `TelegramNotificationService`
6. **GeminiGen reuse** for image generation (carousel slides) via `ImageGenerationService` + `CoverBrandingEnhancer`
7. **Admin override queue pattern** — mirror `CarouselDraftsList.vue` for `LinkedInDraftsList.vue`
8. **Environment-gated rollout** — feature flags like `ARTICLE_GEN_USE_IMAGES_PHASE` → `LINKEDIN_AUTO_PUBLISH`, `LINKEDIN_GEN_USE_CAROUSEL`

---

## 12. Addendum 2 — Session 2 Decisions (2026-04-23)

Resolves all 4 Phase 3 carousel blockers (Appendix B.C.8) + Open Questions Q2 and Q3 (§9) + Telegram webhook approach (previously TBD).

### 12.1 Decisions

| # | Area | Decision | Trade-off accepted |
|---|---|---|---|
| D9 | Slide composition | **Text baked in AI prompt** (single GeminiGen call renders bg + all copy) | Simpler pipeline, single call per slide. Risks: text-accuracy errors (esp. Indonesian words), font inconsistency across slides, copy edit = full regen. Mitigation: EN-primary copy enforcement, prompt discipline in `linkedin-carousel` SKILL.md |
| D10 | PDF generation library | **TCPDF** (pure PHP, free LGPL) | Per-page `AddPage()` + `Image()`. Text is already baked into PNGs → zero text rendering in PDF layer. Rejected: dompdf (HTML overkill), ImageMagick CLI (brittle exec), FPDI+FPDF (slightly more verbose than TCPDF for this use case) |
| D11 | Human Fingerprint slide image | **Reuse `creator_brand_logo`** (existing settings field) | ⚠️ **FLAGGED** — violates RAG 06 §10 semantic ("candid/personal imagery required for human trust signal"). Accept for v1.0 to ship faster (zero schema change). Re-litigate in v1.1 if Depth Score median <82 across first 20 published carousels |
| D12 | `carousel_slides` JSON shape | **Flat array of slide objects** (1-indexed, ordered) | Each slide: `{slide_number, layout_hint, copy, image_prompt, image_url, is_cover, is_cta, direct_answer_block?}`. `layout_hint` ∈ `{cover, human_fingerprint, body, direct_answer, cta}`. Mudah loop untuk TCPDF, per-slide validator, validator hard-fail check |
| D13 | Link-in-comment automation | **Delayed job + LinkedIn API direct call** (`LinkedInCommentService`) | Post-publish flow: MixPost returns postURN → dispatch `PostLinkedInFirstComment` job with 30s delay → job reads LinkedIn OAuth token dari MixPost DB → POST `/socialActions/{urn}/comments` dengan blog link. Fallback: Telegram alert to admin kalau API call fail. No MixPost Pro upgrade. |
| D14a | Telegram webhook signature | **2-layer: `secret_token` header + HMAC callback_data** | Layer 1: verify `X-Telegram-Bot-Api-Secret-Token` header (reject non-Telegram). Layer 2: `callback_data` format `cancel:{draft_id}:{hmac_sha256(draft_id + HMAC_KEY)}` — prevent tampering + replay. |
| D14b | Cancel button UX | **Two-step confirm** via `editMessageReplyMarkup` | Initial keyboard: `[❌ Cancel Post]`. Tap → edit message replacing keyboard with `[✅ Ya, cancel] [↩️ Batalkan]`. Second tap = actual cancel or revert. Prevents mispress di mobile. |

### 12.2 JSON Schema — `carousel_slides` (final for v1.0)

```json
[
  {
    "slide_number": 1,
    "layout_hint": "cover",
    "copy": "The 60% LinkedIn reach penalty you're triggering right now",
    "image_prompt": "Cinematic portrait 1080x1350, bold dark headline typography over abstract algorithmic network background, LinkedIn-safe margins 75px, no text outside safe zones...",
    "image_url": "https://cdn.alisadikinma.com/linkedin/2026-04/slide-1.png",
    "is_cover": true,
    "is_cta": false
  },
  {
    "slide_number": 4,
    "layout_hint": "human_fingerprint",
    "copy": "I burned $8K on this mistake in Q1 2026",
    "image_prompt": "[composition: creator_brand_logo overlaid on textured paper background, personal quote typography...]",
    "image_url": "https://cdn.alisadikinma.com/linkedin/2026-04/slide-4.png",
    "is_cover": false,
    "is_cta": false
  },
  {
    "slide_number": 6,
    "layout_hint": "direct_answer",
    "copy": "Here's exactly what to do instead...",
    "image_prompt": "...",
    "image_url": "...",
    "is_cover": false,
    "is_cta": false,
    "direct_answer_block": "For B2B AI content on LinkedIn in 2026: post document PDFs (not multi-image), place links in first comment not body, use 3-5 hashtags, aim 24pt minimum body font, 1080×1350 portrait. Expect 3× dwell time vs text posts."
  },
  {
    "slide_number": 10,
    "layout_hint": "cta",
    "copy": "What's YOUR biggest LinkedIn reach mistake? Drop it below 👇",
    "image_prompt": "...",
    "image_url": "...",
    "is_cover": false,
    "is_cta": true
  }
]
```

**Zod schema** (plugin side, `linkedin-carousel` skill output contract):

```ts
const CarouselSlideSchema = z.object({
  slide_number: z.number().int().min(1).max(10),
  layout_hint: z.enum(['cover', 'human_fingerprint', 'body', 'direct_answer', 'cta']),
  copy: z.string().min(1).max(280),
  image_prompt: z.string().min(100),
  image_url: z.string().url().optional(), // Filled after GeminiGen
  is_cover: z.boolean(),
  is_cta: z.boolean(),
  direct_answer_block: z.string().min(30).max(600).optional(), // 30-80 words
});

const CarouselSlidesSchema = z.array(CarouselSlideSchema)
  .min(7).max(10)
  .refine(slides => slides.filter(s => s.is_cover).length === 1, 'Exactly one cover slide required')
  .refine(slides => slides.filter(s => s.is_cta).length === 1, 'Exactly one CTA slide required')
  .refine(slides => slides.some(s => s.direct_answer_block), 'At least one direct_answer_block required for AI search scrape');
```

### 12.3 New Backend Files (supersedes §4.1 additions)

```
app/Services/
├── LinkedInCommentService.php     # D13 — LinkedIn API /socialActions/{urn}/comments wrapper
└── LinkedInPdfCompositionService.php  # D10 — TCPDF stitch service (10 PNG → 1 PDF)

app/Jobs/
├── PostLinkedInFirstComment.php   # D13 — delayed 30s after publish
└── HandleTelegramCancelCallback.php  # D14 — existing, now with 2-step confirm logic
```

### 12.4 New Env Vars (supersedes §4.4 additions)

```env
# Telegram webhook signature (D14a)
TELEGRAM_WEBHOOK_SECRET=<random-32-char>         # passed to setWebhook secret_token param
TELEGRAM_CALLBACK_HMAC_KEY=<random-32-char>      # signs callback_data payload

# LinkedIn API for first-comment automation (D13)
LINKEDIN_FIRST_COMMENT_DELAY_SECONDS=30          # delay before POST comment
LINKEDIN_FIRST_COMMENT_ENABLED=true              # feature flag

# PDF composition (D10)
LINKEDIN_PDF_TEMP_DIR=/tmp/linkedin-pdfs         # where TCPDF writes before S3/disk upload
```

### 12.5 Implementation Phase Additions

Adds to `2026-04-23-plugin-architecture-full-auto-plan.md`:

- **Phase D11b** — `composer require tecnickcom/tcpdf` + `LinkedInPdfCompositionService` (per §12.3) with TDD: fixture 10 PNGs → assert PDF page count = 10, dimensions 1080×1350, file size < 100 MB
- **Phase D12** — `LinkedInCommentService` + `PostLinkedInFirstComment` job with TDD: mock MixPost DB OAuth token retrieval, mock LinkedIn API response, assert 30s delay + Telegram fallback on 4xx/5xx
- **Phase D9 (update)** — webhook endpoint now:
  - Middleware `VerifyTelegramSignature` (checks header + HMAC callback_data)
  - Handler parses `cancel:{id}:{hmac}` format, re-verifies HMAC, transitions FSM
  - First tap: `editMessageReplyMarkup` to show confirm keyboard
  - Second tap (confirm): actual cancel flow
  - Second tap (revert): restore original keyboard with remaining time

### 12.6 Validator (linkedin-validate) Hard-Fail Additions

`refs-linkedin-carousel.md` MUST add these rules (encoded in `linkedin-validate` skill):

- **Text-in-image accuracy check** — validator reads `copy` field vs intended text; flags if `image_prompt` lacks explicit copy spelling (decision D9 = text baked means prompt quality = text quality)
- **Human Fingerprint layout_hint** — if slide has `layout_hint: human_fingerprint`, validator warn (not fail) "logo placeholder — consider upgrading to candid photo in v1.1" (decision D11 flag)
- **Exactly-one invariants** — 1 cover + 1 CTA + ≥1 direct_answer_block (from Zod schema)
- **PDF size budget** — after TCPDF composition, file size MUST be < 100 MB (LinkedIn API limit per RAG 06)

### 12.7 Observability Additions

Post-launch metrics to collect (drives v1.1 re-litigation of D11):

- `linkedin_posts.depth_score` median per format (text vs carousel)
- `linkedin_posts.cancel_rate` within 7-day rolling window
- `linkedin_posts.first_comment_success_rate` (D13 automation)
- `carousel_human_fingerprint_engagement_delta` — compare avg engagement of carousels vs text posts; if delta < 1.5× within first 20 carousels → escalate D11 re-design to v1.1 scope

---
