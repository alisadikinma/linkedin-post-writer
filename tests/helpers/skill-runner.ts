/**
 * skill-runner.ts — Contract-mode helper for skill tests.
 *
 * IMPORTANT: This is NOT a subprocess runner. Phase B1+ skill tests validate
 * the SKILL.md contract (frontmatter shape, prompt body completeness) and
 * golden fixtures (hand-authored expected JSON outputs that pass the Zod
 * schema + business rules). Real LLM inference happens in production via
 * `claude -p "/linkedin-gen {id}" --append-system-prompt-file refs-*.md`
 * — not during tests. Phase B6 manual smoke test exercises the real pipeline.
 *
 * Design rationale (from Phase B1 executor instructions):
 *   - Tests must complete in milliseconds, for free, deterministically
 *   - Spawning `claude -p` in tests: slow, expensive, flaky, API-auth-gated
 *   - SDK-driven tests: still LLM inference, still non-deterministic
 *   - Contract + golden fixtures: fast, cheap, strict — exactly what TDD wants
 *
 * This helper exposes three primitives:
 *   1. loadSkillMd — read + parse frontmatter (reuses upload-skills.ts parser
 *      for single-source-of-truth)
 *   2. loadFixture — read raw fixture content (markdown blog inputs)
 *   3. loadJsonFixture — read JSON fixture + validate against Zod schema
 *      (expected outputs)
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';

import {
  parseFrontmatter,
  type SkillFrontmatter,
} from '../../scripts/upload-skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Repository root (two levels up from tests/helpers/).
 */
const REPO_ROOT = resolve(__dirname, '..', '..');

export interface LoadedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  path: string;
}

/**
 * Load a SKILL.md file, split frontmatter from body, and validate the
 * frontmatter against the shared `SkillFrontmatterSchema` (same schema used by
 * `scripts/upload-skills.ts` so test + upload stay in lockstep).
 *
 * @param skillName directory name under `skills/` (e.g. "linkedin-brief")
 * @throws if SKILL.md is missing, frontmatter is malformed, or schema fails
 */
export async function loadSkillMd(skillName: string): Promise<LoadedSkill> {
  const path = resolve(REPO_ROOT, 'skills', skillName, 'SKILL.md');
  const source = await readFile(path, 'utf8');
  const frontmatter = parseFrontmatter(source, path);

  // Strip the frontmatter block so tests can assert on body content
  const bodyMatch = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  const body = bodyMatch && bodyMatch[1] !== undefined ? bodyMatch[1] : '';

  return { frontmatter, body, path };
}

/**
 * Load a raw fixture file (markdown, txt, anything non-JSON) from
 * `tests/fixtures/{skillName}/{fixtureName}`.
 *
 * @param skillName directory name under `tests/fixtures/` (e.g. "brief")
 * @param fixtureName filename with extension (e.g. "input-framework-blog.md")
 */
export async function loadFixture(
  skillName: string,
  fixtureName: string,
): Promise<string> {
  const path = resolve(
    REPO_ROOT,
    'tests',
    'fixtures',
    skillName,
    fixtureName,
  );
  return readFile(path, 'utf8');
}

/**
 * Load a JSON fixture and validate it against the provided Zod schema. Throws
 * with a verbose, actionable error (includes the fixture path + Zod issue
 * summary) if validation fails — this is how we keep golden fixtures honest
 * as the schema evolves.
 *
 * @param skillName directory name under `tests/fixtures/`
 * @param fixtureName filename with .json extension
 * @param schema Zod schema the fixture must satisfy
 */
export async function loadJsonFixture<T>(
  skillName: string,
  fixtureName: string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const path = resolve(
    REPO_ROOT,
    'tests',
    'fixtures',
    skillName,
    fixtureName,
  );
  const raw = await readFile(path, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in fixture ${path}: ${message}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(
      `Fixture ${path} failed schema validation: ${issues}`,
    );
  }
  return result.data;
}
