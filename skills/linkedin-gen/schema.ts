/**
 * schema.ts — Zod contract for the linkedin-gen orchestrator skill.
 *
 * This is the SINGLE SOURCE OF TRUTH for the end-to-end draft JSON shape the
 * orchestrator emits. Post-v0.5.0 it composes B1 (brief), B2 (convert), and B3
 * (validate) for the TEXT path only. Carousel format short-circuits to a
 * `route_to_carousel_gen` envelope — the universal `/carousel-gen` engine
 * (in `ai-image-carousel-prompt-gen` plugin) is the SOLE author of carousel
 * slides + image prompts. The legacy `/linkedin-carousel` skill was deleted
 * in v0.5.0.
 *
 * Scope boundary (Addendum 3):
 *   - The orchestrator generates content. It does NOT publish, schedule,
 *     notify, or call a backend. The admin panel owns downstream action.
 *   - For carousel format, the orchestrator authors the brief only and
 *     emits `status: 'route_to_carousel_gen'`. The backend dispatches
 *     `/carousel-gen` separately using the brief + blog URL, and assembles
 *     the carousel slides via the CarouselGenOutputAdapter.
 *
 * Design sources:
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto.md §13 Addendum 3
 *   - docs/plans/2026-04-28-linkedin-carousel-engine-decoupling.md §Phase C
 *     (carousel author moved to /carousel-gen, /linkedin-carousel deleted)
 */

import { z } from 'zod';

import { BriefSchema } from '../linkedin-brief/schema.js';
import {
  BlogSourceSchema,
  ConvertOutputSchema,
} from '../linkedin-convert/schema.js';
import { ValidationSchema } from '../linkedin-validate/schema.js';

/**
 * Permissive carousel slot kept on the envelope for backward compatibility
 * — old consumers may still inspect `envelope.carousel` even though v0.5.0
 * orchestrator never produces it. Backend's CarouselGenOutputAdapter
 * authors the real shape from /carousel-gen output downstream.
 */
const CarouselSlotSchema = z.unknown().nullable();

/**
 * Orchestrator input — the admin panel hands us a `blog` shape only. The
 * orchestrator internally invokes `linkedin-brief` to produce the Brief, so
 * the caller does NOT pre-compute it. (This matches the production cron
 * pattern: cron hands the orchestrator a blog URL; orchestrator decides
 * everything else.)
 *
 * For test/fixture-driven operation we accept the blog inline. For production
 * we accept the same shape — the SSH bridge layer is responsible for
 * scraping the blog URL into `{ url, title, content }` before handing it to
 * the orchestrator.
 */
export const OrchestratorInputSchema = z.object({
  blog: BlogSourceSchema,
});

export type OrchestratorInput = z.infer<typeof OrchestratorInputSchema>;

/**
 * Orchestrator status — where the pipeline landed:
 *
 *   complete                  — brief + convert + validate all ran (text path only post-v0.5.0)
 *   route_to_carousel_gen     — brief routed to carousel; orchestrator emits
 *                               brief only and short-circuits. Backend
 *                               dispatches /carousel-gen using the brief +
 *                               blog URL, runs CarouselGenOutputAdapter,
 *                               and assembles the final carousel slides.
 *                               No validation runs in the orchestrator for
 *                               this path — /carousel-gen schema enforces
 *                               structural quality, and Depth Score does
 *                               not apply to image-prompt carousels.
 *   deferred_to_phase_c       — retained as a generic escape hatch for any
 *                               future format that doesn't yet have a
 *                               converter or routing target
 *   failed                    — one of the sub-skill outputs violated its
 *                               schema; see `error` block for the offending
 *                               step
 */
export const OrchestratorStatusSchema = z.enum([
  'complete',
  'route_to_carousel_gen',
  'deferred_to_phase_c',
  'failed',
]);

export type OrchestratorStatus = z.infer<typeof OrchestratorStatusSchema>;

/**
 * Structured error block for `status: 'failed'`. The orchestrator surfaces
 * exactly which sub-skill produced invalid output so the admin panel can
 * route to the right operator action (re-run that one step, adjust the brief,
 * etc.) without parsing free-form strings.
 */
