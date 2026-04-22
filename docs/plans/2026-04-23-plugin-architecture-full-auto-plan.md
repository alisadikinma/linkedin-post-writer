> **For Claude:** REQUIRED SKILL: Use gaspol-execute to implement this plan.
> **CRITICAL:** This plan specifies real integrations. During execution,
> NEVER substitute placeholders for real data sources without explicit
> user approval. If a data source doesn't exist yet, STOP and ask.

# LinkedIn Post Writer — Implementation Plan (Full-Auto)

**Companion to:** [2026-04-23-plugin-architecture-full-auto.md](2026-04-23-plugin-architecture-full-auto.md) (design doc, 696 lines — split due to size)
**Date:** 2026-04-23
**Executor prerequisite:** Read the design doc first. All architecture decisions, FSM, env vars, risk register, carousel constraints live there.

---

## Goal

Ship a Claude Code plugin `linkedin-post-writer` at `D:\Projects\claude-plugin\linkedin-post-writer\` + Portfolio_v2 backend integration that auto-converts every newly published blog post to a LinkedIn-optimized post (text or 7-10 slide carousel), validates against Depth Score ≥80, and auto-publishes via MixPost OSS with a 15-minute Telegram cancel window. Kill-switch env var `LINKEDIN_AUTO_PUBLISH=false` demotes all drafts to manual review queue.

## Architecture Context

**From root [CLAUDE.md](../../../../Portfolio_v2/CLAUDE.md):**

- **Backend:** Laravel 12 + MySQL 8 + Sanctum 4 + Filament 4.1
- **Frontend:** Vue 3.5 + Rolldown-Vite 7.1 + Pinia 3 + TanStack Query 5.90 + Tailwind 4
- **Proven patterns to reuse:**
  - `ArticleGenerationService` (SSH → claude CLI with `--append-system-prompt-file`) — fork for LinkedIn
  - `HasStatusTransitions` trait + `ContentIdeaStatus` enum pattern — replicate for `LinkedInPostStatus`
  - `PipelineGuard::advance` — use for all FSM transitions
  - `ImageGenerationService` + `CoverBrandingEnhancer` — extend for `context='linkedin_carousel'`
  - `DispatchTelegramNotification` job + `TelegramNotificationService` — extend with callback-query handler
  - `CarouselDraftsList.vue` — 50% copy-paste source for `LinkedInDraftsList.vue`
  - Cron pattern from `ProcessPendingImages` / `ProcessScheduledIdeas` — mirror for `ScanBlogForLinkedInConversion`
- **Database conventions:** JSON `state_log` column (rotating 20-entry), `softDeletes`, plural snake_case table names, `{table}_id` FK
- **API response format:** `{success, data, message}` on 2xx; `{success:false, error:{code, message}}` on errors

**From sibling plugin [article-content-writer](../../../../article-content-writer/):**
- File structure: `CLAUDE.md` / `README.md` / `LICENSE` / `skills/*/SKILL.md` / `agents/*.md` / `references/{raw,compiled}/` / `hooks/session-start.sh` / `scripts/{compile-refs,upload-skills}.ts` / `docs/{plans,archive}/`
- Compiled refs convention: `refs-{topic}.md` files injected via `--append-system-prompt-file`
- Uniform Sonnet model per v2.0+

**RAG foundation (all 6 files complete):**
- `docs/rag/linkedin-playbook/01-main-playbook.md` → `refs-linkedin-playbook.md`
- `docs/rag/linkedin-playbook/02-templates-hooks.md` → `refs-linkedin-templates.md`
- `docs/rag/linkedin-playbook/04-media-format-decision.md` → `refs-linkedin-formats.md`
- `docs/rag/linkedin-playbook/05-hashtags-timing-language.md` → merged into `refs-linkedin-playbook.md`
- `docs/rag/linkedin-playbook/06-carousel-design.md` → `refs-linkedin-carousel.md`
- `03-autopost-tools.md` → operator reference (not compiled into refs)

## Tech Stack

**Plugin side (Node-native scripts, markdown skills):**
- TypeScript 5 (for `scripts/compile-refs.ts` + `scripts/upload-skills.ts`)
- `zod` for JSON schema validation in fixtures/tests
- `vitest` for TypeScript unit tests (match article-content-writer)
- `@anthropic-ai/sdk` — only for `upload-skills.ts`

**Backend side (Portfolio_v2):**
- Laravel 12 + PHP 8.2 (via `D:\xampp\php\php.exe`)
- New composer dep: `inovector/mixpost` (OSS LinkedIn scheduler)
- `spatie/laravel-typescript-transformer` — already in use
- PHPUnit via Pest (project pattern)

**Frontend (Portfolio_v2):**
- Vue 3.5 `<script setup>` + TanStack Query composables
- No new dependencies — reuse existing `BaseButton`, `BaseCard`, `BaseModal`, etc.

---

## Data Integration Map

Executor contract — **exists=use as-is; no=build real integration, never stub.**

| Feature | Data Source | Hook/API | Exists? | Action |
|---------|-----------|----------|---------|--------|
| **Plugin skills — all** | Claude CLI via `claude -p "/skill-name"` | `--append-system-prompt-file refs-*.md` | ✅ Pattern in article-content-writer | Fork pattern per skill |
| **Read published blog** | `Post` model + `PostTranslation` | `GET /api/automation/posts/{id}` | ✅ | Reuse — no new endpoint |
| **Trigger plugin from backend** | SSH → claude CLI on VPS | `ArticleGenerationService::ssh` | ✅ | Fork into `LinkedInGenerationService` |
| **Plugin → backend callbacks** | HTTP PUT/POST with Bearer token | `automation` middleware + `personal_access_tokens` | ✅ | New controller + routes |
| **Progress tracking** | `linkedin_posts.state_log` JSON + `retry_count` | `HasStatusTransitions::transitionTo` | ✅ | Reuse trait |
| **FSM enforcement** | `LinkedInPostStatus` enum + `HasStatusTransitions` | Trait methods | ✅ | New enum, reuse trait |
| **Audit logging** | `PipelineGuard::advance` wrapper | Service method | ✅ | Use for all transitions |
| **Cover/slide image gen** | GeminiGen API + `ImageGenerationJob` | `ImageGenerationService::dispatchSegment` | ✅ | Extend with `context='linkedin_carousel'` + `segment_type='slide-N'` |
| **Brand watermark** | `creator_brand` settings group | `CoverBrandingEnhancer::appendWatermark` | ✅ | Reuse as-is |
| **Branded filenames** | `creator_brand_slug` setting | `planned_filename` column pattern | ✅ | Extend: `alisadikinma-{slug}-slide-N.png` |
| **Telegram alerts** | Telegram Bot API | `DispatchTelegramNotification` + `TelegramNotificationService::sendMessage` | ✅ | Reuse + add new event types |
| **Telegram inline cancel button** | Bot callback_query API | `TelegramNotificationService::sendWithInlineKeyboard` + `editMessageReplyMarkup` | ❌ **Must create** | 2-layer auth (secret_token + HMAC callback_data) + 2-step confirm keyboard per ADDENDUM 2 §12.1 D14 |
| **Daily cron trigger** | Laravel Scheduler | `app/Console/Kernel.php::schedule` | ✅ | Register new command |
| **Job queue (delayed publish)** | Laravel queue with `delay()` | `dispatch(...)->delay(now()->addMinutes(15))` | ✅ | Standard Laravel |
| **MixPost LinkedIn post** | MixPost OSS Laravel package | `inovector/mixpost` composer dep | ❌ **Must install** | `composer require inovector/mixpost` + OAuth one-time connect |
| **MixPost PDF carousel upload** | MixPost media + carousel API | `Mixpost\Facades\Mixpost::schedule` | ❌ **Must wrap** | New `LinkedInPublishService` |
| **PDF generation (carousel slides → PDF)** | 7-10 PNG slides → merged PDF | `tecnickcom/tcpdf` → `LinkedInPdfCompositionService` | ❌ **Must install** | TCPDF locked per ADDENDUM 2 §12.1 D10 — pure PHP, free LGPL, per-page AddPage+Image |
| **LinkedIn first-comment automation** | LinkedIn API `/socialActions/{urn}/comments` | `LinkedInCommentService` + `PostLinkedInFirstComment` job | ❌ **Must create** | 30s delayed job per ADDENDUM 2 §12.1 D13, reuses MixPost OAuth token |
| **Admin draft queue UI** | Vue 3 + TanStack Query | New composable `useLinkedInDrafts.js` | ❌ **Must create** | 50% copy from `useCarouselDrafts.js` |
| **Admin draft list view** | Vue 3 SFC | `LinkedInDraftsList.vue` | ❌ **Must create** | 50% copy from `CarouselDraftsList.vue` |
| **Admin draft detail view** | Vue 3 SFC | `LinkedInDraftDetail.vue` | ❌ **Must create** | New, edit + regenerate + publish-now actions |
| **Admin nav menu entry** | `menu_items` table + `MenuItem` model | `PageSectionSeeder` | ✅ | Add row to admin sidebar |
| **Plugin RAG files** | `docs/rag/linkedin-playbook/01-06.md` | Filesystem | ✅ All 6 exist | Input to `compile-refs.ts` |
| **Compiled refs for VPS** | `refs-linkedin-{playbook,templates,formats,carousel}.md` | Upload via `scp` during deploy | ❌ **Must create** | `scripts/compile-refs.ts` outputs locally, CI/CD uploads to `/home/claudesn/` |
| **Feature flag kill-switch** | `LINKEDIN_AUTO_PUBLISH` env var | `config('linkedin.auto_publish')` | ❌ **Must create** | New `config/linkedin.php` |

**Stop-conditions for executor:**
- If `inovector/mixpost` conflicts with existing composer deps → STOP, report conflict, ask for version pin direction
- If MixPost OAuth requires manual browser step (likely) → STOP after install, hand over to Ali for one-time connect, resume after confirmation
- ~~If `setasign/fpdi` license (paid for PDF manipulation) is required~~ — **RESOLVED per ADDENDUM 2 §12.1 D10: TCPDF locked (free, no paid lib)**
- If Telegram callback_query webhook requires new public endpoint + SSL verification → STOP, confirm endpoint URL with Ali before exposing (secrets `TELEGRAM_WEBHOOK_SECRET` + `TELEGRAM_CALLBACK_HMAC_KEY` to be generated during setup)
- If LinkedIn API `/socialActions/{urn}/comments` returns 403 for "post own comment" (unlikely but possible for Personal accounts) → STOP, fallback to Telegram manual-paste flow

---

## Phase Structure Overview

| Phase | Macro Goal | Est. calendar days | Files touched (approx.) |
|-------|-----------|---------------------|-------------------------|
| **A** | Plugin skeleton (CLAUDE.md, refs, scripts, hooks) | 3-4 | ~15 new plugin files |
| **B** | Text-only plugin skills + agent | 3-4 | 5 skills + 1 agent + fixtures |
| **C** | Carousel plugin skill | 3-4 | 1 skill + fixtures + brief extension |
| **D** | Portfolio_v2 backend wiring | 5-7 | ~20 new backend files + 3 frontend |
| **E** | Integration + E2E testing + docs sync | 3-5 | CLAUDE.md (both repos) + test results |

Phases run sequentially. D depends on A+B+C done. E depends on D done. Within each phase, individual steps are sequential (TDD cycle).

**Parallelization note:** Phase C (carousel skill) and early Phase D steps (D1-D5: migration + model + FSM + callback controller + cron scaffold) have **no cross-dependencies** — they can run in parallel via `gaspol-parallel` if executor prefers. See Phase C-D boundary.

---

## Phase A: Plugin Skeleton

**Estimated time:** 3-4 calendar days (40-60 actionable steps)

### Phase A1: Root-level plugin files

**Files:**
- Create: `D:\Projects\claude-plugin\linkedin-post-writer\CLAUDE.md`
- Create: `D:\Projects\claude-plugin\linkedin-post-writer\README.md`
- Create: `D:\Projects\claude-plugin\linkedin-post-writer\LICENSE`
- Modify: `D:\Projects\claude-plugin\linkedin-post-writer\.claude-plugin\plugin.json`

**Steps:**
1. Write failing test: `vitest tests/plugin-structure.test.ts` asserting `CLAUDE.md` exists. **Expected error:** `ENOENT: no such file or directory, open 'D:\Projects\claude-plugin\linkedin-post-writer\CLAUDE.md'`
2. Run test, confirm ENOENT failure
3. Copy `LICENSE` from article-content-writer (MIT, change year to 2026)
4. Write `CLAUDE.md` with plugin-level rules: anti-slop, model routing (Sonnet uniform), RAG foundation pointer, skill map, gotchas (VPS refs location, SSH pattern, callback token)
5. Write `README.md`: install instructions, usage examples (`claude -p "/linkedin-gen <blogUrl>"`), architecture diagram pointing to design doc
6. Update `plugin.json`: bump version to 0.2.0, add `skills` array with 6 entries + `agent` reference (values populated as skills land in later phases — for now placeholder-free structure)
7. Run test, confirm all files exist and `plugin.json` validates against JSON schema
8. Commit: `chore(plugin): scaffold root-level CLAUDE.md, README, LICENSE + plugin.json v0.2.0`

**Verification:**
- [ ] `CLAUDE.md` present with all 8 sections (overview, architecture, skills, gotchas, env vars, callback contract, testing, contributing)
- [ ] `README.md` present with working examples
- [ ] `LICENSE` is valid MIT with correct copyright holder (Ali Sadikin 2026)
- [ ] `plugin.json` validates (JSON syntax + semver)
- [ ] No TODO/placeholder comments in any of the 4 files

### Phase A2: References structure + compile-refs script

**Files:**
- Create: `references/raw/` (directory — symlinks to `docs/rag/linkedin-playbook/*.md`)
- Create: `scripts/compile-refs.ts`
- Create: `tests/compile-refs.test.ts`
- Create: `package.json` (if missing — mirror article-content-writer)
- Create: `tsconfig.json` (if missing — mirror)
- Create: `vitest.config.ts` (if missing — mirror)

**Steps:**
1. Write failing test: `tests/compile-refs.test.ts` — imports `compileRefs` function from `scripts/compile-refs.ts`. **Expected error:** `Cannot find module '../scripts/compile-refs'`
2. Run `npm test`, confirm module-not-found failure
3. Create `package.json` mirroring article-content-writer (`zod`, `vitest`, `tsx`, `@anthropic-ai/sdk` deps)
4. Run `npm install`
5. Create `tsconfig.json` + `vitest.config.ts` mirroring sibling plugin
6. Write failing test detail: test calls `compileRefs({ raw: './docs/rag/linkedin-playbook', out: './references/compiled' })` and asserts 4 files exist: `refs-linkedin-playbook.md`, `refs-linkedin-templates.md`, `refs-linkedin-formats.md`, `refs-linkedin-carousel.md`
7. Run test, confirm all 4 assertions fail (no function, no files)
8. Implement `scripts/compile-refs.ts` — reads raw `*.md`, concatenates per mapping (see design doc Appendix A), writes to `out` dir
   - `refs-linkedin-playbook.md` ← 01-main-playbook + 05-hashtags-timing-language (merged)
   - `refs-linkedin-templates.md` ← 02-templates-hooks
   - `refs-linkedin-formats.md` ← 04-media-format-decision
   - `refs-linkedin-carousel.md` ← 06-carousel-design
9. Run test, confirm all 4 files written + content matches source (deep equal on concatenated markdown)
10. Commit: `feat(plugin): add compile-refs script + test scaffold`

**Verification:**
- [ ] `npm test` passes
- [ ] `references/compiled/refs-linkedin-{playbook,templates,formats,carousel}.md` all exist after running `npx tsx scripts/compile-refs.ts`
- [ ] Each compiled file opens, renders as valid markdown (no broken frontmatter, no dangling links)
- [ ] `tsc --noEmit` passes (via `npm run typecheck`)
- [ ] No TODO/placeholder comments in script
- [ ] Source markdown files NOT modified (compile-refs is read-only on source)

### Phase A3: Hooks + session-start logger

**Files:**
- Create: `hooks/session-start.sh`
- Create: `tests/session-start.test.ts`

**Steps:**
1. Write failing test: test asserts `hooks/session-start.sh` exists AND is executable AND contains `echo` statement with plugin name. **Expected error:** file not found.
2. Run test, confirm failure
3. Copy `session-start.sh` from article-content-writer, swap plugin name to `linkedin-post-writer`
4. Make executable: `chmod +x hooks/session-start.sh` (no-op on Windows but committed as-is)
5. Run test, confirm pass
6. Commit: `feat(plugin): add SessionStart hook logger`

**Verification:**
- [ ] `hooks/session-start.sh` exists
- [ ] Content announces plugin name and available skills on stdout when sourced
- [ ] Matches structure of sibling plugin's hook (diff is only name swap)

### Phase A4: Upload-skills script scaffold (deferred execution)

**Files:**
- Create: `scripts/upload-skills.ts`
- Create: `tests/upload-skills.test.ts`

**Steps:**
1. Write failing test: test imports `uploadSkills` from script, calls with dry-run flag, asserts no network call made. **Expected error:** `Cannot find module`
2. Run test, confirm failure
3. Copy `scripts/upload-skills.ts` from article-content-writer as starting template
4. Swap plugin name + skill list to LinkedIn specifics. Keep all 6 skill references (will land in Phase B+C)
5. Add dry-run mode: if `--dry-run` flag, log what WOULD be uploaded without calling API
6. Run test asserting dry-run outputs 6 skill names to stdout + no network call
7. Commit: `feat(plugin): add upload-skills scaffold (execution deferred to post-Phase-C)`

**Verification:**
- [ ] `npx tsx scripts/upload-skills.ts --dry-run` prints 6 skill names
- [ ] No API call made during dry-run (test mocks `@anthropic-ai/sdk`)
- [ ] Script fails with clear error if any of the 6 SKILL.md files is missing (deferred check — passes in Phase B+C)

---

## Phase B: Text-Only Plugin Skills

**Estimated time:** 3-4 calendar days (~60 steps)

**Context:** Each skill is a markdown file under `skills/{name}/SKILL.md` with frontmatter (name, description, model, triggers). Tests are fixture-based: input markdown → run skill via mock harness → assert output JSON matches Zod schema.

### Phase B1: linkedin-brief skill + fixture harness

**Files:**
- Create: `skills/linkedin-brief/SKILL.md`
- Create: `skills/linkedin-brief/schema.json` (Zod-exportable JSON schema for brief output)
- Create: `tests/fixtures/brief/input-framework-blog.md`
- Create: `tests/fixtures/brief/expected-output.json`
- Create: `tests/skills/linkedin-brief.test.ts`
- Create: `tests/helpers/skill-runner.ts` (first time — fixture-driven skill runner)

**Steps:**
1. Write failing test: `vitest tests/skills/linkedin-brief.test.ts` — loads fixture, calls `runSkill('linkedin-brief', fixture)`, asserts output matches schema. **Expected error:** `Cannot find module '../helpers/skill-runner'`
2. Run test, confirm failure
3. Implement `tests/helpers/skill-runner.ts` — spawns `claude -p "/linkedin-brief"` with fixture input piped, captures JSON output, parses. Set env to use local SKILL.md path via `CLAUDE_PLUGIN_DEV=1`. If local dev not possible, fallback: invoke skill prompt directly with `@anthropic-ai/sdk` + read SKILL.md content manually.
4. Run test, expect new failure: SKILL.md not found
5. Write `skills/linkedin-brief/SKILL.md` with frontmatter (name, description, model: sonnet, triggers: brief, linkedin brief, convert blog) + body following article-brief pattern:
   - Step 1: Read blog post
   - Step 2: Decide format via heuristic (>5 H2 + listicle/tutorial signals → `carousel`; else `text`) — reference design doc Appendix B.1
   - Step 3: Pick hook from 12-formula library (text) OR 5-framework library (carousel) per RAG 02+06
   - Step 4: Identify pillar (AI Generalist / AI Solopreneur / Vibe Coding / AI Agents)
   - Step 5: Pull 1-2 quotable insights
   - Step 6: Output JSON matching schema
6. Write `schema.json`: `{format, hook_framework, hook_id, pillar, pull_quote, angle, title_draft, linkedin_conversion_confidence}`
7. Write fixture: `input-framework-blog.md` — short blog post with 4 H2 (framework shape, should trigger `format=text`)
8. Write expected output: `expected-output.json` — valid brief for the fixture (hand-authored, verifiable)
9. Run test, confirm assertion passes (structural match, not exact — tolerate minor wording variance)
10. Add 2 more fixtures: `input-listicle-blog.md` (8 H2, should → `carousel`) + `input-opinion-blog.md` (2 H2, → `text` with Contrarian hook)
11. Run all 3 fixtures, confirm all pass
12. Commit: `feat(skill): add linkedin-brief with 3 fixture tests`

**Verification:**
- [ ] `skills/linkedin-brief/SKILL.md` + `schema.json` both present
- [ ] 3 fixture tests all pass (`npm test -- linkedin-brief`)
- [ ] Format decision heuristic correctly routes: listicle fixture → carousel, opinion fixture → text, framework fixture → text
- [ ] Output JSON validates against Zod schema
- [ ] No placeholder comments in SKILL.md

### Phase B2: linkedin-convert skill (text post generation)

**Files:**
- Create: `skills/linkedin-convert/SKILL.md`
- Create: `skills/linkedin-convert/schema.json`
- Create: `tests/fixtures/convert/input-brief+blog.json`
- Create: `tests/fixtures/convert/expected-output.json`
- Create: `tests/skills/linkedin-convert.test.ts`

**Steps:**
1. Write failing test: loads fixture (brief + blog content), runs skill, asserts `post_text.length ∈ [1100, 1300]` AND has `link_comment` AND `hashtags.length ∈ [3, 5]`. **Expected error:** `Cannot find skill 'linkedin-convert'`
2. Run test, confirm failure
3. Write `SKILL.md` with body:
   - Load brief + blog content
   - Generate hook per chosen framework
   - Build body: 1-2 sentence paragraphs, 1100-1300 char target
   - Generate first-comment text with blog link
   - Generate 3-5 hashtags (match pillar + broader niche tags)
   - Output JSON matching schema
4. Write schema: `{post_text, link_comment, hashtags[], char_count, paragraph_count, hook_used}`
5. Write fixture input (brief from B1 test + blog content)
6. Write expected output with realistic char count + hashtag count
7. Run test, confirm pass
8. Commit: `feat(skill): add linkedin-convert with fixture test`

**Verification:**
- [ ] SKILL.md + schema present
- [ ] Test asserts char count within 1100-1300 range
- [ ] Test asserts hashtags within 3-5 count
- [ ] Test asserts `link_comment` starts with blog URL
- [ ] `post_text` does NOT contain `https://` (link-in-comment compliance, avoid 60% penalty)

### Phase B3: linkedin-validate skill (Depth Score gate)

**Files:**
- Create: `skills/linkedin-validate/SKILL.md`
- Create: `skills/linkedin-validate/schema.json`
- Create: `tests/fixtures/validate/input-good-post.json` (should score ≥80)
- Create: `tests/fixtures/validate/input-bad-post.json` (should score <80 — contains "delve into", external body link)
- Create: `tests/skills/linkedin-validate.test.ts`

**Steps:**
1. Write failing test: run skill on good fixture → assert `depth_score ≥ 80`; run on bad fixture → assert `depth_score < 80` AND `failures[]` contains `ai_slop_phrase` AND `external_link_in_body`. **Expected error:** skill not found.
2. Run test, confirm failure
3. Write `SKILL.md` — encode full scoring rubric:
   - Hook strength: first 100 chars scored 0-20 (curiosity, specificity)
   - Char count: -15 if outside 1100-1300 for text; -15 if outside slide body constraints for carousel
   - Comment-bait presence: +10 if post ends with a question that prompts 5+ word reply
   - Link compliance: -30 hard fail if `https://` in body (not first comment)
   - Hashtag count: -5 per hashtag over/under 3-5 range
   - Paragraph rhythm: scored for 1-2 sentence paragraphs
   - AI Slop phrases: -20 hard fail per match (list from Appendix B.5)
   - Engagement bait: -20 hard fail ("Comment YES", "Type A for...")
   - Carousel-specific (if format=carousel): Dead Zones check (text within 1080×1350 minus 150px top + 200px bottom), 24pt body min, PDF size limit
4. Write schema: `{depth_score, failures[{rule, severity, deduction}], suggestions[], passed}`
5. Write fixtures: good-post.json (from B2 output) + bad-post.json (hand-crafted anti-patterns)
6. Run test, confirm good passes AND bad fails with correct reasons
7. Commit: `feat(skill): add linkedin-validate with scoring rubric + 2 fixtures`

**Verification:**
- [ ] Good fixture → `depth_score ≥ 80` AND `passed=true`
- [ ] Bad fixture → `depth_score < 80` AND `passed=false` AND `failures[]` lists exactly the expected violations
- [ ] Score computation is deterministic (same input → same score, within ±2 points)
- [ ] All AI Slop phrases from Appendix B.5 trigger detection

### Phase B4: linkedin-schedule skill (backend bridge)

**Files:**
- Create: `skills/linkedin-schedule/SKILL.md`
- Create: `skills/linkedin-schedule/schema.json`
- Create: `tests/fixtures/schedule/input-validated-post.json`
- Create: `tests/fixtures/schedule/expected-api-call.json`
- Create: `tests/skills/linkedin-schedule.test.ts`

**Steps:**
1. Write failing test: runs skill with MSW-mocked backend `/automation/linkedin/{id}/schedule` endpoint, asserts POST body matches `expected-api-call.json`. **Expected error:** skill not found.
2. Run test, confirm failure
3. Write `SKILL.md`: takes `{linkedin_post_id, content, link_comment, hashtags, carousel_slides?}`, POSTs to `{LINKEDIN_GEN_API_URL}/automation/linkedin/{id}/schedule` with Bearer token from env
4. Write schema for request + response shape
5. Write fixtures
6. Run test with MSW (`msw` dep if not in package.json yet — add via `npm i -D msw`)
7. Confirm POST body matches expected
8. Commit: `feat(skill): add linkedin-schedule backend bridge`

**Verification:**
- [ ] Test mocks backend endpoint — no real HTTP
- [ ] POST body contains all required fields from schema
- [ ] Bearer token read from env, not hardcoded

### Phase B5: linkedin-gen orchestrator + agent

**Files:**
- Create: `skills/linkedin-gen/SKILL.md`
- Create: `agents/linkedin-writer.md`
- Create: `tests/skills/linkedin-gen.test.ts`

**Steps:**
1. Write failing test: runs `/linkedin-gen <blog_url>` in pipeline mode, asserts all 4 sub-skills called in order (brief → convert → validate → schedule) AND final status is `awaiting_publish`. **Expected error:** orchestrator not found.
2. Run test, confirm failure
3. Write `SKILL.md` — orchestrator that invokes sub-skills sequentially, handles interactive + pipeline modes, wires progress callbacks
4. Write `agents/linkedin-writer.md` — self-contained subagent for batch production (mirror `article-writer.md`)
5. Run test, confirm orchestration works
6. Commit: `feat(skill): add linkedin-gen orchestrator + linkedin-writer agent`

**Verification:**
- [ ] `/linkedin-gen` in pipeline mode completes full chain: brief → convert → validate → schedule
- [ ] `/linkedin-gen` in interactive mode pauses for user confirmation at format decision + post-validate review
- [ ] Agent mode (`linkedin-writer`) accepts batch input (array of blog URLs) and produces array of drafts
- [ ] Progress callbacks fire at each sub-skill boundary (25%, 50%, 75%, 100%)

### Phase B6: Plugin text-path end-to-end manual test

**Files (read-only):**
- Use: 3 real published blog posts from `alisadikinma.com/blog`

**Steps:**
1. Fetch 3 real blog posts via `curl https://alisadikinma.com/api/posts/{slug}`
2. For each, run `npx tsx scripts/run-skill.ts linkedin-gen <blog>` (new helper — or use Claude CLI directly if local dev path works)
3. Capture output JSON → hand-validate against Depth Score rubric
4. Document outputs in `docs/archive/2026-04-23-text-path-smoke-test.md` — 3 drafts with manual review notes
5. Commit: `test(plugin): manual smoke test on 3 real blog posts — text path`

**Verification:**
- [ ] All 3 blog posts produce valid LinkedIn draft JSON
- [ ] All 3 pass Depth Score ≥80 (if any fail → investigate rubric vs output drift before proceeding)
- [ ] Manual spot-check confirms hook quality, char count, hashtag fit subjectively acceptable
- [ ] Archive doc committed with results

---

## Phase C: Carousel Plugin Skill

**Estimated time:** 3-4 calendar days (~30 steps)

**Dependency:** Phase B complete (brief skill must emit `format=carousel` for appropriate inputs).

### Phase C1: Extend linkedin-brief format heuristic (already TDD'd in Phase B)

Already completed in Phase B1 with listicle fixture. Re-verify after C2.

### Phase C2: linkedin-carousel skill

**Files:**
- Create: `skills/linkedin-carousel/SKILL.md`
- Create: `skills/linkedin-carousel/schema.json`
- Create: `tests/fixtures/carousel/input-listicle-brief.json`
- Create: `tests/fixtures/carousel/expected-output.json`
- Create: `tests/skills/linkedin-carousel.test.ts`

**Steps:**
1. Write failing test: runs skill on listicle brief, asserts output has 7-10 slides AND each slide has `{index, copy, image_prompt, layout_hint, is_cover?, is_cta?}` AND follows "Build in Public" structure (hook → expand → proof → insight → direct-answer → CTA). **Expected error:** skill not found.
2. Run test, confirm failure
3. Write `SKILL.md` — body must encode ALL rules from design doc Appendix B:
   - B.1 slide count (7-10 sweet spot, 5-8 for frameworks, 8-10 for case studies)
   - B.2 typography (Space Grotesk headline, Inter body 24pt+, JetBrains Mono labels)
   - B.3 mobile safe zones (top 150px + bottom 200px — must appear in image_prompt as negative space)
   - B.4 cover hook frameworks (5 options — reference brief output)
   - B.6 structure template (Build in Public flow)
   - B.7 color palette direction (Dark Cinema default, brand token refs)
4. Write schema with per-slide fields including `image_prompt` (GeminiGen-ready 300-500 word cinematic prompt per slide) + `copy` (text shown on slide — baked into image prompt OR overlay)
5. Write fixture: listicle brief → expected 9-slide structure with hook slide + 7 content + CTA slide
6. Run test, confirm structural match (tolerate minor wording variance in image_prompts)
7. Commit: `feat(skill): add linkedin-carousel with Build-in-Public structure + fixture`

**Verification:**
- [ ] Skill output has 7-10 slides (within range)
- [ ] Slide 1 uses one of 5 hook frameworks (PAS/AIDA/Before-After/Loss Aversion/Contrarian)
- [ ] Slide 9 (or N-1) is Direct Answer Block (30-80 words) per Appendix B.6
- [ ] Final slide is CTA with specific 5+ word comment prompt
- [ ] At least one middle slide (3-5) has `is_human_fingerprint=true` flag for candid imagery
- [ ] No AI Slop phrases in any slide copy
- [ ] Each image_prompt is 300-500 words, references brand palette tokens, explicitly mentions dead zone negative space

### Phase C3: Extend linkedin-validate for carousel rules

**Files:**
- Modify: `skills/linkedin-validate/SKILL.md`
- Create: `tests/fixtures/validate/input-good-carousel.json`
- Create: `tests/fixtures/validate/input-bad-carousel.json` (missing CTA, 11 slides, text in dead zone)
- Modify: `tests/skills/linkedin-validate.test.ts`

**Steps:**
1. Write failing test: runs validate on good carousel → `depth_score ≥ 80`; bad carousel → fails with specific violations (`slide_count_exceeded`, `missing_cta`, `text_in_dead_zone`). **Expected error:** validate rules don't cover carousel checks yet.
2. Run test, confirm failure (existing validate skill doesn't handle carousel)
3. Extend `SKILL.md` with carousel-specific rules (already listed in B3 conceptually — now enforce):
   - Slide count ∈ [5, 10] — deduct -10 per slide outside range
   - Dead Zone check (text placement hint) — -15 per slide
   - Body font guidance in image_prompt ≥ 24pt → -15 if absent
   - Direct Answer Block present → -5 if missing
   - Human Fingerprint on at least 1 slide → -10 if missing
   - Final slide CTA with question → -15 if missing
4. Run test, confirm good carousel passes + bad carousel fails with exact 3 violations
5. Commit: `feat(skill): extend linkedin-validate with carousel design rules`

**Verification:**
- [ ] Text posts continue to pass (no regression from B3)
- [ ] Carousel fixtures validate correctly
- [ ] `failures[]` returns human-readable rule names matching design doc Appendix B.5

### Phase C4: Plugin carousel end-to-end smoke test

**Files:**
- Use: 2 real blog posts with >5 H2 sections + listicle structure

**Steps:**
1. Fetch 2 real listicle-shaped blog posts
2. Run `/linkedin-gen <url>` — brief should route to carousel
3. Verify output has 7-10 slides with image_prompts
4. Copy image_prompts to a test GeminiGen run (manual — no backend yet) to sanity-check visual quality
5. Document outputs in `docs/archive/2026-04-23-carousel-path-smoke-test.md`
6. Commit: `test(plugin): manual smoke test on 2 real listicle blogs — carousel path`

**Verification:**
- [ ] Both posts produce 7-10 slide carousel JSON
- [ ] Both pass Depth Score ≥80 with carousel rules applied
- [ ] Manual GeminiGen run on 1-2 image_prompts produces visually cohesive slides (spot check — colors match, typography consistent)
- [ ] Slide count decision matches content length (shorter blog → 7 slides, longer → 10)

---

## Phase D: Portfolio_v2 Backend Wiring

**Estimated time:** 5-7 calendar days (~80 steps)

**Working directory:** `D:\Projects\Portfolio_v2\` (NOT plugin repo). Use `php D:\xampp\php\php.exe artisan ...` for all artisan commands.

### Phase D1: Migration + Enum + FSM trait integration

**Files:**
- Create: `backend/database/migrations/2026_04_23_create_linkedin_posts_table.php`
- Create: `backend/app/Enums/LinkedInPostStatus.php`
- Create: `backend/tests/Feature/LinkedInPostsMigrationTest.php`

**Steps:**
1. Write failing test: `PHPUnit tests/Feature/LinkedInPostsMigrationTest.php` — asserts table has all columns from design doc Section 4.2. **Expected error:** `Base table or view not found: linkedin_posts`
2. Run `php artisan test --filter LinkedInPostsMigrationTest`, confirm fail
3. Create migration with full schema from design doc Section 4.2
4. Run `php artisan migrate`
5. Create `LinkedInPostStatus` enum with 8 cases + `TRANSITIONS` adjacency map (mirror `ContentIdeaStatus`)
6. Run test, confirm all column assertions pass
7. Commit: `feat(linkedin): create linkedin_posts table + LinkedInPostStatus enum`

**Verification:**
- [ ] `php artisan migrate` succeeds
- [ ] All 24 columns from design doc present + correct types
- [ ] Enum has 8 cases AND `TRANSITIONS` map AND `canTransitionTo()` method
- [ ] Illegal transition (e.g., `published → generating`) returns false

### Phase D2: LinkedInPost model + FSM trait

**Files:**
- Create: `backend/app/Models/LinkedInPost.php`
- Create: `backend/tests/Unit/LinkedInPostFsmTest.php`

**Steps:**
1. Write failing test: creates LinkedInPost, calls `transitionTo(Status::Generating, 'test')`, asserts status changed AND `pipeline_state_log` has entry. Then calls illegal transition (`transitionTo(Status::Published)` from draft) and asserts `InvalidStateTransitionException` thrown. **Expected error:** `Class 'App\Models\LinkedInPost' not found`
2. Run test, confirm fail
3. Implement `LinkedInPost` — `HasStatusTransitions` + `SoftDeletes` + casts for `hashtags`, `carousel_slides`, `validation_log`, `state_log` (JSON)
4. BelongsTo `Post` relationship
5. Run test, confirm FSM behaves as enum adjacency allows
6. Commit: `feat(linkedin): add LinkedInPost model with FSM trait`

**Verification:**
- [ ] All legal transitions succeed + append to state_log
- [ ] All illegal transitions throw `InvalidStateTransitionException`
- [ ] `state_log` rotates at 20 entries (oldest evicted)
- [ ] BelongsTo Post relationship resolves correctly

### Phase D3: LinkedInGenerationService (SSH → claude CLI)

**Files:**
- Create: `backend/app/Services/LinkedInGenerationService.php`
- Create: `backend/tests/Unit/LinkedInGenerationServiceTest.php`

**Steps:**
1. Write failing test: mock SSH process, call `$service->generate($draft)`, assert `claude -p "/linkedin-gen {id}" --model sonnet --append-system-prompt-file refs-*.md` command built correctly AND status transitions to `generating`. **Expected error:** class not found.
2. Run test, confirm fail
3. Implement service — fork `ArticleGenerationService` structure
   - `ssh` or `local` driver from env
   - Build command with all 4 `--append-system-prompt-file` refs
   - Async process (fire-and-forget with progress callbacks)
4. Run test, confirm command shape + status transition
5. Commit: `feat(linkedin): add LinkedInGenerationService mirroring ArticleGenerationService`

**Verification:**
- [ ] Command built with 4 ref files
- [ ] SSH driver uses correct user/host/key from env
- [ ] Local driver (for dev) runs `claude` from PATH
- [ ] Status transition to `generating` happens atomically with dispatch
- [ ] Test mocks Symfony Process — no real SSH call in test

### Phase D4: LinkedInCallbackController (8 automation endpoints)

**Files:**
- Create: `backend/app/Http/Controllers/Api/Automation/LinkedInCallbackController.php`
- Create: `backend/routes/api.php` (modify — add 8 routes)
- Create: `backend/tests/Feature/LinkedInCallbackControllerTest.php`

**Steps:**
1. Write failing test: 8 test methods, one per endpoint. Each tests: auth required (401 without Bearer), valid call (200 + state transition), invalid state (422 with InvalidStateTransition message). **Expected error:** 404 routes not found.
2. Run test, confirm all 8 fail with 404
3. Implement controller with 8 methods: `pending`, `show`, `progress`, `saveBrief`, `savePost`, `saveCarousel`, `saveValidation`, `schedule`
4. Register routes in `api.php` under `Route::prefix('automation/linkedin')->middleware('automation')->group(...)`
5. Each method wraps mutation in `DB::transaction` + `PipelineGuard::advance` where status changes
6. Run test, confirm all 8 pass
7. Commit: `feat(linkedin): add LinkedInCallbackController + 8 automation routes`

**Verification:**
- [ ] All 8 endpoints return 200 for valid input
- [ ] All 8 return 401 without Bearer token
- [ ] State-transitioning endpoints (`progress`, `saveBrief`, `savePost`, `saveCarousel`, `saveValidation`, `schedule`) use PipelineGuard
- [ ] `pending` returns oldest `pending_generation` row, locked via `SELECT ... FOR UPDATE`
- [ ] `state_log` updated on every mutation

### Phase D5: ScanBlogForLinkedInConversion command + cron

**Files:**
- Create: `backend/app/Console/Commands/ScanBlogForLinkedInConversion.php`
- Modify: `backend/app/Console/Kernel.php`
- Create: `backend/tests/Feature/ScanBlogForLinkedInConversionTest.php`

**Steps:**
1. Write failing test: seeds 3 published posts (2 new, 1 already has linkedin_posts row), runs command, asserts 2 new `linkedin_posts` rows created + `GenerateLinkedInPost` jobs dispatched to fake queue. **Expected error:** command class not found.
2. Run test, confirm fail
3. Implement command: query posts published in last 24h where `NOT EXISTS (SELECT 1 FROM linkedin_posts WHERE post_id = posts.id)`, create rows in `pending_generation`, dispatch jobs
4. Register schedule in `Kernel.php`: `$schedule->command('linkedin:scan-and-generate')->dailyAt('03:00');`
5. Run test, confirm pass
6. Commit: `feat(linkedin): add daily cron to scan blog posts for LinkedIn conversion`

**Verification:**
- [ ] Command creates rows only for posts missing linkedin_posts entries
- [ ] Command is idempotent (running twice in same day creates no duplicate rows)
- [ ] Schedule registered at 03:00 WIB daily
- [ ] Jobs dispatched async (not inline)

### Phase D6: GenerateLinkedInPost job

**Files:**
- Create: `backend/app/Jobs/GenerateLinkedInPost.php`
- Create: `backend/tests/Feature/GenerateLinkedInPostJobTest.php`

**Steps:**
1. Write failing test: queues job, asserts it calls `LinkedInGenerationService::generate($draft)` AND retries up to 3 times on failure AND terminates with `failed` status after exhaustion. **Expected error:** class not found.
2. Run test, confirm fail
3. Implement job class (queued, 3 retries, timeout 600s for SSH round-trip)
4. Run test, confirm pass
5. Commit: `feat(linkedin): add GenerateLinkedInPost queued job with retry`

**Verification:**
- [ ] Job retries 3x on exception
- [ ] Failure after retries → status = `failed` + Telegram alert
- [ ] Timeout doesn't cause status drift (FSM-safe)

### Phase D7: MixPost install + OAuth + LinkedInPublishService

**Files (install step MUST pause for user):**
- Modify: `backend/composer.json` (add `inovector/mixpost`)
- Create: `backend/config/linkedin.php`
- Create: `backend/app/Services/LinkedInPublishService.php`
- Create: `backend/tests/Unit/LinkedInPublishServiceTest.php`

**Steps:**
1. **STOP point:** announce to user: "About to `composer require inovector/mixpost`. This installs a new dep + requires one-time LinkedIn OAuth via MixPost admin UI. Confirm proceed?"
2. On user approval: `composer require inovector/mixpost` (from backend/)
3. Run MixPost install migrations: `php artisan mixpost:install` (if the package ships one — read MixPost docs if unclear)
4. **STOP point #2:** announce: "MixPost installed. Ali needs to connect LinkedIn account via MixPost admin UI (one-time OAuth). Route: (check MixPost docs). Confirm when connected + provide `MIXPOST_LINKEDIN_ACCOUNT_ID`."
5. On user confirmation: create `config/linkedin.php` with all env vars from design doc Section 4.4
6. Write failing test: `LinkedInPublishServiceTest` mocks MixPost facade, asserts `publish($draft)` calls `Mixpost::schedule` with correct account + content + PDF (if carousel). **Expected error:** class not found.
7. Run test, confirm fail
8. Implement service
9. Run test, confirm pass
10. Commit: `feat(linkedin): install MixPost + LinkedInPublishService wrapper`

**Verification:**
- [ ] Composer install succeeded (no conflicts)
- [ ] MixPost admin UI accessible + LinkedIn account connected
- [ ] `config/linkedin.php` reads all env vars correctly
- [ ] Service calls MixPost facade (mocked in test)
- [ ] Text-only publish path works (no PDF)
- [ ] Carousel PDF path flagged for Phase D8 (PDF generation TBD)

### Phase D8: DispatchLinkedInPublish job (15-min delayed)

**Files:**
- Create: `backend/app/Jobs/DispatchLinkedInPublish.php`
- Create: `backend/tests/Feature/DispatchLinkedInPublishJobTest.php`

**Steps:**
1. Write failing test: dispatches job with `delay(now()->addMinutes(15))`, fast-forwards time, asserts:
   - If status still `awaiting_publish` AND kill-switch ON → calls publish service
   - If status = `cancelled` → no-op
   - If kill-switch OFF → transitions to `manual_review` + Telegram alert
2. Run test, confirm fail
3. Implement job with status + kill-switch checks at run time
4. Run test, confirm all 3 branches behave correctly
5. Commit: `feat(linkedin): add delayed publish dispatch with kill-switch + cancel check`

**Verification:**
- [ ] Happy path: awaiting_publish + kill-switch ON → published
- [ ] Cancel path: cancelled → no-op, no LinkedIn call
- [ ] Kill-switch path: awaiting_publish + kill-switch OFF → manual_review + alert
- [ ] Job is idempotent (running twice doesn't double-publish)

### Phase D9: Telegram preview + cancel callback (2-layer sig + 2-step confirm per ADDENDUM 2 §12.1 D14a/D14b)

**Files:**
- Modify: `backend/app/Services/TelegramNotificationService.php` (add `sendWithInlineKeyboard`, `editMessageReplyMarkup`)
- Create: `backend/app/Http/Controllers/Api/Telegram/TelegramCallbackController.php`
- Create: `backend/app/Http/Middleware/VerifyTelegramSignature.php`
- Create: `backend/app/Jobs/HandleTelegramCancelCallback.php`
- Modify: `backend/routes/api.php` (add webhook route with middleware)
- Create: `backend/tests/Feature/TelegramCancelFlowTest.php`
- Create: `backend/tests/Unit/VerifyTelegramSignatureTest.php`

**Steps:**
1. Write failing test: `VerifyTelegramSignatureTest` — POST with missing `X-Telegram-Bot-Api-Secret-Token` → 401; POST with correct header but tampered `callback_data` HMAC → 401; valid request → pass. **Expected error:** middleware not implemented.
2. Implement `VerifyTelegramSignature` middleware:
   - Layer 1: compare `X-Telegram-Bot-Api-Secret-Token` header with `config('linkedin.telegram_webhook_secret')` (timing-safe)
   - Layer 2: parse `callback_data` as `cancel:{id}:{hmac}`, recompute `hash_hmac('sha256', $id, config('linkedin.telegram_callback_hmac_key'))`, timing-safe compare
3. Write failing test: `TelegramCancelFlowTest` — full cancel round-trip:
   - POST `callback_data=cancel:123:{valid_hmac}` → message edited to show `[✅ Ya, cancel] [↩️ Batalkan]` keyboard, FSM unchanged
   - POST `callback_data=confirm_cancel:123:{valid_hmac}` → FSM transitions `awaiting_publish → cancelled`, Telegram message updated to "✅ Cancelled"
   - POST `callback_data=revert_cancel:123:{valid_hmac}` → restore original `[❌ Cancel Post]` keyboard, FSM unchanged
4. Run test, confirm fail
5. Implement `TelegramNotificationService::sendWithInlineKeyboard` — accepts `reply_markup.inline_keyboard[[{text, callback_data}]]`
6. Implement `TelegramNotificationService::editMessageReplyMarkup` — accepts `chat_id, message_id, new_reply_markup`
7. Implement `TelegramCallbackController@handle`:
   - Parse `callback_data` prefix (`cancel` | `confirm_cancel` | `revert_cancel`)
   - On `cancel`: call `editMessageReplyMarkup` with confirm keyboard
   - On `confirm_cancel`: dispatch `HandleTelegramCancelCallback` + edit message to success state
   - On `revert_cancel`: restore original keyboard (re-compute remaining cancel window minutes)
8. Implement `HandleTelegramCancelCallback` — atomic `transitionTo(Cancelled)` only if current status is `awaiting_publish`
9. Register webhook route: `POST /api/telegram/callback` with `VerifyTelegramSignature` middleware
10. Build HMAC helper for generating `callback_data` — used by `sendWithInlineKeyboard` caller to embed HMAC: `"cancel:{$id}:" . hash_hmac('sha256', $id, $key)`
11. Run test, confirm 3 flows (cancel→confirm, cancel→revert, direct confirm without cancel rejected) all pass
12. Extend `DispatchTelegramNotification` job with new event types: `linkedin_preview` (with 2-step keyboard), `linkedin_depth_failed`, `linkedin_published`, `linkedin_cancelled`
13. Document operational setup in plugin README: how to generate `TELEGRAM_WEBHOOK_SECRET`, how to call Telegram `setWebhook` with `secret_token` param
14. Commit: `feat(linkedin): add Telegram webhook with 2-layer auth (secret_token + HMAC callback_data) + 2-step cancel confirm flow`

**Verification:**
- [ ] Layer 1 (secret_token header) rejects missing/wrong header with 401
- [ ] Layer 2 (HMAC callback_data) rejects tampered draft_id with 401
- [ ] Valid `cancel:{id}:{hmac}` tap edits message to confirm keyboard, FSM unchanged
- [ ] Valid `confirm_cancel:{id}:{hmac}` tap transitions `awaiting_publish → cancelled`
- [ ] Valid `revert_cancel:{id}:{hmac}` tap restores original keyboard with updated remaining minutes
- [ ] Cancel after 15-min window elapsed → FSM already past `awaiting_publish` → transition no-ops gracefully
- [ ] All new notification event types dispatch correctly

### Phase D10: ImageGenerationService — linkedin_carousel context

**Files:**
- Modify: `backend/app/Services/ImageGenerationService.php` (add carousel context handling)
- Modify: `backend/app/Services/CoverBrandingEnhancer.php` (extend for slide segments)
- Create: `backend/tests/Unit/LinkedInCarouselImageGenTest.php`

**Steps:**
1. Write failing test: dispatch image gen job with `context='linkedin_carousel'` + `segment_type='slide-3'`, assert:
   - `planned_filename` = `alisadikinma-{slug}-slide-3.png`
   - Watermark enhancer called (if settings ON)
   - GeminiGen prompt includes brand palette tokens
2. Run test, confirm fail
3. Extend `ImageGenerationService::dispatchSegment` with new `segment_type` handling for slide-N
4. Extend `CoverBrandingEnhancer::enhance` to skip creator face auto-inject for carousel slides (unless Human Fingerprint flag set)
5. Run test, confirm filename + watermark + palette correctly applied
6. Commit: `feat(linkedin): extend ImageGenerationService for carousel slide context`

**Verification:**
- [ ] Filename pattern `alisadikinma-{slug}-slide-N.png` generated correctly for slides 1-10
- [ ] Watermark applied per `creator_brand.watermark_enabled` setting
- [ ] Human Fingerprint flag correctly prepends creator face only on flagged slides
- [ ] Non-carousel (cover, inline) contexts unaffected (no regression)

### Phase D11: PDF carousel generation (TCPDF — locked per ADDENDUM 2 §12.1 D10)

**Files:**
- Create: `backend/app/Services/LinkedInPdfCompositionService.php`
- Create: `backend/tests/Unit/LinkedInPdfCompositionServiceTest.php`
- Modify: `backend/composer.json` (add `tecnickcom/tcpdf: ^6.6`)

**Steps:**
1. Install TCPDF: `composer require tecnickcom/tcpdf`
2. Write failing test: `LinkedInPdfCompositionServiceTest`:
   - Fixture: 10 PNGs at 1080×1350 in `tests/fixtures/linkedin-slides/`
   - Call `compose($slideImagePaths, $outputPath)`
   - Assert output file exists
   - Assert page count = 10 (via `spatie/pdf-to-image` or TCPDF internal check)
   - Assert file size < 100 MB
   - Assert first page dimensions 1080×1350 in points (72 DPI → 1080pt × 1350pt)
3. Run test, confirm fail
4. Implement `LinkedInPdfCompositionService`:
   - Constructor sets `LINKEDIN_PDF_TEMP_DIR` from config
   - `compose(array $slideImagePaths, string $outputPath): string`:
     - Validate all paths exist + are PNG
     - Instantiate TCPDF with portrait orientation, custom page size `[1080, 1350]` in points
     - Disable auto-page-break, set zero margins
     - Loop: `$pdf->AddPage()`, `$pdf->Image($path, 0, 0, 1080, 1350, 'PNG')`
     - `$pdf->Output($outputPath, 'F')`
     - Return `$outputPath`
5. Run test, confirm pass
6. Commit: `feat(linkedin): add LinkedInPdfCompositionService (TCPDF) for carousel slide stitching`

**Verification:**
- [ ] Output PDF has exactly 10 pages when given 10 slide PNGs
- [ ] Each page is 1080×1350 points (matches LinkedIn document post spec)
- [ ] File size < 100 MB (LinkedIn API limit per RAG 06 §10)
- [ ] PDF opens correctly in LinkedIn preview (manual spot check in Phase E1 smoke test)
- [ ] Graceful failure when slide path missing (throws typed exception, doesn't corrupt partial file)

### Phase D11b: LinkedInCommentService + PostLinkedInFirstComment job (NEW per ADDENDUM 2 §12.1 D13)

**Files:**
- Create: `backend/app/Services/LinkedInCommentService.php`
- Create: `backend/app/Jobs/PostLinkedInFirstComment.php`
- Create: `backend/tests/Unit/LinkedInCommentServiceTest.php`
- Create: `backend/tests/Feature/PostLinkedInFirstCommentJobTest.php`
- Modify: `backend/app/Services/LinkedInPublishService.php` (dispatch comment job after publish success)

**Steps:**
1. Write failing test: `LinkedInCommentServiceTest`:
   - Mock LinkedIn OAuth token retrieval from MixPost DB
   - Mock HTTP client for `POST https://api.linkedin.com/v2/socialActions/{urn}/comments`
   - Call `postFirstComment($postURN, $commentText)`
   - Assert correct auth header (`Bearer {token}`), correct body schema, correct URN
   - Assert 201 → returns commentURN
   - Assert 4xx → throws `LinkedInCommentFailedException`
2. Write failing test: `PostLinkedInFirstCommentJobTest`:
   - Dispatch job with `linkedInPostId=1, postURN="urn:li:share:123"`
   - Assert service `postFirstComment` called with correct args
   - Assert success updates `linkedin_posts.first_comment_status = 'posted'`
   - Assert failure dispatches Telegram alert + updates status to `'failed'`
3. Run tests, confirm fail
4. Implement `LinkedInCommentService`:
   - Constructor injects HTTP client + MixPost OAuth token repository
   - `postFirstComment(string $postURN, string $commentText): string` — returns commentURN
   - Use LinkedIn API v2 endpoint `/socialActions/{urn-encoded}/comments`
   - Body: `{"actor": "urn:li:person:{id}", "object": "{postURN}", "message": {"text": "{commentText}"}}`
5. Implement `PostLinkedInFirstComment` job:
   - `__construct(int $linkedInPostId)` — holds ID only, fetches model in `handle()`
   - Reads `post.link_comment` field (already populated by `linkedin-schedule` skill)
   - Calls `LinkedInCommentService::postFirstComment`
   - On success: update `first_comment_status = 'posted'`, log commentURN
   - On failure: update `first_comment_status = 'failed'`, dispatch Telegram alert to admin ("⚠️ First comment failed, paste manually: {commentText}"), don't retry (manual fallback)
6. Modify `LinkedInPublishService::publish`:
   - After MixPost publish returns successfully with postURN:
   - `if (config('linkedin.first_comment_enabled'))`:
     - `dispatch((new PostLinkedInFirstComment($linkedInPost->id))->delay(config('linkedin.first_comment_delay_seconds')))`
7. Add migration patch: `linkedin_posts.first_comment_status` (enum: `pending, posted, failed, skipped`), `linkedin_posts.first_comment_urn` (nullable string)
8. Run all tests, confirm pass
9. Commit: `feat(linkedin): add LinkedInCommentService + delayed first-comment automation via LinkedIn API`

**Verification:**
- [ ] Job dispatches 30s after MixPost publish (not immediately)
- [ ] Successful API response stores `first_comment_urn` + sets status `posted`
- [ ] 401/403 responses (invalid token) → Telegram fallback with copy-paste instructions
- [ ] 429 rate limit → job fails but no retry (manual paste instruction to admin)
- [ ] Feature flag `LINKEDIN_FIRST_COMMENT_ENABLED=false` skips dispatch entirely
- [ ] MixPost OAuth token retrieval works without expired-token edge case (caught + Telegram alert)

### Phase D12: LinkedInDraftController (admin 7 endpoints)

**Files:**
- Create: `backend/app/Http/Controllers/Api/Admin/LinkedInDraftController.php`
- Modify: `backend/routes/api.php`
- Create: `backend/tests/Feature/Admin/LinkedInDraftControllerTest.php`

**Steps:**
1. Write failing test: 7 test methods per endpoint. **Expected error:** 404.
2. Run test, confirm fail
3. Implement controller: `index`, `show`, `update`, `regenerate`, `approve`, `cancel`, `publishNow`
4. Register routes under `Route::prefix('admin/linkedin-drafts')->middleware('auth:sanctum')`
5. Each mutating endpoint uses `PipelineGuard::advance`
6. Run test, confirm pass
7. Commit: `feat(linkedin): add admin draft controller (list, edit, regenerate, approve, cancel, publish-now)`

**Verification:**
- [ ] All 7 endpoints return 200 for valid auth
- [ ] All 7 return 401 unauthenticated
- [ ] Status-transitioning actions use PipelineGuard
- [ ] `update` endpoint allows editing content + hashtags + link_comment (not status directly)

### Phase D13: Frontend admin UI

**Files:**
- Create: `frontend/src/composables/useLinkedInDrafts.js`
- Create: `frontend/src/views/admin/LinkedInDraftsList.vue`
- Create: `frontend/src/views/admin/LinkedInDraftDetail.vue`
- Modify: `frontend/src/router/index.js` (add routes)
- Modify: admin sidebar component (add menu entry)

**Steps:**
1. Write failing test: `useLinkedInDrafts.test.js` asserts composable exports `useList`, `useOne`, `useUpdate`, `useApprove`, `useCancel`, `usePublishNow`, `useRegenerate` mutations. **Expected error:** module not found.
2. Run test, confirm fail
3. Implement composable — copy 80% from `useCarouselDrafts.js`, adapt endpoints
4. Implement `LinkedInDraftsList.vue` — 50% copy from `CarouselDraftsList.vue`, adapt columns (status, depth_score, scheduled_at, post title)
5. Implement `LinkedInDraftDetail.vue` — editable content + hashtag chips + carousel slide thumbnails + action buttons (approve/cancel/publish-now/regenerate)
6. Register routes + add sidebar menu entry
7. Manual test: navigate to `/admin/linkedin-drafts`, render mock drafts, interact with actions
8. Commit: `feat(linkedin): add admin draft queue UI (list + detail + composable)`

**Verification:**
- [ ] `/admin/linkedin-drafts` renders list with status badges + depth_score column
- [ ] Clicking draft opens detail view with all fields editable
- [ ] Action buttons wire to correct endpoints
- [ ] Carousel slides render as thumbnail grid (7-10 images)
- [ ] TanStack Query staleTime matches project convention (30s for operator-edited views)

---

## Phase E: Integration + E2E Testing + Docs Sync

**Estimated time:** 3-5 calendar days (~20 steps)

### Phase E1: E2E happy path

**Steps:**
1. Publish a test blog post on Portfolio_v2 (use draft/unpublished flow to avoid public noise)
2. Manually trigger `php artisan linkedin:scan-and-generate` (skip waiting for 03:00 cron)
3. Watch logs: generation job fires → SSH claude CLI runs → callbacks update state
4. Wait for validate step → Telegram preview alert received
5. Wait 15 minutes → verify publish happens
6. Open LinkedIn → confirm post appears correctly (text + carousel PDF if applicable)
7. Commit: `test(linkedin): E2E happy path smoke test — 1 real blog post`

**Verification:**
- [ ] Full chain completes: generation → validation → telegram preview → 15min delay → publish
- [ ] Final LinkedIn post matches preview
- [ ] `linkedin_posts.published_at` set correctly
- [ ] `linkedin_post_url` populated
- [ ] No stuck states

### Phase E2: Cancel path E2E

**Steps:**
1. Trigger another draft (different blog post)
2. Wait for Telegram preview
3. Click cancel button in Telegram
4. Verify callback received → status = `cancelled`
5. Wait past 15-min mark → verify no publish occurred
6. Commit: `test(linkedin): E2E cancel path smoke test`

**Verification:**
- [ ] Cancel button click correctly transitions to cancelled
- [ ] No LinkedIn post created
- [ ] Telegram reply confirms cancellation

### Phase E3: Kill-switch E2E

**Steps:**
1. Trigger draft
2. Wait for awaiting_publish state
3. Flip `LINKEDIN_AUTO_PUBLISH=false` in .env + `php artisan config:cache`
4. Wait past 15-min mark
5. Verify status → `manual_review` + Telegram alert fired + no LinkedIn post
6. Flip back to true + restart queue → confirm draft stays in `manual_review` (no resurrection)
7. Commit: `test(linkedin): E2E kill-switch smoke test`

**Verification:**
- [ ] Kill-switch correctly demotes to manual_review
- [ ] Alert fired
- [ ] No LinkedIn post created
- [ ] Flipping switch back does NOT auto-resume paused drafts (manual admin action required)

### Phase E4: Depth Score fail path E2E

**Steps:**
1. Hand-craft a deliberately bad blog post (short, generic, no structure)
2. Trigger conversion
3. Validate step should score <80
4. Verify: status → `manual_review`, no Telegram preview sent, admin alert sent instead
5. Open `/admin/linkedin-drafts`, verify draft appears in manual_review tab
6. Edit + approve via UI → verify publish path resumes
7. Commit: `test(linkedin): E2E Depth Score fail + manual recovery smoke test`

**Verification:**
- [ ] Low-quality blog → score <80 → manual_review
- [ ] Admin alert received (not preview)
- [ ] Admin UI allows edit + approve
- [ ] Approve → re-enters awaiting_publish with new 15-min window

### Phase E5: CLAUDE.md sync (both repos)

**Files:**
- Modify: `D:\Projects\Portfolio_v2\CLAUDE.md`
- Modify: `D:\Projects\claude-plugin\linkedin-post-writer\CLAUDE.md`

**Steps:**
1. Update Portfolio_v2 root CLAUDE.md with:
   - New table `linkedin_posts` in DB schema section
   - New env vars under new "LinkedIn Pipeline" section
   - New routes in API routes section
   - New composer dep `inovector/mixpost`
   - New admin page `/admin/linkedin-drafts`
   - Update "Last Updated" date
2. Update plugin CLAUDE.md with:
   - Skill list finalized (6 skills + 1 agent)
   - RAG file list (all 6 complete)
   - Feature flags status (v1.0 shipped)
3. Commit (Portfolio_v2): `docs(claude-md): sync CLAUDE.md with LinkedIn pipeline changes`
4. Commit (plugin): `docs(claude-md): sync plugin CLAUDE.md with v1.0 completion`

**Verification:**
- [ ] Both CLAUDE.md files reflect actual shipped state
- [ ] All new env vars documented
- [ ] Pipeline flow section updated with LinkedIn branch

### Phase E6: Managed Agents upload (OPTIONAL — defer if not ready)

**Steps:**
1. Run `npx tsx scripts/upload-skills.ts --dry-run` — verify 6 skills detected
2. User confirms upload desired → run without `--dry-run`
3. Verify skills appear in Managed Agents console
4. Commit: `chore(plugin): upload 6 skills to Managed Agents`

**Verification:**
- [ ] All 6 skills uploaded successfully
- [ ] LinkedIn agent can invoke all skills
- [ ] Skill versions match local files

---

## Success Criteria (v1.0 ship gate)

From design doc Section 10. All must pass before declaring v1.0 shipped:

- [ ] Throughput: ≥80% of blogs published in last 7 days have matching linkedin_posts row
- [ ] Quality gate pass rate: ≥70% pass depth_score ≥80 on first try
- [ ] Cancel rate: <10% across first 20 auto-publishes
- [ ] Time-to-publish: happy path ≤24h from blog publish
- [ ] No stuck states in production for >6h
- [ ] Kill-switch verified operational
- [ ] CLAUDE.md in both repos up to date

---

## Execution Handoff

**Option 1 — Execute in this session (sequential):**
> Ready to start Phase A? I'll use `gaspol-execute` with per-phase checkpoints. Phase A1 first (CLAUDE.md + README + LICENSE + plugin.json).

**Option 2 — Parallel execution (post-Phase-A):**
> After Phase A completes, Phase B skills (B1-B5) can parallelize — 5 independent fixture-driven tasks. Use `gaspol-parallel` mode `plan-phases` to dispatch 5 subagents. Merge back for B6 smoke test.
> Phase C (carousel) + early Phase D (D1-D5: migration + model + controller + cron) can also parallelize — different repos, zero file overlap.

**Option 3 — Separate session:**
> This plan is self-contained. Start fresh session with: "Read `D:\Projects\claude-plugin\linkedin-post-writer\docs\plans\2026-04-23-plugin-architecture-full-auto-plan.md` + design doc. Execute via `/gaspol-execute`."

**Recommended: Option 2 with staged parallelization** — fastest wall-clock time (~2.5 weeks vs ~3 weeks sequential) without sacrificing verification gates.

---

## Open Decisions (resolved during execution, not blockers)

From design doc Section 9 — status updated per ADDENDUM 2 (2026-04-23 session 2):

1. ~~**MixPost edition**~~ ✅ Locked: **OSS** (design decision #6) — confirm install at Phase D7 STOP point only
2. ~~**PDF generation library** (TBD)~~ ✅ Resolved: **TCPDF** locked per ADDENDUM 2 §12.1 D10 — no STOP point needed (was Phase D11)
3. ~~**Link-in-comment automation**~~ ✅ Resolved: **delayed job + LinkedIn API direct** per ADDENDUM 2 §12.1 D13 — implemented in new Phase D11b
4. **Blog velocity baseline** 🟡 Open — observational, measure post-launch
5. ~~**Human Fingerprint image asset**~~ ✅ Resolved with flag: **reuse `creator_brand_logo`** per ADDENDUM 2 §12.1 D11 — v1.1 re-litigation gate if Depth Score median < 82

**Remaining STOP points during execution:**
- Phase D7: `composer require inovector/mixpost` dep conflict (if any)
- Phase D7 step 4: MixPost admin UI manual OAuth → user provides `MIXPOST_LINKEDIN_ACCOUNT_ID`
- Phase D9: Telegram webhook public endpoint URL confirm + `TELEGRAM_WEBHOOK_SECRET` / `TELEGRAM_CALLBACK_HMAC_KEY` generation
- Phase D11b: LinkedIn API `/socialActions/{urn}/comments` 403 edge case (unlikely) → fallback to Telegram manual-paste flow
