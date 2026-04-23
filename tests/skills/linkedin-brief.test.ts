/**
 * linkedin-brief.test.ts — Contract + golden fixture tests.
 *
 * Three test suites:
 *   1. SKILL.md contract — frontmatter shape, required body sections, anti-slop
 *   2. schema.ts contract — Zod schema behavior, superRefine guards
 *   3. Golden fixtures — 3 hand-authored expected outputs encode business
 *      rules (framework input → text, listicle input → carousel, opinion
 *      input → contrarian text).
 *
 * NO LLM inference in this suite. Tests run in ms, deterministically. Real
 * generation happens in production (Claude CLI subprocess) + Phase B6 manual
 * smoke test.
 */

import { describe, it, expect } from 'vitest';

import { BriefSchema, type Brief } from '../../skills/linkedin-brief/schema.js';
import {
  loadFixture,
  loadJsonFixture,
  loadSkillMd,
} from '../helpers/skill-runner.js';

const ANTI_SLOP_PHRASES = [
  'delve into',
  'unlock the power of',
  "in today's fast-paced digital landscape",
  'at the end of the day',
  'navigating the complexities of',
  'harness the power of',
  'seamlessly integrate',
] as const;

const REQUIRED_BODY_HEADERS = [
  'Step 1',
  'Step 2',
  'Step 3',
  'Step 4',
  'Step 5',
  'Step 6',
  'Step 7',
  'Output schema',
] as const;

describe('linkedin-brief SKILL.md contract', () => {
  it('SKILL.md exists and frontmatter parses', async () => {
    const skill = await loadSkillMd('linkedin-brief');
    expect(skill.frontmatter).toBeDefined();
    expect(skill.body.length).toBeGreaterThan(500);
  });

  it('frontmatter.name is linkedin-brief', async () => {
    const skill = await loadSkillMd('linkedin-brief');
    expect(skill.frontmatter.name).toBe('linkedin-brief');
  });

  it('frontmatter.model is sonnet', async () => {
    const skill = await loadSkillMd('linkedin-brief');
    expect(skill.frontmatter.model).toBe('sonnet');
  });

  it('frontmatter.triggers includes brief and linkedin brief', async () => {
    const skill = await loadSkillMd('linkedin-brief');
    expect(skill.frontmatter.triggers).toContain('brief');
    expect(skill.frontmatter.triggers).toContain('linkedin brief');
  });

  it('body contains all required step headers', async () => {
    const skill = await loadSkillMd('linkedin-brief');
    for (const header of REQUIRED_BODY_HEADERS) {
      expect(
        skill.body,
        `body missing required section header: "${header}"`,
      ).toContain(header);
    }
  });

  it('body mentions all 7 anti-slop phrases', async () => {
    const skill = await loadSkillMd('linkedin-brief');
    for (const phrase of ANTI_SLOP_PHRASES) {
      expect(
        skill.body.toLowerCase(),
        `body missing anti-slop blacklist entry: "${phrase}"`,
      ).toContain(phrase.toLowerCase());
    }
  });
});

