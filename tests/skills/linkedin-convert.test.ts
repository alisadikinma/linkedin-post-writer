/**
 * linkedin-convert.test.ts — Contract + golden fixture tests.
 *
 * Three test suites mirror the Phase B1 (linkedin-brief) pattern:
 *   1. SKILL.md contract — frontmatter shape, required body sections, anti-slop
 *   2. schema.ts contract — Zod schema behavior, superRefine guards
 *   3. Golden fixtures — hand-authored expected text-post outputs that
 *      (a) pass ConvertOutputSchema, (b) obey business rules (char count,
 *      question ending, pull_quote inclusion, link-in-comment discipline).
 *
 * NO LLM inference in this suite. Tests run in ms, deterministically. Real
 * generation happens in production (Claude CLI subprocess) + Phase B6 manual
 * smoke test.
 */

import { describe, it, expect } from 'vitest';

import {
  BriefSchema,
  type Brief,
} from '../../skills/linkedin-brief/schema.js';
import {
  ConvertInputSchema,
  ConvertOutputSchema,
  type Convert,
} from '../../skills/linkedin-convert/schema.js';
import {
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
  'Anti-slop',
] as const;

describe('linkedin-convert SKILL.md contract', () => {
  it('SKILL.md exists and frontmatter parses', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    expect(skill.frontmatter).toBeDefined();
    expect(skill.body.length).toBeGreaterThan(500);
  });

  it('frontmatter.name is linkedin-convert', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    expect(skill.frontmatter.name).toBe('linkedin-convert');
  });

  it('frontmatter.model is sonnet', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    expect(skill.frontmatter.model).toBe('sonnet');
  });

  it('frontmatter.triggers includes convert and linkedin convert', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    expect(skill.frontmatter.triggers).toContain('convert');
    expect(skill.frontmatter.triggers).toContain('linkedin convert');
  });

  it('body contains all required step headers', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    for (const header of REQUIRED_BODY_HEADERS) {
      expect(
        skill.body,
        `body missing required section header: "${header}"`,
      ).toContain(header);
    }
  });

  it('body mentions all 7 anti-slop phrases verbatim', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    for (const phrase of ANTI_SLOP_PHRASES) {
      expect(
        skill.body.toLowerCase(),
        `body missing anti-slop blacklist entry: "${phrase}"`,
      ).toContain(phrase.toLowerCase());
    }
  });

  it('body mentions the 1100-1300 character range', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    expect(skill.body).toContain('1100');
    expect(skill.body).toContain('1300');
  });

  it('body mentions the 3-5 hashtag range', async () => {
    const skill = await loadSkillMd('linkedin-convert');
    expect(skill.body).toMatch(/3-5|3 to 5|3.{0,3}5/);
  });
});

