/**
 * schema.ts — Zod contract for linkedin-validate skill.
 *
 * This is the SINGLE SOURCE OF TRUTH for the Depth Score validation shape.
 * The SKILL.md prompt references this file; tests validate fixtures against
 * it; the production pipeline consumes `Validation` as the gating signal for
 * auto-publish (passed === true AND depth_score >= 80).
 *
 * Design sources:
 *   - CLAUDE.md §2026 LinkedIn Algorithm Mechanics → Depth Score formula,
 *     hard-fail rules, anti-slop vocabulary
 *   - docs/rag/linkedin-playbook/01-main-playbook.md §Depth Score Formula
 *   - docs/rag/linkedin-playbook/06-carousel-design.md §Depth Score carousel
 *     signals (slide count, dead zones, cover hook frameworks, direct-answer)
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto.md §13 Addendum 3
 *     (plugin scope — content generation + validation only, no scheduling)
 *
 * Scope boundary (Phase C3):
 *   - `format: 'text'`     → post is a `ConvertOutput` (B2 contract)
 *   - `format: 'carousel'` → post is a `CarouselOutput` (C2 contract). C3
 *                            extends the rubric with 9 carousel-specific rules
 *                            (12-20) on top of the shared content-level rules
 *                            (ai_slop_phrase, engagement_bait) that apply to
 *                            both formats via format-aware scanning.
 */

import { z } from 'zod';

import { ConvertOutputSchema } from '../linkedin-convert/schema.js';

/**
 * Permissive carousel post slot for ValidationInputSchema. v0.5.0 retired
 * the inline /linkedin-carousel skill — carousel authoring lives in the
 * universal /carousel-gen engine plugin, whose schema is not imported here
 * (cross-plugin import would create a hard coupling). When validating a
 * carousel-format post, callers pass the /carousel-gen output object as-is.
 * The validate skill scores rules that are applicable to whatever shape it
 * receives.
 */
const CarouselValidationPostSchema = z.unknown();

/**
 * Severity triage. `critical` triggers a HARD FAIL — any single critical
 * failure blocks auto-publish regardless of the numeric score. `important`
 * deducts meaningfully but does not block. `minor` is cosmetic.
 */
export const ValidationSeveritySchema = z.enum(['critical', 'important', 'minor']);

export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>;

/**
 * A single rubric-rule failure. `rule` is a stable machine-readable id
 * (snake_case) so downstream analytics / admin UIs can group by rule without
 * parsing free-form messages. `evidence` quotes the offending substring from
 * the post so operators can see exactly what tripped the rule.
 */
export const ValidationFailureSchema = z.object({
  rule: z.string().min(1),
  message: z.string().min(10),
  severity: ValidationSeveritySchema,
  deduction: z.number().int().min(0).max(100),
  evidence: z.string().optional(),
});

export type ValidationFailure = z.infer<typeof ValidationFailureSchema>;

/**
 * Actionable improvement suggestion keyed to a rule. One suggestion per
 * triggered critical/important failure is the expected density. Minor
 * failures do not require suggestions.
 */
export const ValidationSuggestionSchema = z.object({
  rule: z.string().min(1),
  suggestion: z.string().min(10),
});

export type ValidationSuggestion = z.infer<typeof ValidationSuggestionSchema>;

/**
 * Validation input envelope. Discriminated on `format` so the caller must
 * explicitly declare intent:
 *   - format='text'     → post is a `ConvertOutput` (B2 contract)
 *   - format='carousel' → post is a `CarouselOutput` (C2 contract)
 *
 * The text branch reuses ConvertOutputSchema verbatim; the carousel branch
 * accepts any shape (post-v0.5.0) since the /carousel-gen engine in a
 * separate plugin owns the carousel post schema.
 */
export const ValidationInputSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('text'),
    post: ConvertOutputSchema,
  }),
  z.object({
    format: z.literal('carousel'),
    post: CarouselValidationPostSchema,
  }),
]);

export type ValidationInput = z.infer<typeof ValidationInputSchema>;

/**
 * Validation output — the Depth Score gate signal.
 *
 * Invariant enforced via superRefine:
 *   passed === (depth_score >= 80 AND no failures with severity='critical')
 *
 * This keeps the pass/fail decision and the numeric score in lockstep so a
 * downstream consumer can trust either signal alone without re-deriving.
 */
export const ValidationSchema = z
  .object({
    depth_score: z.number().int().min(0).max(100),
    passed: z.boolean(),
    format: z.enum(['text', 'carousel']),
    failures: z.array(ValidationFailureSchema),
    suggestions: z.array(ValidationSuggestionSchema),
    computed_at: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasCritical = data.failures.some((f) => f.severity === 'critical');
    const expectedPassed = data.depth_score >= 80 && !hasCritical;
    if (data.passed !== expectedPassed) {
      ctx.addIssue({
        code: 'custom',
        message: `passed=${data.passed} contradicts depth_score=${data.depth_score} + critical-failures=${hasCritical}`,
        path: ['passed'],
      });
    }
  });

export type Validation = z.infer<typeof ValidationSchema>;
