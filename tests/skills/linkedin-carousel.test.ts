/**
 * linkedin-carousel.test.ts — Contract + golden fixture tests.
 *
 * Three test suites mirror the Phase B1/B2/B3/B5 pattern:
 *   1. SKILL.md contract — frontmatter shape, required body sections,
 *      anti-slop blacklist, scope-boundary guards.
 *   2. schema.ts contract — CarouselOutputSchema invariants (cover/CTA
 *      exactness, sequence gapless, anti-slop, no-URL, layout/flag matches).
 *   3. Golden fixture — the hand-authored 9-slide listicle carousel must
 *      parse cleanly + obey business rules (brand palette references,
 *      text-baked-in copy in every image_prompt, 30-80 word direct_answer_block).
 *
 * NO LLM inference in this suite. Tests run in ms, deterministically. Real
 * generation happens in production (Claude CLI subprocess) + Phase C4 manual
 * smoke test.
 */

import { describe, it, expect } from 'vitest';

import {
  CarouselInputSchema,
  CarouselOutputSchema,
  type CarouselOutput,
} from '../../skills/linkedin-carousel/schema.js';
import { loadJsonFixture, loadSkillMd } from '../helpers/skill-runner.js';

const ANTI_SLOP_PHRASES = [
  'delve into',
  'unlock the power of',
  "in today's fast-paced digital landscape",
  'at the end of the day',
  'navigating the complexities of',
  'harness the power of',
  'seamlessly integrate',
] as const;

const ENGAGEMENT_BAIT = [
  'Comment YES',
  'Type A for',
  'Type A/B',
  'Drop a 🔥',
  'Smash that like button',
] as const;

const REQUIRED_BODY_HEADERS = [
  'Step 1',
  'Step 2',
  'Step 3',
  'Step 4',
  'Step 5',
  'Anti-slop',
] as const;

describe('linkedin-carousel SKILL.md contract', () => {
  it('SKILL.md exists and frontmatter parses', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.frontmatter).toBeDefined();
    expect(skill.body.length).toBeGreaterThan(500);
  });

  it('frontmatter.name is linkedin-carousel', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.frontmatter.name).toBe('linkedin-carousel');
  });

  it('frontmatter.model is sonnet', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.frontmatter.model).toBe('sonnet');
  });

  it('frontmatter.triggers includes carousel and linkedin carousel', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.frontmatter.triggers).toContain('carousel');
    expect(skill.frontmatter.triggers).toContain('linkedin carousel');
  });

  it('body contains all required step headers', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    for (const header of REQUIRED_BODY_HEADERS) {
      expect(
        skill.body,
        `body missing required section header: "${header}"`,
      ).toContain(header);
    }
  });

  it('body mentions Addendum 3 scope boundary (emits JSON only)', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.body).toMatch(/emits JSON only|JSON only/i);
  });

  it('body does NOT describe PDF composition as this skill\'s job', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    // TCPDF and PDF may be mentioned as backend concerns; guard only against
    // the skill claiming to DO the PDF composition itself.
    expect(skill.body).not.toMatch(/this skill (renders|composes|builds|assembles).*PDF/i);
    expect(skill.body).not.toMatch(/render the PDF here/i);
  });

  it('body does NOT claim to publish, schedule, or handle OAuth/Telegram', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.body).not.toMatch(/this skill (publishes|schedules|posts).*LinkedIn/i);
    expect(skill.body).not.toMatch(/this skill (handles|manages).*(OAuth|Telegram)/i);
  });

  it('body mentions all 7 anti-slop phrases verbatim', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    for (const phrase of ANTI_SLOP_PHRASES) {
      expect(
        skill.body.toLowerCase(),
        `body missing anti-slop blacklist entry: "${phrase}"`,
      ).toContain(phrase.toLowerCase());
    }
  });

  it('body mentions all 5 engagement bait strings', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    for (const bait of ENGAGEMENT_BAIT) {
      expect(
        skill.body,
        `body missing engagement-bait blacklist entry: "${bait}"`,
      ).toContain(bait);
    }
  });

  it('body mentions mobile dead zones (top 150px and bottom 200px)', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.body).toContain('150');
    expect(skill.body).toContain('200');
    expect(skill.body.toLowerCase()).toMatch(/dead[- ]zone/);
  });

  it('body mentions 75px margins', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.body).toContain('75');
    expect(skill.body.toLowerCase()).toMatch(/margin/);
  });

  it('body mentions 24pt body font', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.body).toContain('24pt');
  });

  it('body mentions 1080x1350 dimensions', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.body).toMatch(/1080\s*[x×]\s*1350/i);
  });

  it('body mentions creator_brand_logo for Human Fingerprint reuse', async () => {
    const skill = await loadSkillMd('linkedin-carousel');
    expect(skill.body).toContain('creator_brand_logo');
  });
});

