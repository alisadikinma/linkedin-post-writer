/**
 * schema.ts — Zod contract for linkedin-carousel skill output.
 *
 * This is the SINGLE SOURCE OF TRUTH for the carousel JSON shape. The SKILL.md
 * prompt references this file; tests validate fixtures against it; the
 * production pipeline (backend compositor: GeminiGen / NB2 image rendering +
 * TCPDF assembly — NOT this plugin's concern per Addendum 3) consumes this
 * shape as its input contract.
 *
 * Design sources:
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto.md §12 Addendum 2
 *     (D9 text-baked-in-prompt, D10 TCPDF, D11 Human Fingerprint reuse logo,
 *      D12 carousel_slides flat schema)
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto.md §Appendix B
 *     (C.1-C.7 carousel constraints)
 *   - docs/rag/linkedin-playbook/06-carousel-design.md
 *     (slide count, dead zones, typography, "Build in Public" flow)
 *   - CLAUDE.md §Anti-Slop Enforcement (7 phrases, 5 engagement-bait strings)
 *
 * Scope boundary (Addendum 3):
 *   This schema only describes slide COPY and IMAGE PROMPTS. It does NOT model
 *   PDF composition, GeminiGen renders, upload, scheduling, or publishing —
 *   those live in Portfolio_v2 backend.
 */

import { z } from 'zod';

import { BriefSchema } from '../linkedin-brief/schema.js';
import { BlogSourceSchema } from '../linkedin-convert/schema.js';

/**
 * Layout hint — a machine-readable tag the backend's PDF compositor uses to
 * know which slide template to reach for. Keep this enum tight; expanding it
 * forces backend template updates.
 *
 *   - `cover`             → slide 1, the scroll-stopper hook slide
 *   - `human_fingerprint` → "war story" slide (Addendum 2 D11 — reuses the
 *                            `creator_brand_logo` asset as hero figure until
 *                            v1.1 re-litigates with real candid photography)
 *   - `body`              → standard proof/insight slide
 *   - `direct_answer`     → 30-80 word AI-search-scrapable summary slide
 *                            (RAG 06 §6 Knowledge Graph Integration)
 *   - `cta`               → final slide, comment-prompting question +
 *                            "Blog link in comments" reminder
 */
export const SlideLayoutHintSchema = z.enum([
  'cover',
  'human_fingerprint',
  'body',
  'direct_answer',
  'cta',
]);

export type SlideLayoutHint = z.infer<typeof SlideLayoutHintSchema>;

/**
 * A single carousel slide. Fields:
 *   - slide_number: 1-indexed position (1..total_slides)
 *   - layout_hint: template selector for backend compositor
 *   - copy: the human-readable slide text. Rendered AS PART of the generated
 *          image per Addendum 2 D9 (text baked in AI prompt), so length is
 *          constrained by what fits on a 1080x1350 canvas at 24pt+ body type
 *          with 75px margins and dead zones (top 150px + bottom 200px).
 *          Range: 10-420 chars (5-12 word cover headline through ~50-word
 *          body copy). Longer copy overflows the safe band.
 *   - image_prompt: 300-2500 char cinematic brief for GeminiGen/NB2. Must
 *          include the slide copy verbatim in quotes so the image generator
 *          renders it as typography in-frame (D9 "text baked" rule).
 *   - image_url: filled by backend AFTER GeminiGen render. Absent in this
 *          skill's output; present only on downstream payloads.
 *   - is_cover / is_cta: derived boolean flags; superRefine guards they match
 *          the layout_hint and sit at slide 1 / last slide respectively.
 *   - direct_answer_block: 150-600 chars (~30-80 words). Present ONLY on the
 *          one slide with layout_hint='direct_answer'. Self-contained summary
 *          optimized for AI search scrapers (Perplexity, ChatGPT search).
 */