export const OrchestratorErrorSchema = z.object({
  step: z.enum(['brief', 'convert', 'validate']),
  message: z.string().min(10),
  zod_issues: z.array(z.unknown()).optional(),
});

export type OrchestratorError = z.infer<typeof OrchestratorErrorSchema>;

/**
 * Orchestrator output — the single JSON blob the admin panel consumes.
 *
 * Invariants (enforced via superRefine):
 *   1. status='complete' + format='text' ⇒ post non-null AND validation non-null AND carousel null
 *   2. status='route_to_carousel_gen' + format='carousel' ⇒ brief non-null;
 *      post/carousel/validation all null. Backend handles carousel author
 *      via /carousel-gen + adapter from this point.
 *   3. status='deferred_to_phase_c' ⇒ post/carousel/validation all null (escape hatch)
 *   4. status='failed' ⇒ error block present
 *
 * Post-v0.5.0 the orchestrator no longer authors carousels. The carousel
 * slot remains on the envelope as a permissive `unknown` for backward
 * compatibility with old admin panel consumers; backend's
 * CarouselGenOutputAdapter writes the real slides[] downstream.
 */
export const OrchestratorOutputSchema = z
  .object({
    status: OrchestratorStatusSchema,
    format: z.enum(['text', 'carousel']),
    brief: BriefSchema,
    post: ConvertOutputSchema.nullable(),
    carousel: CarouselSlotSchema,
    validation: ValidationSchema.nullable(),
    error: OrchestratorErrorSchema.optional(),
    generated_at: z.string().optional(),
    /**
     * Authoring language of the produced caption. Optional — backend has
     * its own default (English). Emitted by v0.6.0+ orchestrator for
     * telemetry/audit so the admin panel can surface "this draft was
     * authored in EN" without parsing post_text. Carousel format always
     * routes through /carousel-gen which outputs bilingual slides; the
     * accompanying LinkedIn caption (assembled by backend buildCarouselCaption)
     * remains English-only per the May 6 2026 scope decision.
     */
    caption_language: z.enum(['en', 'id']).optional(),
  })
  .superRefine((data, ctx) => {
    // Invariant 1 — complete text path requires post + validation; carousel absent.
    if (data.status === 'complete' && data.format === 'text') {
      if (data.post === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=complete + format=text requires non-null post',
          path: ['post'],
        });
      }
      if (data.validation === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=complete + format=text requires non-null validation',
          path: ['validation'],
        });
      }
      if (data.carousel !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=complete + format=text requires carousel=null',
          path: ['carousel'],
        });
      }
    }

    // Invariant 2 — carousel routing path: brief authored, everything else null.
    // Backend dispatches /carousel-gen from this envelope.
    if (data.status === 'route_to_carousel_gen') {
      if (data.format !== 'carousel') {
        ctx.addIssue({
          code: 'custom',
          message: 'status=route_to_carousel_gen requires format=carousel',
          path: ['format'],
        });
      }
      if (data.post !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=route_to_carousel_gen must have post=null',
          path: ['post'],
        });
      }
      if (data.carousel !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=route_to_carousel_gen must have carousel=null',
          path: ['carousel'],
        });
      }
      if (data.validation !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=route_to_carousel_gen must have validation=null (validation lives in /carousel-gen schema)',
          path: ['validation'],
        });
      }
    }

    // Invariant 3 — deferred_to_phase_c: all output slots null (escape hatch).
    if (data.status === 'deferred_to_phase_c') {
      if (data.post !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=deferred_to_phase_c must have post=null',
          path: ['post'],
        });
      }
      if (data.carousel !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=deferred_to_phase_c must have carousel=null',
          path: ['carousel'],
        });
      }
      if (data.validation !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=deferred_to_phase_c must have validation=null',
          path: ['validation'],
        });
      }
    }

    // Invariant 4 — failed must surface a structured error block.
    if (data.status === 'failed' && !data.error) {
      ctx.addIssue({
        code: 'custom',
        message: 'status=failed requires error block (step + message)',
        path: ['error'],
      });
    }
  });

export type OrchestratorOutput = z.infer<typeof OrchestratorOutputSchema>;
