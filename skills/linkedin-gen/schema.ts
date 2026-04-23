/**
 * schema.ts — Zod contract for the linkedin-gen orchestrator skill.
 *
 * This is the SINGLE SOURCE OF TRUTH for the end-to-end draft JSON shape the
 * orchestrator emits. It composes the B1 (brief), B2 (convert), and B3
 * (validate) contracts into a single blob the admin panel consumes.
 *
 * Scope boundary (Addendum 3):
 *   - The orchestrator generates content. It does NOT publish, schedule,
 *     notify, or call a backend. The admin panel owns downstream action.
 *   - Phase C (linkedin-carousel, C2) is not yet built. When the brief routes
 *     to `carousel`, the orchestrator emits `status: 'deferred_to_phase_c'`
 *     and skips the convert + validate steps entirely. The `carousel` slot is
 *     always `null` in this B5 contract; C2 replaces the slot with a real
 *     carousel output schema.
 *
 * Design sources:
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto.md §13 Addendum 3
 *     (plugin scope boundary — content generation only)
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto-plan.md §Phase B5
 *     (orchestrator contract + FSM for status transitions)
 *   - CLAUDE.md §Pipeline Flow (conceptual pipeline — scope-reduced here)
 */

import { z } from 'zod';

import { BriefSchema } from '../linkedin-brief/schema.js';
import {
  BlogSourceSchema,
  ConvertOutputSchema,
} from '../linkedin-convert/schema.js';
import { ValidationSchema } from '../linkedin-validate/schema.js';

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
 *   complete              — brief + convert + validate all ran (text path)
 *   deferred_to_phase_c   — brief routed to carousel; downstream steps skipped
 *                           until Phase C2 ships
 *   failed                — one of the sub-skill outputs violated its schema;
 *                           see `error` block for the offending step
 */
export const OrchestratorStatusSchema = z.enum([
  'complete',
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
 *   1. status='complete' + format='text' ⇒ post non-null AND validation non-null
 *   2. status='deferred_to_phase_c' ⇒ format='carousel' AND post=null
 *   3. status='failed' ⇒ error block present
 *
 * The `carousel` slot is always `null` in B5 — Phase C2 replaces the schema
 * field with a discriminated-union CarouselOutputSchema when it lands.
 */
export const OrchestratorOutputSchema = z
  .object({
    status: OrchestratorStatusSchema,
    format: z.enum(['text', 'carousel']),
    brief: BriefSchema,
    post: ConvertOutputSchema.nullable(),
    carousel: z.null(),
    validation: ValidationSchema.nullable(),
    error: OrchestratorErrorSchema.optional(),
    generated_at: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Invariant 1 — complete text path requires both post + validation.
    if (data.status === 'complete' && data.format === 'text') {
      if (data.post === null) {
        ctx.addIssue({
          code: 'custom',
          message:
            'status=complete + format=text requires non-null post',
          path: ['post'],
        });
      }
      if (data.validation === null) {
        ctx.addIssue({
          code: 'custom',
          message:
            'status=complete + format=text requires non-null validation',
          path: ['validation'],
        });
      }
    }

    // Invariant 2 — deferred_to_phase_c is the carousel-only escape hatch.
    if (data.status === 'deferred_to_phase_c') {
      if (data.format !== 'carousel') {
        ctx.addIssue({
          code: 'custom',
          message:
            'status=deferred_to_phase_c requires format=carousel',
          path: ['status'],
        });
      }
      if (data.post !== null) {
        ctx.addIssue({
          code: 'custom',
          message:
            'status=deferred_to_phase_c must have post=null (carousel convert is C2 scope)',
          path: ['post'],
        });
      }
    }

    // Invariant 3 — failed must surface a structured error block.
    if (data.status === 'failed' && !data.error) {
      ctx.addIssue({
        code: 'custom',
        message:
          'status=failed requires error block (step + message)',
        path: ['error'],
      });
    }

    // Invariant 4 — carousel cannot be `complete` until Phase C2 ships.
    // Guards the unintended state { status: complete, format: carousel, post: null }
    // which is syntactically valid but semantically impossible pre-C2 (no carousel
    // converter exists yet). Phase C2 will relax this — the `carousel` slot
    // becomes non-null and this invariant flips to require non-null carousel.
    if (data.status === 'complete' && data.format === 'carousel') {
      ctx.addIssue({
        code: 'custom',
        message:
          'status=complete + format=carousel is not valid until Phase C2 ships the carousel skill; use status=deferred_to_phase_c instead',
        path: ['status'],
      });
    }
  });

export type OrchestratorOutput = z.infer<typeof OrchestratorOutputSchema>;
