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
 *   - Phase C2 wired carousel in: when brief routes to `carousel`, the
 *     orchestrator invokes `linkedin-carousel` and emits `status: 'complete'`
 *     with `carousel` populated (no longer deferred). The `deferred_to_phase_c`
 *     status is retained as a safety escape hatch for any future format that
 *     doesn't yet have a converter.
 *
 * Design sources:
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto.md §13 Addendum 3
 *     (plugin scope boundary — content generation only)
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto-plan.md §Phase B5 + C2
 *     (orchestrator contract + carousel wiring)
 *   - CLAUDE.md §Pipeline Flow (conceptual pipeline — scope-reduced here)
 */

import { z } from 'zod';

import { BriefSchema } from '../linkedin-brief/schema.js';
import { CarouselOutputSchema } from '../linkedin-carousel/schema.js';
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
  'deferred_to_phase_c', // retained as escape hatch for future formats without converters; carousel is no longer deferred
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
  step: z.enum(['brief', 'convert', 'carousel', 'validate']),
  message: z.string().min(10),
  zod_issues: z.array(z.unknown()).optional(),
});

export type OrchestratorError = z.infer<typeof OrchestratorErrorSchema>;

/**
 * Orchestrator output — the single JSON blob the admin panel consumes.
 *
 * Invariants (enforced via superRefine):
 *   1. status='complete' + format='text' ⇒ post non-null AND validation non-null AND carousel null
 *   2. status='complete' + format='carousel' ⇒ carousel non-null AND validation non-null AND post null (Phase C2 wiring)
 *   3. status='deferred_to_phase_c' ⇒ all three of post/carousel/validation are null
 *   4. status='failed' ⇒ error block present
 *
 * Post-C2 the carousel slot is a real CarouselOutputSchema (nullable). The
 * deferred_to_phase_c status is retained as a future escape hatch, not as
 * the default carousel path.
 */
export const OrchestratorOutputSchema = z
  .object({
    status: OrchestratorStatusSchema,
    format: z.enum(['text', 'carousel']),
    brief: BriefSchema,
    post: ConvertOutputSchema.nullable(),
    carousel: CarouselOutputSchema.nullable(),
    validation: ValidationSchema.nullable(),
    error: OrchestratorErrorSchema.optional(),
    generated_at: z.string().optional(),
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

    // Invariant 2 — complete carousel path requires carousel + validation; post absent.
    if (data.status === 'complete' && data.format === 'carousel') {
      if (data.carousel === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=complete + format=carousel requires non-null carousel',
          path: ['carousel'],
        });
      }
      if (data.validation === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=complete + format=carousel requires non-null validation',
          path: ['validation'],
        });
      }
      if (data.post !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'status=complete + format=carousel requires post=null',
          path: ['post'],
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