export const CarouselSlideSchema = z
  .object({
    slide_number: z.number().int().min(1).max(10),
    layout_hint: SlideLayoutHintSchema,
    copy: z.string().min(10).max(420),
    image_prompt: z.string().min(300).max(2500),
    image_url: z.string().url().optional(),
    is_cover: z.boolean(),
    is_cta: z.boolean(),
    direct_answer_block: z.string().min(150).max(600).optional(),
  })
  .superRefine((slide, ctx) => {
    // Internal slide-level invariants
    if (slide.is_cover && slide.layout_hint !== 'cover') {
      ctx.addIssue({
        code: 'custom',
        message: 'is_cover=true requires layout_hint=cover',
        path: ['layout_hint'],
      });
    }
    if (slide.is_cta && slide.layout_hint !== 'cta') {
      ctx.addIssue({
        code: 'custom',
        message: 'is_cta=true requires layout_hint=cta',
        path: ['layout_hint'],
      });
    }
    if (slide.layout_hint === 'direct_answer' && !slide.direct_answer_block) {
      ctx.addIssue({
        code: 'custom',
        message: 'layout_hint=direct_answer requires direct_answer_block field',
        path: ['direct_answer_block'],
      });
    }
    if (slide.direct_answer_block && slide.layout_hint !== 'direct_answer') {
      ctx.addIssue({
        code: 'custom',
        message:
          'direct_answer_block must be absent unless layout_hint=direct_answer',
        path: ['direct_answer_block'],
      });
    }
  });

export type CarouselSlide = z.infer<typeof CarouselSlideSchema>;

/**
 * Input to the skill: a finalized Brief (from linkedin-brief, `format='carousel'`)
 * plus the blog we are converting. The skill prompt asserts the carousel
 * format and a valid hook_framework; we keep this input schema permissive here
 * and let the prompt body enforce routing (same pattern as linkedin-convert).
 */
export const CarouselInputSchema = z.object({
  brief: BriefSchema,
  blog: BlogSourceSchema,
});

export type CarouselInput = z.infer<typeof CarouselInputSchema>;

/**
 * Anti-slop phrase blacklist (Addendum 2 + CLAUDE.md §Anti-Slop Enforcement).
 * Kept in lockstep with linkedin-convert + linkedin-validate — any drift here
 * is a bug, enforced by cross-skill contract tests.
 */
const BANNED_PHRASES = [
  'delve into',
  'unlock the power of',
  "in today's fast-paced digital landscape",
  'at the end of the day',
  'navigating the complexities of',
  'harness the power of',
  'seamlessly integrate',
] as const;

/**
 * Engagement-bait phrase blacklist. LinkedIn demotes transactional-comment
 * CTAs since Oct-2024 (Comment Quality is the 15x weight, not count).
 * Kept in lockstep with linkedin-convert + linkedin-validate.
 */
const ENGAGEMENT_BAIT = [
  'comment yes',
  'type a for',
  'type a/b',
  'drop a 🔥',
  'smash that like button',
] as const;

/**
 * Carousel output — what linkedin-carousel produces for downstream backend
 * compositing (GeminiGen renders per-slide PNGs, then TCPDF assembles the PDF
 * per Addendum 2 D10 — NOT this plugin's concern).
 *
 * Structural invariants (12 superRefine checks):
 *   1. Exactly one `is_cover: true` slide
 *   2. Exactly one `is_cta: true` slide
 *   3. Cover is slide_number 1
 *   4. CTA is the last slide (slide_number === total_slides)
 *   5. total_slides === slides.length
 *   6. At least one `layout_hint: 'human_fingerprint'` slide (Addendum 2 D11)
 *   7. At least one `layout_hint: 'direct_answer'` slide (RAG 06 §6)
 *   8. slide_numbers form a gapless 1..N sequence
 *   9. No banned phrases in any slide `copy` or `direct_answer_block`
 *  10. No engagement bait in any slide `copy` or `direct_answer_block`
 *  11. (Informational — LLM-enforced, not structural) hook_framework matches
 *       cover slide's opener signal
 *  12. No http(s) URLs in slide `copy` or `direct_answer_block` (link-in-comment
 *       discipline: links live only in the first comment of the post)
 */
