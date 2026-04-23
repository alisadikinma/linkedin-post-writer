/**
 * schema.ts — Zod contract for linkedin-convert skill output.
 *
 * This is the SINGLE SOURCE OF TRUTH for the text-post JSON shape. The SKILL.md
 * prompt references this file; tests validate fixtures against it; the
 * production pipeline (linkedin-validate, linkedin-schedule) consumes this
 * shape as its input contract.
 *
 * Design sources:
 *   - CLAUDE.md §2026 LinkedIn Algorithm Mechanics
 *     (1100-1300 char sweet spot, 3-5 hashtag range, link-in-comment rule,
 *      anti-slop vocabulary, engagement bait blacklist)
 *   - docs/rag/linkedin-playbook/02-templates-hooks.md §5 Formatting Rules 2026
 *     (hashtag mix, external link penalty, paragraph rhythm)
 *   - docs/rag/linkedin-playbook/05-hashtags-timing-language.md
 *     (hashtag CamelCase convention)
 */

import { z } from 'zod';

import { BriefSchema } from '../linkedin-brief/schema.js';

/**
 * Source blog — the published post we are converting. The URL is required
 * (link-in-comment pattern needs a real destination) and content must be long
 * enough that extracting a hook + pull quote is possible.
 */
export const BlogSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  content: z.string().min(100),
});

export type BlogSource = z.infer<typeof BlogSourceSchema>;

/**
 * Input to the skill: a finalized Brief (from linkedin-brief) plus the blog
 * we are converting. The skill's SKILL.md instruction body asserts
 * `brief.format === 'text'` — a carousel brief routes to linkedin-carousel
 * instead, so we deliberately do NOT gate that here (the input schema stays
 * permissive; the skill prompt enforces the routing).
 */
export const ConvertInputSchema = z.object({
  brief: BriefSchema,
  blog: BlogSourceSchema,
});

export type ConvertInput = z.infer<typeof ConvertInputSchema>;

/**
 * Banned phrases (AI slop markers). Sourced verbatim from CLAUDE.md
 * §Anti-Slop Enforcement. Any occurrence in post_text is a hard fail at
 * schema validation — the linkedin-validate skill re-checks in production
 * but we want the contract tests to catch drift here first.
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
 * Engagement bait phrases. LinkedIn's 2024 algorithm change demotes posts
 * whose comments are transactional ("Comment YES", "Type A/B") because
 * Comment Quality — not count — is the 15× weight in the Depth Score
 * formula. See CLAUDE.md §Anti-Slop Enforcement → Prohibited CTAs.
 */
const ENGAGEMENT_BAIT = [
  'comment yes',
  'type a for',
  'type a/b',
  'drop a 🔥',
  'smash that like button',
] as const;

/**
 * Text-post output — what linkedin-convert produces for downstream
 * linkedin-validate (Depth Score gate) and linkedin-schedule (MixPost POST).
 *
 * Constraints encoded in the schema:
 *   - post_text length in [1100, 1300] (dwell-time sweet spot per RAG 01)
 *   - no http(s) URLs in post_text (60% reach penalty — link-in-comment only)
 *   - char_count must equal post_text.length (no stale metadata drift)
 *   - 3-5 hashtags, each matching /^#[A-Za-z0-9]+$/ (no spaces, no punctuation)
 *   - no banned phrases, no engagement bait (enforced via superRefine below)
 *   - link_comment 20-280 chars (short first-comment with blog URL + context)
 *   - hook_used: the actual first-3-lines text — captured for analytics +
 *     downstream Depth Score attribution
 *   - paragraph_count: bounded to encourage aggressive line breaks without
 *     descending into single-sentence fragmentation
 */
export const ConvertOutputSchema = z
  .object({
    post_text: z.string().min(1100).max(1300),
    link_comment: z
      .string()
      .min(20)
      .max(280)
      .regex(/https?:\/\//, 'link_comment must contain the blog URL'),
    hashtags: z
      .array(z.string().regex(/^#[A-Za-z0-9]+$/))
      .min(3)
      .max(5),
    char_count: z.number().int().min(1100).max(1300),
    paragraph_count: z.number().int().min(4).max(12),
    hook_used: z.string().min(10).max(200),
  })
  .superRefine((data, ctx) => {
    // Rule 1 — link-in-comment (no body URLs).
    if (/https?:\/\//i.test(data.post_text)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'post_text must not contain http(s) URLs — link-in-comment only (60% reach penalty)',
        path: ['post_text'],
      });
    }

    // Rule 2 — metadata freshness (char_count reflects the real string).
    if (data.char_count !== data.post_text.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'char_count must equal post_text.length',
        path: ['char_count'],
      });
    }

    // Rule 3 — AI slop phrase blacklist.
    const lower = data.post_text.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) {
        ctx.addIssue({
          code: 'custom',
          message: `post_text contains banned phrase: "${phrase}"`,
          path: ['post_text'],
        });
      }
    }

    // Rule 4 — engagement bait blacklist.
    for (const bait of ENGAGEMENT_BAIT) {
      if (lower.includes(bait)) {
        ctx.addIssue({
          code: 'custom',
          message: `post_text contains engagement bait: "${bait}"`,
          path: ['post_text'],
        });
      }
    }
  });

export type Convert = z.infer<typeof ConvertOutputSchema>;
