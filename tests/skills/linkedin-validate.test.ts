/**
 * linkedin-validate.test.ts — Contract + golden fixture tests.
 *
 * Mirrors B1 (linkedin-brief) + B2 (linkedin-convert) pattern:
 *   1. SKILL.md contract — frontmatter, required body sections, rubric table,
 *      all 7 banned phrases + 5 engagement-bait strings listed verbatim.
 *   2. schema.ts contract — ValidationSchema rigor:
 *        - passed must match `depth_score >= 80 AND no critical failures`
 *        - depth_score bounded [0,100], integer
 *        - severity enum, deduction bounds
 *        - ValidationInputSchema discriminatedUnion on `format` (text vs carousel)
 *   3. Golden fixtures — hand-authored good + bad post fixtures whose expected
 *      validation outputs pass ValidationSchema and obey the rubric math.
 *
 * NO LLM inference in this suite. Tests run in ms, deterministically. Real
 * validation inference happens in production via Claude CLI subprocess.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { ConvertOutputSchema } from '../../skills/linkedin-convert/schema.js';
import {
  ValidationInputSchema,
  ValidationSchema,
  ValidationSeveritySchema,
  type Validation,
} from '../../skills/linkedin-validate/schema.js';
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

const ENGAGEMENT_BAIT_STRINGS = [
  'Comment YES',
  'type a for',
  'type a/b',
  'Drop a 🔥',
  'Smash that like button',
] as const;

const REQUIRED_BODY_HEADERS = [
  'Purpose',
  'Reference files',
  'Input shape',
  'Depth Score rubric',
  'Step 1',
  'Step 2',
  'Step 3',
  'Step 4',
  'Anti-slop',
] as const;

describe('linkedin-validate SKILL.md contract', () => {
  it('SKILL.md exists and frontmatter parses', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    expect(skill.frontmatter).toBeDefined();
    expect(skill.body.length).toBeGreaterThan(500);
  });

  it('frontmatter.name is linkedin-validate', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    expect(skill.frontmatter.name).toBe('linkedin-validate');
  });

  it('frontmatter.model is sonnet', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    expect(skill.frontmatter.model).toBe('sonnet');
  });

  it('frontmatter.triggers includes validate, linkedin validate, score post, depth score', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    expect(skill.frontmatter.triggers).toContain('validate');
    expect(skill.frontmatter.triggers).toContain('linkedin validate');
    expect(skill.frontmatter.triggers).toContain('score post');
    expect(skill.frontmatter.triggers).toContain('depth score');
  });

  it('body contains all required section headers', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    for (const header of REQUIRED_BODY_HEADERS) {
      expect(
        skill.body,
        `body missing required section header: "${header}"`,
      ).toContain(header);
    }
  });

  it('body mentions all 7 anti-slop phrases verbatim', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    for (const phrase of ANTI_SLOP_PHRASES) {
      expect(
        skill.body.toLowerCase(),
        `body missing anti-slop blacklist entry: "${phrase}"`,
      ).toContain(phrase.toLowerCase());
    }
  });

  it('body mentions all 5 engagement-bait strings verbatim', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    for (const bait of ENGAGEMENT_BAIT_STRINGS) {
      expect(
        skill.body,
        `body missing engagement-bait entry: "${bait}"`,
      ).toContain(bait);
    }
  });

  it('body mentions the 80 depth-score threshold', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    expect(skill.body).toMatch(/\b80\b/);
  });

  it('body references Phase C3 for carousel scope', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    expect(skill.body).toMatch(/C3/);
  });

  it('body includes the rubric deduction values from the spec', async () => {
    const skill = await loadSkillMd('linkedin-validate');
    // Deductions encoded in the rubric table (must match fixture math).
    expect(skill.body).toMatch(/-20/); // hook absent / ai_slop / engagement_bait
    expect(skill.body).toMatch(/-15/); // char count / closing question
    expect(skill.body).toMatch(/-30/); // external link HARD FAIL
    expect(skill.body).toMatch(/-10/); // paragraph rhythm / link_comment missing URL
    expect(skill.body).toMatch(/-5/);  // hashtag range / format
  });
});

describe('linkedin-validate schema.ts contract', () => {
  const validGoodResult: Validation = {
    depth_score: 92,
    passed: true,
    format: 'text',
    failures: [],
    suggestions: [],
    computed_at: '2026-04-23T08:30:00Z',
  };

  const validBadResult: Validation = {
    depth_score: 25,
    passed: false,
    format: 'text',
    failures: [
      {
        rule: 'external_link_in_body',
        message:
          'post_text contains https://evil.com — body links incur 60% reach penalty',
        severity: 'critical',
        deduction: 30,
        evidence: 'https://evil.com',
      },
      {
        rule: 'ai_slop_phrase',
        message: 'post_text contains banned phrase "delve into"',
        severity: 'critical',
        deduction: 20,
        evidence: 'delve into',
      },
    ],
    suggestions: [
      {
        rule: 'external_link_in_body',
        suggestion:
          'Move the URL out of the body and into the first-comment payload.',
      },
    ],
  };

  it('ValidationSchema accepts a valid pass result', () => {
    const result = ValidationSchema.safeParse(validGoodResult);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('ValidationSchema accepts a valid fail result', () => {
    const result = ValidationSchema.safeParse(validBadResult);
    expect(result.success).toBe(true);
  });

  it('ValidationSchema rejects passed=true when depth_score < 80', () => {
    const bad: Validation = { ...validGoodResult, depth_score: 75 };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/passed=true/);
    }
  });

  it('ValidationSchema rejects passed=true when failures contains a critical severity entry', () => {
    const bad: Validation = {
      ...validGoodResult,
      depth_score: 85,
      failures: [
        {
          rule: 'ai_slop_phrase',
          message: 'post_text contains banned phrase "delve into"',
          severity: 'critical',
          deduction: 20,
        },
      ],
    };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ValidationSchema rejects passed=false when depth_score >= 80 AND no critical failures', () => {
    const bad: Validation = {
      ...validGoodResult,
      passed: false,
      depth_score: 90,
      failures: [
        {
          rule: 'hashtag_count_out_of_range',
          message: 'only 2 hashtags (below 3-5 range)',
          severity: 'important',
          deduction: 5,
        },
      ],
    };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ValidationSchema rejects depth_score below 0', () => {
    const bad = { ...validGoodResult, depth_score: -1 };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ValidationSchema rejects depth_score above 100', () => {
    const bad = { ...validGoodResult, depth_score: 101 };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ValidationSchema rejects depth_score that is not an integer', () => {
    const bad = { ...validGoodResult, depth_score: 85.5 };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ValidationSchema rejects failure severity outside enum', () => {
    const bad = {
      ...validGoodResult,
      passed: false,
      depth_score: 50,
      failures: [
        {
          rule: 'ai_slop_phrase',
          message: 'post_text contains banned phrase',
          severity: 'SEVERE',
          deduction: 20,
        },
      ],
    };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ValidationSchema rejects deduction > 100', () => {
    const bad = {
      ...validGoodResult,
      passed: false,
      depth_score: 50,
      failures: [
        {
          rule: 'x',
          message: 'a message long enough',
          severity: 'critical',
          deduction: 200,
        },
      ],
    };
    const result = ValidationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ValidationSeveritySchema enumerates critical | important | minor', () => {
    expect(ValidationSeveritySchema.safeParse('critical').success).toBe(true);
    expect(ValidationSeveritySchema.safeParse('important').success).toBe(true);
    expect(ValidationSeveritySchema.safeParse('minor').success).toBe(true);
    expect(ValidationSeveritySchema.safeParse('nope').success).toBe(false);
  });

  // ---------- Input envelope ----------

  it('ValidationInputSchema accepts format=text branch with a valid ConvertOutput', async () => {
    const out = await loadJsonFixture(
      'convert',
      'expected-framework.json',
      ConvertOutputSchema,
    );
    const result = ValidationInputSchema.safeParse({
      format: 'text',
      post: out,
    });
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('ValidationInputSchema rejects unknown format value', () => {
    const result = ValidationInputSchema.safeParse({
      format: 'video',
      post: {},
    });
    expect(result.success).toBe(false);
  });

  it('ValidationInputSchema format=carousel branch accepts placeholder post object (C2 lands the real schema)', () => {
    const result = ValidationInputSchema.safeParse({
      format: 'carousel',
      post: { slides: [] },
    });
    // Placeholder schema should accept this — carousel shape is pending C2
    expect(result.success).toBe(true);
  });
});

describe('linkedin-validate golden fixtures — good post', () => {
  it('input fixture passes ValidationInputSchema (format=text envelope)', async () => {
    const input = await loadJsonFixture(
      'validate',
      'input-good-post.json',
      ValidationInputSchema,
    );
    expect(input.format).toBe('text');
  });

  it('input fixture .post passes ConvertOutputSchema (sanity check — it is a valid post)', async () => {
    const raw = await readFile(
      resolve(REPO_ROOT, 'tests', 'fixtures', 'validate', 'input-good-post.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { format: string; post: unknown };
    const result = ConvertOutputSchema.safeParse(parsed.post);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`good-post .post failed ConvertOutputSchema: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('expected validation passes ValidationSchema', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    expect(out).toBeDefined();
  });

  it('expected validation has passed=true', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    expect(out.passed).toBe(true);
  });

  it('expected validation has depth_score >= 80', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    expect(out.depth_score).toBeGreaterThanOrEqual(80);
  });

  it('expected validation has no critical severity failures', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    const criticals = out.failures.filter((f) => f.severity === 'critical');
    expect(criticals).toHaveLength(0);
  });

  it('expected validation format is text', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-good-validation.json',
      ValidationSchema,
    );
    expect(out.format).toBe('text');
  });
});

describe('linkedin-validate golden fixtures — bad post', () => {
  // NOTE: the bad-post input intentionally VIOLATES ConvertOutputSchema
  // (contains URL, banned phrase, engagement bait, wrong char count). We load
  // it raw and bypass ConvertOutputSchema.parse — that is the whole point of
  // the fixture: it shows what the validator is meant to catch.

  it('bad-post input exists and is valid JSON', async () => {
    const raw = await readFile(
      resolve(REPO_ROOT, 'tests', 'fixtures', 'validate', 'input-bad-post.json'),
      'utf8',
    );
    const parsed: unknown = JSON.parse(raw);
    expect(parsed).toBeDefined();
  });

  it('bad-post input envelope is a format=text ValidationInput (discriminator only)', async () => {
    const raw = await readFile(
      resolve(REPO_ROOT, 'tests', 'fixtures', 'validate', 'input-bad-post.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { format: string };
    expect(parsed.format).toBe('text');
  });

  it('bad-post .post FAILS ConvertOutputSchema (sanity — deliberate violations)', async () => {
    const raw = await readFile(
      resolve(REPO_ROOT, 'tests', 'fixtures', 'validate', 'input-bad-post.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { post: unknown };
    const result = ConvertOutputSchema.safeParse(parsed.post);
    // The post is engineered to be bad — schema must reject it.
    expect(result.success).toBe(false);
  });

  it('bad-post .post contains an http(s) URL (critical violation)', async () => {
    const raw = await readFile(
      resolve(REPO_ROOT, 'tests', 'fixtures', 'validate', 'input-bad-post.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { post: { post_text: string } };
    expect(parsed.post.post_text).toMatch(/https?:\/\//i);
  });

  it('bad-post .post contains a banned AI-slop phrase', async () => {
    const raw = await readFile(
      resolve(REPO_ROOT, 'tests', 'fixtures', 'validate', 'input-bad-post.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { post: { post_text: string } };
    const lower = parsed.post.post_text.toLowerCase();
    const hit = ANTI_SLOP_PHRASES.some((p) => lower.includes(p.toLowerCase()));
    expect(hit).toBe(true);
  });

  it('bad-post .post contains an engagement-bait string', async () => {
    const raw = await readFile(
      resolve(REPO_ROOT, 'tests', 'fixtures', 'validate', 'input-bad-post.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { post: { post_text: string } };
    const hit = ENGAGEMENT_BAIT_STRINGS.some((b) =>
      parsed.post.post_text.includes(b),
    );
    expect(hit).toBe(true);
  });

  it('expected validation passes ValidationSchema', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    expect(out).toBeDefined();
  });

  it('expected validation has passed=false', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    expect(out.passed).toBe(false);
  });

  it('expected validation has depth_score < 80', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    expect(out.depth_score).toBeLessThan(80);
  });

  it('expected validation includes external_link_in_body with critical severity', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    const hit = out.failures.find(
      (f) => f.rule === 'external_link_in_body' && f.severity === 'critical',
    );
    expect(hit, 'missing external_link_in_body critical failure').toBeDefined();
  });

  it('expected validation includes ai_slop_phrase with critical severity', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    const hit = out.failures.find(
      (f) => f.rule === 'ai_slop_phrase' && f.severity === 'critical',
    );
    expect(hit, 'missing ai_slop_phrase critical failure').toBeDefined();
  });

  it('expected validation includes engagement_bait with critical severity', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    const hit = out.failures.find(
      (f) => f.rule === 'engagement_bait' && f.severity === 'critical',
    );
    expect(hit, 'missing engagement_bait critical failure').toBeDefined();
  });

  it('expected validation lists at least 3 critical failures', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    const criticals = out.failures.filter((f) => f.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(3);
  });

  it('expected validation suggestions[] has at least 3 entries (one per critical failure)', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    expect(out.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('expected validation also flags char_count_out_of_range + missing_closing_question + hashtag_count_out_of_range', async () => {
    const out = await loadJsonFixture(
      'validate',
      'expected-bad-validation.json',
      ValidationSchema,
    );
    const rules = out.failures.map((f) => f.rule);
    expect(rules).toContain('char_count_out_of_range');
    expect(rules).toContain('missing_closing_question');
    expect(rules).toContain('hashtag_count_out_of_range');
  });
});