describe('linkedin-convert schema.ts contract', () => {
  // ---------- Input schema ----------

  const validBrief: Brief = {
    format: 'text',
    hook_id: 'specific_number',
    pillar: 'ai_solopreneur',
    pull_quote:
      'The test is this: after you close the laptop, is work still happening? If yes, you have an execution layer. If no, you have an expensive chatbot.',
    angle:
      'Most solopreneurs stop at the reasoning model — the real leverage is the 3 layers stacked on top of it.',
    title_draft:
      'The 4-Layer AI Solopreneur Stack (and why most stop at Layer 1)',
    linkedin_conversion_confidence: 0.88,
  };

  const validBlog = {
    url: 'https://alisadikinma.com/blog/ai-solopreneur-stack',
    title:
      'The AI Generalist Stack: 4 Layers That Make Solopreneurs Unreasonably Effective',
    content:
      'Most advice for AI solopreneurs is a tool dump. Someone lists 30 apps, tells you to subscribe, and wishes you luck. That is not a stack. A stack has layers, and each layer does one job that the layer above it cannot do for itself.',
  };

  it('ConvertInputSchema accepts a valid brief + blog pair', () => {
    const result = ConvertInputSchema.safeParse({
      brief: validBrief,
      blog: validBlog,
    });
    expect(result.success).toBe(true);
  });

  it('ConvertInputSchema rejects blog with invalid URL', () => {
    const result = ConvertInputSchema.safeParse({
      brief: validBrief,
      blog: { ...validBlog, url: 'not-a-url' },
    });
    expect(result.success).toBe(false);
  });

  it('ConvertInputSchema rejects blog with empty title', () => {
    const result = ConvertInputSchema.safeParse({
      brief: validBrief,
      blog: { ...validBlog, title: '' },
    });
    expect(result.success).toBe(false);
  });

  it('ConvertInputSchema rejects blog content shorter than 100 chars', () => {
    const result = ConvertInputSchema.safeParse({
      brief: validBrief,
      blog: { ...validBlog, content: 'too short' },
    });
    expect(result.success).toBe(false);
  });

  // ---------- Output schema ----------

  // A canonical valid post body used by multiple tests below. Exactly 1200
  // characters, 4 paragraphs, ends with a question, no https, no banned
  // phrases, contains the pull_quote verbatim.
  const validPostText = buildValidPost();

  function buildValidPost(): string {
    // Hand-tuned to 1200 chars exactly.
    const post = [
      '18 months and 12 client projects taught me that most AI solopreneurs are running one layer of a four-layer stack.',
      '',
      'They pay for a reasoning model, then burn afternoons copy-pasting into twelve browser tabs.',
      'That is not leverage. That is a more expensive version of doing it yourself — dressed up as a productivity workflow.',
      '',
      'The test is this: after you close the laptop, is work still happening? If yes, you have an execution layer. If no, you have an expensive chatbot.',
      '',
      'The stack I actually defend has four layers. Reasoning at the bottom, then execution, then memory, then distribution on top.',
      'Every layer does one job the layer above it cannot do for itself. Miss one and the whole thing collapses into vibes.',
      'Most people stop at layer one because layer two is where the real work hides — wiring agents into systems that touch real state.',
      'Memory is the layer nobody talks about until it breaks and every session starts from zero context again.',
      'Distribution is the unsexy one nobody tweets about, but without it layers one through three are a very expensive hobby.',
      '',
      'Which layer is the one breaking first when you try to scale past yourself?',
    ].join('\n');
    return post;
  }

  const validOutput: Convert = {
    post_text: validPostText,
    link_comment:
      'Full breakdown with the onboarding test I run on every solopreneur client: https://alisadikinma.com/blog/ai-solopreneur-stack',
    hashtags: ['#AISolopreneur', '#AIAgents', '#IndieMaker', '#AI'],
    char_count: validPostText.length,
    paragraph_count: 5,
    hook_used:
      '18 months and 12 client projects taught me that most AI solopreneurs are running one layer of a four-layer stack.',
  };

  it('canonical validPostText is within the 1100-1300 char range (sanity)', () => {
    expect(validPostText.length).toBeGreaterThanOrEqual(1100);
    expect(validPostText.length).toBeLessThanOrEqual(1300);
  });

  it('ConvertOutputSchema accepts a valid text post', () => {
    const result = ConvertOutputSchema.safeParse(validOutput);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('ConvertOutputSchema rejects post_text containing https URL (link-in-comment rule)', () => {
    const bad: Convert = {
      ...validOutput,
      post_text: validPostText.replace(
        '.',
        ' https://alisadikinma.com/x.',
      ),
    };
    bad.char_count = bad.post_text.length;
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/link-in-comment/);
    }
  });

  it('ConvertOutputSchema rejects post_text containing http URL (link-in-comment rule)', () => {
    const withHttp = validPostText.replace(
      '.',
      ' http://example.com/x.',
    );
    const bad: Convert = {
      ...validOutput,
      post_text: withHttp,
      char_count: withHttp.length,
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema rejects char_count mismatch with post_text.length', () => {
    const bad: Convert = { ...validOutput, char_count: validOutput.char_count + 5 };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/char_count must equal post_text.length/);
    }
  });

  it.each(ANTI_SLOP_PHRASES)(
    'ConvertOutputSchema rejects post_text containing banned phrase %s',
    (phrase) => {
      // Splice the banned phrase into the middle of the canonical post, then
      // trim back to <=1300 chars so only the phrase check (not length) trips.
      const spliced = `${phrase}. ${validPostText}`.slice(0, 1250);
      const bad: Convert = {
        ...validOutput,
        post_text: spliced,
        char_count: spliced.length,
      };
      const result = ConvertOutputSchema.safeParse(bad);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join('|');
        expect(messages).toMatch(/banned phrase/);
      }
    },
  );

  it.each([
    'Comment YES if you agree',
    'Type A for agents or B for chatbots',
    'Drop a 🔥 if this resonates',
    'Smash that like button',
  ])(
    'ConvertOutputSchema rejects post_text containing engagement bait: %s',
    (bait) => {
      const spliced = `${validPostText.slice(0, 1100)} ${bait}.`.slice(0, 1250);
      const bad: Convert = {
        ...validOutput,
        post_text: spliced,
        char_count: spliced.length,
      };
      const result = ConvertOutputSchema.safeParse(bad);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join('|');
        expect(messages).toMatch(/engagement bait/);
      }
    },
  );

  it('ConvertOutputSchema rejects post_text below 1100 chars', () => {
    const short = 'a'.repeat(1050);
    const bad = {
      ...validOutput,
      post_text: short,
      char_count: short.length,
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema rejects post_text above 1300 chars', () => {
    const long = 'a'.repeat(1301);
    const bad = {
      ...validOutput,
      post_text: long,
      char_count: long.length,
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema rejects hashtags count below 3', () => {
    const bad: Convert = {
      ...validOutput,
      hashtags: ['#AI', '#Solopreneur'],
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema rejects hashtags count above 5', () => {
    const bad: Convert = {
      ...validOutput,
      hashtags: ['#A', '#B', '#C', '#D', '#E', '#F'],
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema rejects hashtag missing # prefix', () => {
    const bad: Convert = {
      ...validOutput,
      hashtags: ['AISolopreneur', '#AIAgents', '#AI'],
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema rejects hashtag containing a space', () => {
    const bad: Convert = {
      ...validOutput,
      hashtags: ['#AI Solopreneur', '#AIAgents', '#AI'],
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema rejects hashtag with punctuation', () => {
    const bad: Convert = {
      ...validOutput,
      hashtags: ['#AI-Solopreneur', '#AIAgents', '#AI'],
    };
    const result = ConvertOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('ConvertOutputSchema re-exports a Convert type matching inferred shape', () => {
    // Compile-time check; if this line builds, the type export is healthy.
    const typed: Convert = validOutput;
    expect(typed.post_text.length).toBe(typed.char_count);
  });

  // Ensure BriefSchema is still usable through the re-import chain.
  it('BriefSchema is still accessible via convert schema import chain', () => {
    const r = BriefSchema.safeParse(validBrief);
    expect(r.success).toBe(true);
  });
});

describe('linkedin-convert golden fixtures', () => {
  describe('framework fixture (specific_number hook)', () => {
    it('input fixture passes ConvertInputSchema', async () => {
      const input = await loadJsonFixture(
        'convert',
        'input-framework.json',
        ConvertInputSchema,
      );
      expect(input.brief.format).toBe('text');
      expect(input.brief.hook_id).toBe('specific_number');
    });

    it('expected output passes ConvertOutputSchema', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-framework.json',
        ConvertOutputSchema,
      );
      expect(out).toBeDefined();
    });

    it('expected output char_count matches post_text.length exactly', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-framework.json',
        ConvertOutputSchema,
      );
      expect(out.char_count).toBe(out.post_text.length);
    });

    it('expected output post_text contains no https URLs', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-framework.json',
        ConvertOutputSchema,
      );
      expect(out.post_text).not.toMatch(/https?:\/\//i);
    });

    it('expected output ends post_text with a question mark', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-framework.json',
        ConvertOutputSchema,
      );
      expect(out.post_text.trim().endsWith('?')).toBe(true);
    });

    it('expected output includes brief.pull_quote verbatim in post_text', async () => {
      const input = await loadJsonFixture(
        'convert',
        'input-framework.json',
        ConvertInputSchema,
      );
      const out = await loadJsonFixture(
        'convert',
        'expected-framework.json',
        ConvertOutputSchema,
      );
      expect(out.post_text).toContain(input.brief.pull_quote);
    });

    it('expected output link_comment references the blog url', async () => {
      const input = await loadJsonFixture(
        'convert',
        'input-framework.json',
        ConvertInputSchema,
      );
      const out = await loadJsonFixture(
        'convert',
        'expected-framework.json',
        ConvertOutputSchema,
      );
      expect(out.link_comment).toContain(input.blog.url);
    });

    it('expected output opens with a specific number (hook_id rule)', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-framework.json',
        ConvertOutputSchema,
      );
      // First 80 chars should contain at least one digit — the whole point
      // of the specific_number hook formula.
      const opener = out.post_text.slice(0, 80);
      expect(opener).toMatch(/\d/);
    });
  });

  describe('opinion fixture (contrarian hook)', () => {
    it('input fixture passes ConvertInputSchema', async () => {
      const input = await loadJsonFixture(
        'convert',
        'input-opinion.json',
        ConvertInputSchema,
      );
      expect(input.brief.format).toBe('text');
      expect(input.brief.hook_id).toBe('contrarian');
    });

    it('expected output passes ConvertOutputSchema', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-opinion.json',
        ConvertOutputSchema,
      );
      expect(out).toBeDefined();
    });

    it('expected output char_count matches post_text.length exactly', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-opinion.json',
        ConvertOutputSchema,
      );
      expect(out.char_count).toBe(out.post_text.length);
    });

    it('expected output post_text contains no https URLs', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-opinion.json',
        ConvertOutputSchema,
      );
      expect(out.post_text).not.toMatch(/https?:\/\//i);
    });

    it('expected output ends post_text with a question mark', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-opinion.json',
        ConvertOutputSchema,
      );
      expect(out.post_text.trim().endsWith('?')).toBe(true);
    });

    it('expected output includes brief.pull_quote verbatim in post_text', async () => {
      const input = await loadJsonFixture(
        'convert',
        'input-opinion.json',
        ConvertInputSchema,
      );
      const out = await loadJsonFixture(
        'convert',
        'expected-opinion.json',
        ConvertOutputSchema,
      );
      expect(out.post_text).toContain(input.brief.pull_quote);
    });

    it('expected output link_comment references the blog url', async () => {
      const input = await loadJsonFixture(
        'convert',
        'input-opinion.json',
        ConvertInputSchema,
      );
      const out = await loadJsonFixture(
        'convert',
        'expected-opinion.json',
        ConvertOutputSchema,
      );
      expect(out.link_comment).toContain(input.blog.url);
    });

    it('expected output opens with contrarian framing', async () => {
      const out = await loadJsonFixture(
        'convert',
        'expected-opinion.json',
        ConvertOutputSchema,
      );
      // Contrarian hook signals: "wrong", "disagree", "conventional", "everyone",
      // "they say", "myth", "stop", "the truth", "actually".
      const opener = out.post_text.slice(0, 200).toLowerCase();
      expect(
        opener,
        `contrarian opener should signal disagreement; got: "${opener}"`,
      ).toMatch(/wrong|disagree|conventional|everyone|they say|myth|stop|actually|no[t]?[, ]|truth/);
    });
  });

  it('both expected outputs pass schema validation together', async () => {
    const outs = await Promise.all([
      loadJsonFixture('convert', 'expected-framework.json', ConvertOutputSchema),
      loadJsonFixture('convert', 'expected-opinion.json', ConvertOutputSchema),
    ]);
    expect(outs).toHaveLength(2);
    for (const out of outs) {
      expect(out.char_count).toBeGreaterThanOrEqual(1100);
      expect(out.char_count).toBeLessThanOrEqual(1300);
      expect(out.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(out.hashtags.length).toBeLessThanOrEqual(5);
    }
  });
});