describe('linkedin-brief schema.ts contract', () => {
  const baseTextBrief: Brief = {
    format: 'text',
    hook_id: 'contrarian',
    pillar: 'ai_generalist',
    pull_quote:
      'Most dev teams are using AI agents as fancy autocomplete when they could be shipping whole features unattended.',
    angle:
      'The 3-layer agent stack that actually ships features, vs the autocomplete theater most teams are running.',
    title_draft: 'The Agent Stack That Actually Ships',
    linkedin_conversion_confidence: 0.85,
  };

  const baseCarouselBrief: Brief = {
    format: 'carousel',
    hook_framework: 'AIDA',
    pillar: 'ai_agents',
    pull_quote:
      'Eight patterns kept showing up in every production agent I shipped last quarter — the same eight, in the same order.',
    angle:
      'The 8 patterns I reach for in every production agent, in the order I introduce them on client work.',
    title_draft: '8 Agent Patterns Behind 12 Shipped Projects',
    linkedin_conversion_confidence: 0.9,
  };

  it('BriefSchema accepts a valid text brief', () => {
    const result = BriefSchema.safeParse(baseTextBrief);
    expect(result.success).toBe(true);
  });

  it('BriefSchema accepts a valid carousel brief', () => {
    const result = BriefSchema.safeParse(baseCarouselBrief);
    expect(result.success).toBe(true);
  });

  it('BriefSchema rejects text brief missing hook_id', () => {
    const bad = { ...baseTextBrief };
    delete (bad as Partial<Brief>).hook_id;
    const result = BriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/hook_id required for text format/);
    }
  });

  it('BriefSchema rejects carousel brief missing hook_framework', () => {
    const bad = { ...baseCarouselBrief };
    delete (bad as Partial<Brief>).hook_framework;
    const result = BriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/hook_framework required for carousel format/);
    }
  });

  it('BriefSchema rejects text brief with orphan hook_framework field', () => {
    const bad: Brief = { ...baseTextBrief, hook_framework: 'PAS' };
    const result = BriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/hook_framework must be absent for text format/);
    }
  });

  it('BriefSchema rejects carousel brief with orphan hook_id field', () => {
    const bad: Brief = { ...baseCarouselBrief, hook_id: 'contrarian' };
    const result = BriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/hook_id must be absent for carousel format/);
    }
  });

  it('BriefSchema rejects pull_quote shorter than 40 chars', () => {
    const bad: Brief = { ...baseTextBrief, pull_quote: 'too short' };
    const result = BriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('BriefSchema rejects linkedin_conversion_confidence out of [0,1]', () => {
    const bad: Brief = { ...baseTextBrief, linkedin_conversion_confidence: 1.5 };
    const result = BriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('BriefSchema rejects unknown pillar', () => {
    const bad = { ...baseTextBrief, pillar: 'unknown_pillar' } as unknown;
    const result = BriefSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

/**
 * Count H2 (`## `) headings in a markdown blob. Used to assert input-fixture
 * shape matches the heuristic gate (>= 5 H2 → carousel candidate).
 */
function countH2(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => line.startsWith('## ')).length;
}

describe('linkedin-brief golden fixtures', () => {
  describe('framework fixture (text path)', () => {
    it('input has fewer than 5 H2 headings (text route)', async () => {
      const input = await loadFixture('brief', 'input-framework-blog.md');
      expect(countH2(input)).toBeLessThan(5);
    });

    it('expected output validates against BriefSchema', async () => {
      const brief = await loadJsonFixture(
        'brief',
        'expected-framework.json',
        BriefSchema,
      );
      expect(brief).toBeDefined();
    });

    it('expected output has format=text with specific_number hook (framework → text rule)', async () => {
      const brief = await loadJsonFixture(
        'brief',
        'expected-framework.json',
        BriefSchema,
      );
      expect(brief.format).toBe('text');
      expect(brief.hook_id).toBe('specific_number');
      expect(brief.hook_framework).toBeUndefined();
    });
  });

  describe('listicle fixture (carousel path)', () => {
    it('input has 5 or more H2 headings (carousel route)', async () => {
      const input = await loadFixture('brief', 'input-listicle-blog.md');
      expect(countH2(input)).toBeGreaterThanOrEqual(5);
    });

    it('expected output validates against BriefSchema', async () => {
      const brief = await loadJsonFixture(
        'brief',
        'expected-listicle.json',
        BriefSchema,
      );
      expect(brief).toBeDefined();
    });

    it('expected output has format=carousel with AIDA framework (listicle → carousel rule)', async () => {
      const brief = await loadJsonFixture(
        'brief',
        'expected-listicle.json',
        BriefSchema,
      );
      expect(brief.format).toBe('carousel');
      expect(brief.hook_framework).toBe('AIDA');
      expect(brief.hook_id).toBeUndefined();
    });
  });

  describe('opinion fixture (contrarian hook)', () => {
    it('input has fewer than 5 H2 headings (text route)', async () => {
      const input = await loadFixture('brief', 'input-opinion-blog.md');
      expect(countH2(input)).toBeLessThan(5);
    });

    it('expected output validates against BriefSchema', async () => {
      const brief = await loadJsonFixture(
        'brief',
        'expected-opinion.json',
        BriefSchema,
      );
      expect(brief).toBeDefined();
    });

    it('expected output has hook_id=contrarian (opinion → contrarian rule)', async () => {
      const brief = await loadJsonFixture(
        'brief',
        'expected-opinion.json',
        BriefSchema,
      );
      expect(brief.format).toBe('text');
      expect(brief.hook_id).toBe('contrarian');
    });
  });

  it('all 3 expected outputs pass BriefSchema validation together', async () => {
    const briefs = await Promise.all([
      loadJsonFixture('brief', 'expected-framework.json', BriefSchema),
      loadJsonFixture('brief', 'expected-listicle.json', BriefSchema),
      loadJsonFixture('brief', 'expected-opinion.json', BriefSchema),
    ]);
    expect(briefs).toHaveLength(3);
    for (const brief of briefs) {
      expect(brief.linkedin_conversion_confidence).toBeGreaterThanOrEqual(0);
      expect(brief.linkedin_conversion_confidence).toBeLessThanOrEqual(1);
    }
  });
});
