import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile, rm, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileRefs } from '../scripts/compile-refs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INPUT_DIR = join(ROOT, 'docs', 'rag', 'linkedin-playbook');
const OUTPUT_DIR = join(ROOT, 'tmp', 'test-compiled');

const EXPECTED_OUTPUTS = [
  'refs-linkedin-playbook.md',
  'refs-linkedin-templates.md',
  'refs-linkedin-formats.md',
];

describe('compileRefs', () => {
  beforeAll(async () => {
    if (existsSync(OUTPUT_DIR)) {
      await rm(OUTPUT_DIR, { recursive: true, force: true });
    }
    await mkdir(OUTPUT_DIR, { recursive: true });
    await compileRefs({ inputDir: INPUT_DIR, outputDir: OUTPUT_DIR });
  });

  afterAll(async () => {
    if (existsSync(OUTPUT_DIR)) {
      await rm(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('produces all 3 expected output files (post-v0.5.0 — carousel bundle retired)', async () => {
    for (const name of EXPECTED_OUTPUTS) {
      const path = join(OUTPUT_DIR, name);
      expect(existsSync(path), `missing output file: ${name}`).toBe(true);
      const s = await stat(path);
      expect(s.size, `file too small: ${name}`).toBeGreaterThan(500);
    }
  });

  it('does NOT produce refs-linkedin-carousel.md (retired in v0.5.0)', async () => {
    const path = join(OUTPUT_DIR, 'refs-linkedin-carousel.md');
    expect(existsSync(path)).toBe(false);
  });

  it('refs-linkedin-playbook.md merges 01-main-playbook + 05-hashtags-timing-language', async () => {
    const compiled = await readFile(join(OUTPUT_DIR, 'refs-linkedin-playbook.md'), 'utf8');
    const src01 = await readFile(join(INPUT_DIR, '01-main-playbook.md'), 'utf8');
    const src05 = await readFile(join(INPUT_DIR, '05-hashtags-timing-language.md'), 'utf8');

    // Spot-check: Depth Score comes from 01
    expect(compiled).toContain('Depth Score');
    // Hashtag/timing content comes from 05
    expect(compiled.toLowerCase()).toContain('hashtag');

    // Assert both source files' headers appear
    const src01FirstHeader = src01.split('\n').find((l) => l.startsWith('# '));
    const src05FirstHeader = src05.split('\n').find((l) => l.startsWith('# '));
    if (src01FirstHeader) {
      expect(compiled).toContain(src01FirstHeader);
    }
    if (src05FirstHeader) {
      expect(compiled).toContain(src05FirstHeader);
    }

    // Section markers for merged files
    expect(compiled).toContain('## Reference: 01-main-playbook');
    expect(compiled).toContain('## Reference: 05-hashtags-timing-language');

    // Prepended standard header
    expect(compiled).toMatch(/^# LinkedIn Generation Reference/);
    expect(compiled).toContain('--append-system-prompt-file');
  });

  it('refs-linkedin-templates.md contains 02-templates-hooks content', async () => {
    const compiled = await readFile(join(OUTPUT_DIR, 'refs-linkedin-templates.md'), 'utf8');
    const src = await readFile(join(INPUT_DIR, '02-templates-hooks.md'), 'utf8');
    const firstHeader = src.split('\n').find((l) => l.startsWith('# '));
    if (firstHeader) {
      expect(compiled).toContain(firstHeader);
    }
    expect(compiled).toContain('## Reference: 02-templates-hooks');
    expect(compiled).toMatch(/^# LinkedIn Generation Reference/);
  });

  it('refs-linkedin-formats.md contains 04-media-format-decision content', async () => {
    const compiled = await readFile(join(OUTPUT_DIR, 'refs-linkedin-formats.md'), 'utf8');
    const src = await readFile(join(INPUT_DIR, '04-media-format-decision.md'), 'utf8');
    const firstHeader = src.split('\n').find((l) => l.startsWith('# '));
    if (firstHeader) {
      expect(compiled).toContain(firstHeader);
    }
    expect(compiled).toContain('## Reference: 04-media-format-decision');
    expect(compiled).toMatch(/^# LinkedIn Generation Reference/);
  });

  // refs-linkedin-carousel.md was retired in v0.5.0 — carousel design specs
  // moved to the universal /carousel-gen engine plugin (refs-carousel-gen-pipeline.md).
  // Test removed.

  it('creates outputDir when it does not exist', async () => {
    const throwaway = join(ROOT, 'tmp', 'test-compiled-ephemeral');
    if (existsSync(throwaway)) {
      await rm(throwaway, { recursive: true, force: true });
    }
    try {
      await compileRefs({ inputDir: INPUT_DIR, outputDir: throwaway });
      expect(existsSync(throwaway)).toBe(true);
      for (const name of EXPECTED_OUTPUTS) {
        expect(existsSync(join(throwaway, name))).toBe(true);
      }
    } finally {
      if (existsSync(throwaway)) {
        await rm(throwaway, { recursive: true, force: true });
      }
    }
  });
});
