/**
 * linkedin-gen.test.ts — Contract + golden fixture tests.
 *
 * Four test suites mirror the Phase B1/B2/B3 pattern:
 *   1. SKILL.md contract — frontmatter (4 triggers incl. linkedin-gen), required
 *      body sections (Step 1/2/3/4, deferred-to-phase-c branch, scope
 *      boundary), anti-slop restatement.
 *   2. schema.ts contract — OrchestratorOutputSchema superRefine invariants:
 *        - status=complete + format=text + post=null → reject
 *        - status=complete + format=text + validation=null → reject
 *        - status=deferred_to_phase_c + format=text → reject
 *        - status=deferred_to_phase_c + post != null → reject
 *        - status=failed + missing error block → reject
 *        - valid complete text path → accept
 *        - valid deferred carousel path → accept
 *   3. Golden fixtures — hand-composed orchestrator outputs from existing B1 +
 *      B2 + B3 fixtures. Framework draft = complete text path; listicle draft =
 *      deferred carousel path.
 *   4. linkedin-writer agent file contract — plain markdown, no frontmatter,
 *      restates core rules inline (self-contained).
 *
 * Cross-skill integration test: compose expected-framework-draft in memory
 * from B1 brief + B2 post + B3 validation, assert deep-equal with on-disk
 * fixture.
 *
 * NO LLM inference in this suite. Tests run in ms, deterministically.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  BriefSchema,
  type Brief,
} from '../../skills/linkedin-brief/schema.js';
import { ConvertOutputSchema } from '../../skills/linkedin-convert/schema.js';
import {
  OrchestratorInputSchema,
  OrchestratorOutputSchema,
  OrchestratorStatusSchema,
  OrchestratorErrorSchema,
  type OrchestratorOutput,
} from '../../skills/linkedin-gen/schema.js';
import { ValidationSchema } from '../../skills/linkedin-validate/schema.js';
import {
  loadJsonFixture,
  loadSkillMd,
} from '../helpers/skill-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

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
  'Purpose',
  'Reference',
  'Input',
  'Step 1',
  'Step 2',
  'Step 3',
  'Step 4',
  'Output',
  'Anti-slop',
] as const;

// ---------------------------------------------------------------------------
// SKILL.md contract
// ---------------------------------------------------------------------------

describe('linkedin-gen SKILL.md contract', () => {
  it('SKILL.md exists and frontmatter parses', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.frontmatter).toBeDefined();
    expect(skill.body.length).toBeGreaterThan(800);
  });

  it('frontmatter.name is linkedin-gen', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.frontmatter.name).toBe('linkedin-gen');
  });

  it('frontmatter.model is sonnet', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.frontmatter.model).toBe('sonnet');
  });

  it('frontmatter.triggers includes all 4 required triggers', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.frontmatter.triggers).toContain('linkedin-gen');
    expect(skill.frontmatter.triggers).toContain('generate linkedin post');
    expect(skill.frontmatter.triggers).toContain('blog to linkedin');
    expect(skill.frontmatter.triggers).toContain('gen linkedin');
  });

  it('frontmatter.description mentions orchestration', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.frontmatter.description.toLowerCase()).toMatch(
      /orchestrat|end-to-end|pipeline/,
    );
  });

  it('body contains all required section headers', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    for (const header of REQUIRED_BODY_HEADERS) {
      expect(
        skill.body,
        `body missing required section header: "${header}"`,
      ).toContain(header);
    }
  });

  it('body references each sub-skill by name', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.body).toContain('linkedin-brief');
    expect(skill.body).toContain('linkedin-convert');
    expect(skill.body).toContain('linkedin-validate');
  });

  it('body mentions the deferred-to-phase-c branch for carousel', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.body).toContain('deferred_to_phase_c');
  });

  it('body restates the no-publishing / no-scheduling scope boundary', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    const lower = skill.body.toLowerCase();
    expect(lower).toMatch(/no publish|not publish|no scheduling|not schedule/);
  });

  it('body does NOT reference MixPost (Addendum 3 scope boundary)', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.body.toLowerCase()).not.toContain('mixpost');
  });

  it('body does NOT reference linkedin-schedule (B4 dropped)', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.body).not.toContain('linkedin-schedule');
  });

  it('body mentions all 7 anti-slop phrases verbatim', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    for (const phrase of ANTI_SLOP_PHRASES) {
      expect(
        skill.body.toLowerCase(),
        `body missing anti-slop blacklist entry: "${phrase}"`,
      ).toContain(phrase.toLowerCase());
    }
  });

  it('body mentions the admin panel as the downstream consumer', async () => {
    const skill = await loadSkillMd('linkedin-gen');
    expect(skill.body.toLowerCase()).toContain('admin panel');
  });
});

// ---------------------------------------------------------------------------
// schema.ts contract
// ---------------------------------------------------------------------------

describe('linkedin-gen schema.ts contract', () => {
  // Minimal valid Brief / Convert / Validation fixtures for synthesis
  const validBrief: Brief = {
    format: 'text',
    hook_id: 'specific_number',
    pillar: 'ai_solopreneur',
    pull_quote:
      'The test is this: after you close the laptop, is work still happening? If yes, you have an execution layer.',
    angle:
      'Most solopreneurs stop at the reasoning model — the real leverage is in the 3 layers above it.',
    title_draft: 'The 4-Layer AI Solopreneur Stack (why most stop at Layer 1)',
    linkedin_conversion_confidence: 0.88,
  };

  const carouselBrief: Brief = {
    format: 'carousel',
    hook_framework: 'AIDA',
    pillar: 'ai_agents',
    pull_quote:
      'Agents without circuit breakers cost clients four thousand dollars in API fees overnight. I have seen it twice.',
    angle:
      'Every production agent stack reaches for the same 8 patterns — here is the order I introduce them.',
    title_draft: '8 Agent Patterns Behind 12 Shipped Client Projects',
    linkedin_conversion_confidence: 0.92,
  };

  it('OrchestratorStatusSchema accepts the 3 known statuses', () => {
    expect(OrchestratorStatusSchema.safeParse('complete').success).toBe(true);
    expect(
      OrchestratorStatusSchema.safeParse('deferred_to_phase_c').success,
    ).toBe(true);
    expect(OrchestratorStatusSchema.safeParse('failed').success).toBe(true);
    expect(OrchestratorStatusSchema.safeParse('unknown').success).toBe(false);
  });

  it('OrchestratorErrorSchema requires step + message', () => {
    expect(
      OrchestratorErrorSchema.safeParse({
        step: 'brief',
        message: 'brief output failed schema',
      }).success,
    ).toBe(true);
    expect(
      OrchestratorErrorSchema.safeParse({ step: 'brief' }).success,
    ).toBe(false);
    expect(
      OrchestratorErrorSchema.safeParse({
        step: 'unknown-step',
        message: 'long enough',
      }).success,
    ).toBe(false);
  });

  it('OrchestratorInputSchema accepts a valid blog input', () => {
    const input = {
      blog: {
        url: 'https://alisadikinma.com/blog/ai-solopreneur-stack',
        title: 'The AI Generalist Stack: 4 Layers',
        content:
          'This is a real blog post that is definitely longer than one hundred characters so the min-length gate is satisfied. It goes on.',
      },
    };
    const result = OrchestratorInputSchema.safeParse(input);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('OrchestratorInputSchema rejects missing blog', () => {
    expect(OrchestratorInputSchema.safeParse({}).success).toBe(false);
  });

  it('OrchestratorOutputSchema accepts a valid complete text path', async () => {
    const post = await loadJsonFixture(
      'convert',
      'expected-framework.json',
      ConvertOutputSchema,
    );
    const validation = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );

    const output: OrchestratorOutput = {
      status: 'complete',
      format: 'text',
      brief: validBrief,
      post,
      carousel: null,
      validation,
      generated_at: '2026-04-23T09:00:00Z',
    };
    const result = OrchestratorOutputSchema.safeParse(output);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('OrchestratorOutputSchema accepts a valid deferred carousel path', () => {
    const output: OrchestratorOutput = {
      status: 'deferred_to_phase_c',
      format: 'carousel',
      brief: carouselBrief,
      post: null,
      carousel: null,
      validation: null,
      generated_at: '2026-04-23T09:00:00Z',
    };
    const result = OrchestratorOutputSchema.safeParse(output);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('OrchestratorOutputSchema rejects status=complete + format=text + post=null', async () => {
    const validation = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    const bad = {
      status: 'complete' as const,
      format: 'text' as const,
      brief: validBrief,
      post: null,
      carousel: null,
      validation,
    };
    const result = OrchestratorOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join('|');
      expect(msgs).toMatch(/non-null post|post/);
    }
  });

  it('OrchestratorOutputSchema rejects status=complete + format=text + validation=null', async () => {
    const post = await loadJsonFixture(
      'convert',
      'expected-framework.json',
      ConvertOutputSchema,
    );
    const bad = {
      status: 'complete' as const,
      format: 'text' as const,
      brief: validBrief,
      post,
      carousel: null,
      validation: null,
    };
    const result = OrchestratorOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join('|');
      expect(msgs).toMatch(/non-null validation|validation/);
    }
  });

  it('OrchestratorOutputSchema rejects status=deferred_to_phase_c + format=text', () => {
    const bad = {
      status: 'deferred_to_phase_c' as const,
      format: 'text' as const,
      brief: validBrief,
      post: null,
      carousel: null,
      validation: null,
    };
    const result = OrchestratorOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join('|');
      expect(msgs).toMatch(/format=carousel|carousel/);
    }
  });

  it('OrchestratorOutputSchema rejects deferred_to_phase_c + non-null post', async () => {
    const post = await loadJsonFixture(
      'convert',
      'expected-framework.json',
      ConvertOutputSchema,
    );
    const bad = {
      status: 'deferred_to_phase_c' as const,
      format: 'carousel' as const,
      brief: carouselBrief,
      post,
      carousel: null,
      validation: null,
    };
    const result = OrchestratorOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join('|');
      expect(msgs).toMatch(/post=null|post/);
    }
  });

  it('OrchestratorOutputSchema rejects status=failed without error block', () => {
    const bad = {
      status: 'failed' as const,
      format: 'text' as const,
      brief: validBrief,
      post: null,
      carousel: null,
      validation: null,
    };
    const result = OrchestratorOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join('|');
      expect(msgs).toMatch(/error/);
    }
  });

  it('OrchestratorOutputSchema accepts status=failed WITH error block', () => {
    const output = {
      status: 'failed' as const,
      format: 'text' as const,
      brief: validBrief,
      post: null,
      carousel: null,
      validation: null,
      error: {
        step: 'convert' as const,
        message: 'post_text length was below 1100 chars',
        zod_issues: [],
      },
    };
    const result = OrchestratorOutputSchema.safeParse(output);
    if (!result.success) {
      const msgs = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${msgs}`);
    }
    expect(result.success).toBe(true);
  });

  it('OrchestratorOutputSchema rejects invalid format enum value', () => {
    const bad = {
      status: 'complete' as const,
      format: 'video' as unknown as 'text',
      brief: validBrief,
      post: null,
      carousel: null,
      validation: null,
    };
    const result = OrchestratorOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('OrchestratorOutputSchema rejects carousel != null (carousel slot always null in B5)', async () => {
    const post = await loadJsonFixture(
      'convert',
      'expected-framework.json',
      ConvertOutputSchema,
    );
    const validation = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    const bad = {
      status: 'complete' as const,
      format: 'text' as const,
      brief: validBrief,
      post,
      // carousel field set to anything non-null should fail z.null()
      carousel: { slides: [] } as unknown as null,
      validation,
    };
    const result = OrchestratorOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Golden fixtures
// ---------------------------------------------------------------------------

describe('linkedin-gen golden fixtures — framework (text, complete)', () => {
  it('expected-framework-draft.json validates', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out).toBeDefined();
  });

  it('expected-framework-draft.json has status=complete', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.status).toBe('complete');
  });

  it('expected-framework-draft.json has format=text', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.format).toBe('text');
  });

  it('expected-framework-draft.json has non-null post', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.post).not.toBeNull();
  });

  it('expected-framework-draft.json has non-null validation', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.validation).not.toBeNull();
  });

  it('expected-framework-draft.json has carousel=null', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.carousel).toBeNull();
  });

  it('expected-framework-draft.json has no error block', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.error).toBeUndefined();
  });

  it('expected-framework-draft.json depth_score >= 80', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.validation?.depth_score).toBeGreaterThanOrEqual(80);
  });

  it('expected-framework-draft.json brief matches B1 framework fixture', async () => {
    const genOut = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    const briefFixture = await loadJsonFixture(
      'brief',
      'expected-framework.json',
      BriefSchema,
    );
    expect(genOut.brief).toEqual(briefFixture);
  });

  it('expected-framework-draft.json post matches B2 framework fixture', async () => {
    const genOut = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    const convertFixture = await loadJsonFixture(
      'convert',
      'expected-framework.json',
      ConvertOutputSchema,
    );
    expect(genOut.post).toEqual(convertFixture);
  });

  it('expected-framework-draft.json validation matches B3 good fixture', async () => {
    const genOut = await loadJsonFixture(
      'gen',
      'expected-framework-draft.json',
      OrchestratorOutputSchema,
    );
    const validationFixture = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    expect(genOut.validation).toEqual(validationFixture);
  });
});

describe('linkedin-gen golden fixtures — listicle (carousel, deferred)', () => {
  it('expected-listicle-draft.json validates', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-listicle-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out).toBeDefined();
  });

  it('expected-listicle-draft.json has status=deferred_to_phase_c', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-listicle-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.status).toBe('deferred_to_phase_c');
  });

  it('expected-listicle-draft.json has format=carousel', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-listicle-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.format).toBe('carousel');
  });

  it('expected-listicle-draft.json has post=null', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-listicle-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.post).toBeNull();
  });

  it('expected-listicle-draft.json has carousel=null', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-listicle-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.carousel).toBeNull();
  });

  it('expected-listicle-draft.json has validation=null', async () => {
    const out = await loadJsonFixture(
      'gen',
      'expected-listicle-draft.json',
      OrchestratorOutputSchema,
    );
    expect(out.validation).toBeNull();
  });

  it('expected-listicle-draft.json brief matches B1 listicle fixture', async () => {
    const genOut = await loadJsonFixture(
      'gen',
      'expected-listicle-draft.json',
      OrchestratorOutputSchema,
    );
    const briefFixture = await loadJsonFixture(
      'brief',
      'expected-listicle.json',
      BriefSchema,
    );
    expect(genOut.brief).toEqual(briefFixture);
  });
});

// ---------------------------------------------------------------------------
// Cross-skill integration — deep-equal composition check
// ---------------------------------------------------------------------------

describe('linkedin-gen cross-skill composition', () => {
  it('framework draft = { brief (B1) + post (B2) + validation (B3) } deep-equal match', async () => {
    const brief = await loadJsonFixture(
      'brief',
      'expected-framework.json',
      BriefSchema,
    );
    const post = await loadJsonFixture(
      'convert',
      'expected-framework.json',
      ConvertOutputSchema,
    );
    const validation = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );

    // Read the on-disk golden fixture raw so we can compare generated_at exactly.
    const raw = await readFile(
      resolve(
        REPO_ROOT,
        'tests',
        'fixtures',
        'gen',
        'expected-framework-draft.json',
      ),
      'utf8',
    );
    const onDisk = JSON.parse(raw) as OrchestratorOutput;

    const composed = {
      status: 'complete' as const,
      format: 'text' as const,
      brief,
      post,
      carousel: null,
      validation,
      generated_at: onDisk.generated_at,
    };

    // The composition must pass the Orchestrator schema.
    const result = OrchestratorOutputSchema.safeParse(composed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`composed object failed schema: ${issues}`);
    }
    expect(result.success).toBe(true);

    // The composition must match the on-disk fixture exactly.
    expect(onDisk).toEqual(composed);
  });

  it('listicle draft = { brief (B1 listicle) + nulls } deep-equal match', async () => {
    const brief = await loadJsonFixture(
      'brief',
      'expected-listicle.json',
      BriefSchema,
    );

    const raw = await readFile(
      resolve(
        REPO_ROOT,
        'tests',
        'fixtures',
        'gen',
        'expected-listicle-draft.json',
      ),
      'utf8',
    );
    const onDisk = JSON.parse(raw) as OrchestratorOutput;

    const composed = {
      status: 'deferred_to_phase_c' as const,
      format: 'carousel' as const,
      brief,
      post: null,
      carousel: null,
      validation: null,
      generated_at: onDisk.generated_at,
    };

    const result = OrchestratorOutputSchema.safeParse(composed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`composed object failed schema: ${issues}`);
    }
    expect(result.success).toBe(true);
    expect(onDisk).toEqual(composed);
  });
});

// ---------------------------------------------------------------------------
// linkedin-writer agent file contract
// ---------------------------------------------------------------------------

describe('linkedin-writer agent file contract', () => {
  const AGENT_PATH = resolve(REPO_ROOT, 'agents', 'linkedin-writer.md');

  const AGENT_CORE_TOPICS = [
    /format decision/i,
    /hook formul/i,
    /pillar/i,
    /depth score/i,
    /anti-slop|anti\s*slop/i,
    /link\s*-?\s*in\s*-?\s*comment/i,
  ] as const;

  it('agents/linkedin-writer.md exists', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    expect(raw.length).toBeGreaterThan(0);
  });

  it('agent file has no YAML frontmatter (plain markdown, per sibling convention)', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    // Must start with # (H1), not ---
    expect(raw.startsWith('#')).toBe(true);
    expect(raw.startsWith('---')).toBe(false);
  });

  it('agent file contains H1 with "LinkedIn Writer" title', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    const firstLine = raw.split(/\r?\n/)[0] ?? '';
    expect(firstLine).toMatch(/^#\s+.*LinkedIn Writer/i);
  });

  it('agent file body is substantive (>= 2000 chars)', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    expect(raw.length).toBeGreaterThanOrEqual(2000);
  });

  it('agent body mentions all 6 core rule topics', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    for (const pattern of AGENT_CORE_TOPICS) {
      expect(raw, `agent body missing pattern: ${pattern}`).toMatch(pattern);
    }
  });

  it('agent body restates all 7 banned phrases verbatim', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    const lower = raw.toLowerCase();
    for (const phrase of ANTI_SLOP_PHRASES) {
      expect(
        lower,
        `agent body missing anti-slop phrase: "${phrase}"`,
      ).toContain(phrase.toLowerCase());
    }
  });

  it('agent body restates engagement-bait strings', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    expect(raw).toMatch(/Comment YES/);
    expect(raw.toLowerCase()).toMatch(/type a\/b|type a for/);
    expect(raw).toMatch(/Drop a 🔥|Drop a fire/);
  });

  it('agent body does NOT reference MixPost, publishing, scheduling, OAuth, or Telegram', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    const lower = raw.toLowerCase();
    expect(lower, 'agent must not mention MixPost').not.toContain('mixpost');
    expect(lower, 'agent must not mention OAuth').not.toContain('oauth');
    expect(lower, 'agent must not mention Telegram').not.toContain('telegram');
    expect(lower, 'agent must not mention publishing').not.toMatch(
      /\bpublish(es|ed|ing|er)?\b/,
    );
    expect(lower, 'agent must not mention scheduling').not.toMatch(
      /\bschedul(e|ed|es|ing|er)\b/,
    );
  });

  it('agent body mentions 4 brand pillars', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    expect(raw).toMatch(/ai[_\s-]?generalist/i);
    expect(raw).toMatch(/ai[_\s-]?solopreneur/i);
    expect(raw).toMatch(/vibe[_\s-]?coding/i);
    expect(raw).toMatch(/ai[_\s-]?agents/i);
  });

  it('agent body mentions 1100-1300 char range', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    expect(raw).toMatch(/1100/);
    expect(raw).toMatch(/1300/);
  });

  it('agent body mentions 3-5 hashtag range', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    expect(raw).toMatch(/3\s*[-–]\s*5/);
  });

  it('agent body mentions Depth Score >= 80 threshold', async () => {
    const raw = await readFile(AGENT_PATH, 'utf8');
    expect(raw).toMatch(/\b80\b/);
  });
});
