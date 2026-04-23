/**
 * schema.ts — Zod contract for linkedin-brief skill output.
 *
 * This is the SINGLE SOURCE OF TRUTH for the brief JSON shape. The SKILL.md
 * prompt references this file; tests validate fixtures against it; the
 * production pipeline (linkedin-convert, linkedin-carousel) consumes this shape
 * as its input contract.
 *
 * Design sources:
 *   - docs/plans/2026-04-23-plugin-architecture-full-auto.md §Appendix B.C.4
 *     (5 carousel hook frameworks)
 *   - docs/rag/linkedin-playbook/02-templates-hooks.md §1
 *     (12 text-post hook formulas)
 *   - CLAUDE.md §Pillars
 *     (4 brand pillars — ai_generalist, ai_solopreneur, vibe_coding, ai_agents)
 */

import { z } from 'zod';

/**
 * Carousel cover-slide hook frameworks (5 — from RAG 06-carousel-design §1).
 * Used ONLY when format='carousel'. Text format uses the 12-formula catalog
 * below (TextHookIdSchema).
 */
export const HookFrameworkSchema = z.enum([
  'PAS',
  'AIDA',
  'before_after',
  'loss_aversion',
  'contrarian',
]);

export type HookFramework = z.infer<typeof HookFrameworkSchema>;

/**
 * Text-post hook IDs (12 — from RAG 02-templates-hooks §1).
 * Used ONLY when format='text'. The IDs map 1:1 to the formula catalog:
 *   pas              → Problem-Agitation-Solution
 *   aida             → Attention-Interest-Desire-Action
 *   contrarian       → Contrarian Take
 *   pattern_interrupt → Counterintuitive Framework / shock opener
 *   loss_aversion    → Loss Aversion / Mistakes-to-Avoid
 *   curiosity_gap    → Curiosity Gap (open loop)
 *   specific_number  → Numbered List with specific metric
 *   bold_claim       → Bold Claim / industry forecast
 *   story_opener     → Story Cold-Open (war room)
 *   question         → Question Hook
 *   stat_drop        → Data Punch (proprietary metric lead)
 *   before_after     → Before-After transformation
 */
export const TextHookIdSchema = z.enum([
  'pas',
  'aida',
  'contrarian',
  'pattern_interrupt',
  'loss_aversion',
  'curiosity_gap',
  'specific_number',
  'bold_claim',
  'story_opener',
  'question',
  'stat_drop',
  'before_after',
]);

export type TextHookId = z.infer<typeof TextHookIdSchema>;

/**
 * Brand pillars (4 — from CLAUDE.md §Pillars).
 * Every brief MUST fit one pillar. Off-pillar content is throttled by
 * LinkedIn's Knowledge Graph Validation (RAG 01-main-playbook §2).
 */
export const PillarSchema = z.enum([
  'ai_generalist',
  'ai_solopreneur',
  'vibe_coding',
  'ai_agents',
]);

export type Pillar = z.infer<typeof PillarSchema>;

/**
 * Brief JSON — output of `linkedin-brief` skill, input to downstream
 * `linkedin-convert` / `linkedin-carousel` skills.
 *
 * superRefine guards the format ↔ hook relationship:
 *   - format='text' MUST have hook_id (from 12-formula catalog)
 *   - format='carousel' MUST have hook_framework (from 5-framework catalog)
 */
export const BriefSchema = z
  .object({
    format: z.enum(['text', 'carousel']),
    hook_framework: HookFrameworkSchema.optional(),
    hook_id: TextHookIdSchema.optional(),
    pillar: PillarSchema,
    pull_quote: z.string().min(40).max(240),
    angle: z.string().min(20).max(200),
    title_draft: z.string().min(10).max(120),
    linkedin_conversion_confidence: z.number().min(0).max(1),
  })
  .superRefine((data, ctx) => {
    if (data.format === 'text' && !data.hook_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'hook_id required for text format',
        path: ['hook_id'],
      });
    }
    if (data.format === 'text' && data.hook_framework !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'hook_framework must be absent for text format',
        path: ['hook_framework'],
      });
    }
    if (data.format === 'carousel' && !data.hook_framework) {
      ctx.addIssue({
        code: 'custom',
        message: 'hook_framework required for carousel format',
        path: ['hook_framework'],
      });
    }
    if (data.format === 'carousel' && data.hook_id !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'hook_id must be absent for carousel format',
        path: ['hook_id'],
      });
    }
  });

export type Brief = z.infer<typeof BriefSchema>;