export const CarouselOutputSchema = z
  .object({
    slides: z.array(CarouselSlideSchema).min(7).max(10),
    total_slides: z.number().int().min(7).max(10),
    hook_framework: z.enum([
      'PAS',
      'AIDA',
      'before_after',
      'loss_aversion',
      'contrarian',
    ]),
    // v1.0 has one structural template. Future additions (framework-only,
    // listicle-dense, etc.) bump this to a wider union — schema test pins the
    // literal today so nobody silently ships a second template.
    structure: z.literal('build_in_public'),
  })
  .superRefine((data, ctx) => {
    // Invariant 1: exactly one cover slide
    const covers = data.slides.filter((s) => s.is_cover);
    if (covers.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `exactly one cover slide required, got ${covers.length}`,
        path: ['slides'],
      });
    }

    // Invariant 2: exactly one CTA slide
    const ctas = data.slides.filter((s) => s.is_cta);
    if (ctas.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `exactly one CTA slide required, got ${ctas.length}`,
        path: ['slides'],
      });
    }

    // Invariant 3: cover is slide 1
    if (covers[0] && covers[0].slide_number !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'cover slide must be slide_number 1',
        path: ['slides'],
      });
    }

    // Invariant 4: CTA is the last slide
    if (ctas[0] && ctas[0].slide_number !== data.total_slides) {
      ctx.addIssue({
        code: 'custom',
        message: `CTA slide must be last slide (slide_number ${data.total_slides})`,
        path: ['slides'],
      });
    }

    // Invariant 5: total_slides matches slides.length
    if (data.total_slides !== data.slides.length) {
      ctx.addIssue({
        code: 'custom',
        message: `total_slides (${data.total_slides}) must equal slides.length (${data.slides.length})`,
        path: ['total_slides'],
      });
    }

    // Invariant 6: at least one Human Fingerprint slide
    const fingerprints = data.slides.filter(
      (s) => s.layout_hint === 'human_fingerprint',
    );
    if (fingerprints.length < 1) {
      ctx.addIssue({
        code: 'custom',
        message:
          'at least one human_fingerprint slide required for authenticity signal',
        path: ['slides'],
      });
    }

    // Invariant 7: at least one direct_answer slide
    const directAnswers = data.slides.filter(
      (s) => s.layout_hint === 'direct_answer',
    );
    if (directAnswers.length < 1) {
      ctx.addIssue({
        code: 'custom',
        message:
          'at least one direct_answer slide required (30-80 word summary for AI search scrapers)',
        path: ['slides'],
      });
    }

    // Invariant 8: slide_numbers form 1..N gapless sequence
    const sorted = [...data.slides].sort(
      (a, b) => a.slide_number - b.slide_number,
    );
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.slide_number !== i + 1) {
        ctx.addIssue({
          code: 'custom',
          message: `slide_numbers must be sequential 1..${data.total_slides}; found gap/duplicate near index ${i}`,
          path: ['slides'],
        });
        break;
      }
    }

    // Invariant 9: anti-slop phrase scan across every slide's copy + direct_answer_block
    for (const slide of data.slides) {
      const haystack = `${slide.copy} ${slide.direct_answer_block ?? ''}`.toLowerCase();
      for (const phrase of BANNED_PHRASES) {
        if (haystack.includes(phrase.toLowerCase())) {
          ctx.addIssue({
            code: 'custom',
            message: `slide ${slide.slide_number} contains banned phrase: "${phrase}"`,
            path: ['slides', slide.slide_number - 1, 'copy'],
          });
        }
      }
    }

    // Invariant 10: engagement-bait scan (lockstep with convert + validate)
    for (const slide of data.slides) {
      const haystack = `${slide.copy} ${slide.direct_answer_block ?? ''}`.toLowerCase();
      for (const bait of ENGAGEMENT_BAIT) {
        if (haystack.includes(bait)) {
          ctx.addIssue({
            code: 'custom',
            message: `slide ${slide.slide_number} contains engagement bait: "${bait}"`,
            path: ['slides', slide.slide_number - 1, 'copy'],
          });
        }
      }
    }

    // Invariant 12 (11 is LLM-enforced): no http(s) URLs in slide text
    // (link-in-comment discipline — links live only in the post's first comment)
    for (const slide of data.slides) {
      const haystack = `${slide.copy} ${slide.direct_answer_block ?? ''}`;
      if (/https?:\/\//i.test(haystack)) {
        ctx.addIssue({
          code: 'custom',
          message: `slide ${slide.slide_number} contains http(s) URL — links go in first comment, not slide copy`,
          path: ['slides', slide.slide_number - 1, 'copy'],
        });
      }
    }
  });

export type CarouselOutput = z.infer<typeof CarouselOutputSchema>;