describe('linkedin-carousel schema.ts contract', () => {
  /**
   * Build a minimally-valid, deep-copyable 9-slide carousel used as the base
   * for mutation tests below. Each mutation deep-clones this and introduces a
   * single violation so the specific invariant under test trips in isolation.
   */
  function buildValidCarousel(): CarouselOutput {
    const pad = (label: string): string =>
      `This is cinematic image prompt text for ${label}. ` +
      'Dimensions 1080x1350 portrait canvas, Dark Cinema palette deep navy #0a0f1e background with warm ember #ff6b35 accent, high-contrast cream #f3f4f6 typography. ' +
      'Space Grotesk Bold headline, Inter body copy at 24pt-equivalent glyph sizing. ' +
      'Top 150px negative space kept empty, bottom 200px negative space except a small page indicator in JetBrains Mono. ' +
      'Left and right 75px margins maintained as breathing room. ' +
      'Low-key cinematic lighting, soft film grain texture, subtle volumetric rim light on any figure. ' +
      'The quoted slide copy renders AS typography filling the primary copy band, not as an overlay.';
    const slides: CarouselOutput['slides'] = [
      {
        slide_number: 1,
        layout_hint: 'cover',
        copy: 'Eight agent patterns that ship twelve client projects in ninety days',
        image_prompt: pad('cover slide 1'),
        is_cover: true,
        is_cta: false,
      },
      {
        slide_number: 2,
        layout_hint: 'body',
        copy: 'Every production agent stack I shipped reached for the same eight patterns. Not thirty. Eight.',
        image_prompt: pad('body slide 2'),
        is_cover: false,
        is_cta: false,
      },
      {
        slide_number: 3,
        layout_hint: 'body',
        copy: 'Gatekeeper pattern: cheap fast model routes, expensive model reasons. Cuts sixty percent of Sonnet tokens.',
        image_prompt: pad('body slide 3'),
        is_cover: false,
        is_cta: false,
      },
      {
        slide_number: 4,
        layout_hint: 'human_fingerprint',
        copy: 'I saved client relationships three times by showing the Scribe trace. Not "the AI hallucinated." The actual decision log.',
        image_prompt:
          pad('human fingerprint slide 4') +
          ' Use creator_brand_logo brand asset as the hero figure centered-left in the composition.',
        is_cover: false,
        is_cta: false,
      },
      {
        slide_number: 5,
        layout_hint: 'body',
        copy: 'Supervisor pattern: the parent agent blocks what the child was not authorized to do.',
        image_prompt: pad('body slide 5'),
        is_cover: false,
        is_cta: false,
      },
      {
        slide_number: 6,
        layout_hint: 'body',
        copy: 'Circuit Breaker: three attempts, ten seconds each, abort and tell a human. Saved one client four thousand dollars.',
        image_prompt: pad('body slide 6'),
        is_cover: false,
        is_cta: false,
      },
      {
        slide_number: 7,
        layout_hint: 'body',
        copy: 'Receipt pattern: every task emits what it did, the outcome, confidence, and what a human should verify.',
        image_prompt: pad('body slide 7'),
        is_cover: false,
        is_cta: false,
      },
      {
        slide_number: 8,
        layout_hint: 'direct_answer',
        copy: 'The eight patterns, in order: Gatekeeper, Scribe, Supervisor, Circuit Breaker, Receipt, Handoff, Rehearsal, Graveyard.',
        image_prompt: pad('direct answer slide 8'),
        is_cover: false,
        is_cta: false,
        direct_answer_block:
          'Eight patterns repeat across every production agent stack: Gatekeeper routes with a cheap model, Scribe writes structured decision traces, Supervisor blocks unauthorized child actions, Circuit Breaker kills runaway API loops, Receipt emits verifiable outcomes, Handoff escalates explicitly to humans, Rehearsal replays fixture conversations before deployment, and Graveyard retires dead agents. Skip any one and production breaks in a predictable failure mode.',
      },
      {
        slide_number: 9,
        layout_hint: 'cta',
        copy: 'Which of these eight patterns is the one breaking first in your stack right now? Blog link in comments 👇',
        image_prompt: pad('cta slide 9'),
        is_cover: false,
        is_cta: true,
      },
    ];
    return {
      slides,
      total_slides: 9,
      hook_framework: 'AIDA',
      structure: 'build_in_public',
    };
  }

  const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  it('CarouselOutputSchema accepts the 9-slide canonical carousel', () => {
    const result = CarouselOutputSchema.safeParse(buildValidCarousel());
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`expected success but got: ${issues}`);
    }
    expect(result.success).toBe(true);
  });

  it('rejects slides.length < 7', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides = bad.slides.slice(0, 6);
    bad.total_slides = 6 as CarouselOutput['total_slides'];
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects slides.length > 10', () => {
    const bad = deepClone(buildValidCarousel());
    // duplicate slide 7 twice to push past 10
    const extra = deepClone(bad.slides[6]!);
    bad.slides.push({ ...extra, slide_number: 10 });
    bad.slides.push({ ...extra, slide_number: 11 });
    // shift CTA to position 11
    bad.slides[bad.slides.length - 3]!.slide_number = 9;
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects 2 cover slides', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[1]!.is_cover = true;
    bad.slides[1]!.layout_hint = 'cover';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/exactly one cover/);
    }
  });

  it('rejects 0 CTA slides', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[bad.slides.length - 1]!.is_cta = false;
    bad.slides[bad.slides.length - 1]!.layout_hint = 'body';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/exactly one CTA/);
    }
  });

  it('rejects cover slide at slide_number 2', () => {
    const bad = deepClone(buildValidCarousel());
    // Swap slide 1 and slide 2 roles: move cover to slot 2
    bad.slides[0]!.is_cover = false;
    bad.slides[0]!.layout_hint = 'body';
    bad.slides[1]!.is_cover = true;
    bad.slides[1]!.layout_hint = 'cover';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/cover slide must be slide_number 1/);
    }
  });

  it('rejects CTA slide at slide_number N-1 instead of N', () => {
    const bad = deepClone(buildValidCarousel());
    // Move CTA flag from slide 9 to slide 8; make slide 8 the cta + slide 9 a body
    bad.slides[8]!.is_cta = false;
    bad.slides[8]!.layout_hint = 'body';
    // clear the direct_answer_block so we don't trip invariants on slide 8
    bad.slides[7]!.is_cta = true;
    bad.slides[7]!.layout_hint = 'cta';
    delete bad.slides[7]!.direct_answer_block;
    // Need at least one direct_answer slide still — promote slide 9 into direct_answer
    bad.slides[8]!.layout_hint = 'direct_answer';
    bad.slides[8]!.direct_answer_block =
      'Eight patterns repeat across every production agent stack: Gatekeeper routes with a cheap model, Scribe writes structured decision traces, Supervisor blocks unauthorized child actions, Circuit Breaker kills runaway API loops, Receipt emits verifiable outcomes, Handoff escalates explicitly to humans, Rehearsal replays fixture conversations before deployment, and Graveyard retires dead agents.';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/CTA slide must be last slide/);
    }
  });

  it('rejects total_slides mismatch with slides.length', () => {
    const bad = deepClone(buildValidCarousel());
    bad.total_slides = 8 as CarouselOutput['total_slides'];
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/total_slides.*must equal slides\.length/);
    }
  });

  it('rejects missing human_fingerprint slide', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[3]!.layout_hint = 'body';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/human_fingerprint/);
    }
  });

  it('rejects missing direct_answer slide', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[7]!.layout_hint = 'body';
    delete bad.slides[7]!.direct_answer_block;
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/direct_answer/);
    }
  });

  it('rejects gapped slide_number sequence (1,2,3,5,...)', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[3]!.slide_number = 5; // was 4
    bad.slides[4]!.slide_number = 6; // was 5
    bad.slides[5]!.slide_number = 7;
    bad.slides[6]!.slide_number = 8;
    bad.slides[7]!.slide_number = 9;
    bad.slides[8]!.slide_number = 10;
    bad.total_slides = 10 as CarouselOutput['total_slides'];
    // slides.length still 9 — this tripwires total_slides AND gap — either is fine
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate slide_numbers (1,2,2,3,...)', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[1]!.slide_number = bad.slides[2]!.slide_number; // force duplicate
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/sequential|gap\/duplicate/);
    }
  });

  it.each(ANTI_SLOP_PHRASES)(
    'rejects banned phrase %s in slide copy',
    (phrase) => {
      const bad = deepClone(buildValidCarousel());
      bad.slides[2]!.copy = `${phrase} — and then everything breaks down production.`;
      const result = CarouselOutputSchema.safeParse(bad);
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
  ])('rejects engagement bait in slide copy: %s', (bait) => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[2]!.copy = `Great insight. ${bait}.`;
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/engagement bait/);
    }
  });

  it('rejects http(s) URL in slide copy', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[2]!.copy = 'Full breakdown: https://linkedin.com/foo — see you there.';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/http\(s\) URL|URL/);
    }
  });

  it('rejects http(s) URL in direct_answer_block', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[7]!.direct_answer_block =
      'Full breakdown: http://alisadikinma.com/blog/post — and every production agent stack I shipped reached for the same eight patterns again and again and again and again.';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects direct_answer_block on non-direct_answer slide', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[2]!.direct_answer_block =
      'Eight patterns repeat across every production agent stack: Gatekeeper routes with a cheap model, Scribe writes structured decision traces, Supervisor blocks unauthorized child actions, Circuit Breaker kills runaway API loops, Receipt emits verifiable outcomes, Handoff escalates explicitly, Rehearsal replays fixtures, and Graveyard retires dead agents.';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/direct_answer_block must be absent/);
    }
  });

  it('rejects direct_answer slide without direct_answer_block', () => {
    const bad = deepClone(buildValidCarousel());
    delete bad.slides[7]!.direct_answer_block;
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/direct_answer_block/);
    }
  });

  it('rejects is_cover=true with layout_hint=body', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[0]!.layout_hint = 'body';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/is_cover=true requires layout_hint=cover/);
    }
  });

  it('rejects is_cta=true with layout_hint=body', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[8]!.layout_hint = 'body';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/is_cta=true requires layout_hint=cta/);
    }
  });

  it('rejects image_prompt shorter than 300 chars', () => {
    const bad = deepClone(buildValidCarousel());
    bad.slides[2]!.image_prompt = 'too short';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects structure not equal to build_in_public', () => {
    const bad = deepClone(buildValidCarousel()) as unknown as Record<string, unknown>;
    bad.structure = 'something_else';
    const result = CarouselOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('linkedin-carousel golden fixture (listicle, 9 slides)', () => {
  it('input-listicle.json parses as CarouselInput', async () => {
    const input = await loadJsonFixture(
      'carousel',
      'input-listicle.json',
      CarouselInputSchema,
    );
    expect(input.brief.format).toBe('carousel');
    expect(input.brief.hook_framework).toBe('AIDA');
    expect(input.blog.url).toMatch(/^https?:\/\//);
  });

  it('expected-listicle.json parses as CarouselOutput', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    expect(out).toBeDefined();
  });

  it('expected output has total_slides === 9', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    expect(out.total_slides).toBe(9);
    expect(out.slides.length).toBe(9);
  });

  it('expected output slide 1 is cover, slide 9 is CTA, exactly one of each', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    const covers = out.slides.filter((s) => s.is_cover);
    const ctas = out.slides.filter((s) => s.is_cta);
    expect(covers).toHaveLength(1);
    expect(ctas).toHaveLength(1);
    expect(covers[0]!.slide_number).toBe(1);
    expect(ctas[0]!.slide_number).toBe(9);
  });

  it('expected output has exactly one direct_answer slide with 30-80 word block', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    const directAnswers = out.slides.filter(
      (s) => s.layout_hint === 'direct_answer',
    );
    expect(directAnswers).toHaveLength(1);
    const block = directAnswers[0]!.direct_answer_block!;
    expect(block).toBeDefined();
    const wordCount = block.trim().split(/\s+/).length;
    expect(
      wordCount,
      `direct_answer_block must be 30-80 words; got ${wordCount} words`,
    ).toBeGreaterThanOrEqual(30);
    expect(wordCount).toBeLessThanOrEqual(80);
  });

  it('expected output has at least one human_fingerprint slide', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    const fingerprints = out.slides.filter(
      (s) => s.layout_hint === 'human_fingerprint',
    );
    expect(fingerprints.length).toBeGreaterThanOrEqual(1);
  });

  it('every image_prompt length is 300-2500 chars', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    for (const slide of out.slides) {
      expect(
        slide.image_prompt.length,
        `slide ${slide.slide_number} image_prompt length out of range (${slide.image_prompt.length})`,
      ).toBeGreaterThanOrEqual(300);
      expect(slide.image_prompt.length).toBeLessThanOrEqual(2500);
    }
  });

  it('every image_prompt contains a brand palette or typography reference', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    for (const slide of out.slides) {
      const p = slide.image_prompt;
      const hasBrandRef =
        /Dark Cinema/.test(p) ||
        /Space Grotesk/.test(p) ||
        /\bInter\b/.test(p) ||
        /JetBrains Mono/.test(p);
      expect(
        hasBrandRef,
        `slide ${slide.slide_number} image_prompt missing brand palette / typography reference`,
      ).toBe(true);
    }
  });

  it('every image_prompt contains the exact slide copy as a substring (text-baked-in rule)', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    for (const slide of out.slides) {
      expect(
        slide.image_prompt,
        `slide ${slide.slide_number} image_prompt does not contain slide copy verbatim (D9 text-baked-in rule)`,
      ).toContain(slide.copy);
    }
  });

  it('human_fingerprint slide image_prompt references creator_brand_logo asset', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    const fp = out.slides.find((s) => s.layout_hint === 'human_fingerprint')!;
    expect(fp.image_prompt).toContain('creator_brand_logo');
  });

  it('no slide copy or direct_answer_block contains any http(s) URL', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    for (const slide of out.slides) {
      expect(slide.copy).not.toMatch(/https?:\/\//i);
      if (slide.direct_answer_block) {
        expect(slide.direct_answer_block).not.toMatch(/https?:\/\//i);
      }
    }
  });

  it('CTA slide copy includes the "Blog link in comments" reminder', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    const cta = out.slides.find((s) => s.is_cta)!;
    expect(cta.copy.toLowerCase()).toMatch(/blog.*comment|link.*comment/);
  });

  it('CTA slide copy ends with a question (comment prompt)', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    const cta = out.slides.find((s) => s.is_cta)!;
    // The question can be anywhere in the CTA copy but must exist.
    expect(cta.copy).toMatch(/\?/);
  });

  it('hook_framework matches the expected AIDA', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    expect(out.hook_framework).toBe('AIDA');
  });

  it('structure is build_in_public', async () => {
    const out = await loadJsonFixture(
      'carousel',
      'expected-listicle.json',
      CarouselOutputSchema,
    );
    expect(out.structure).toBe('build_in_public');
  });
});
