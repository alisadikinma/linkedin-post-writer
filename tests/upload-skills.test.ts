import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverSkills, uploadSkills } from '../scripts/upload-skills.js';

const TMP_ROOT = join(import.meta.dirname, '..', 'tmp', 'upload-skills-test');

async function writeSkill(dir: string, name: string, frontmatter: string): Promise<void> {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n# ${name}\n\nSkill body.\n`, 'utf8');
}

describe('upload-skills', () => {
  describe('discoverSkills', () => {
    const fixtureDir = join(TMP_ROOT, 'discover');

    beforeAll(async () => {
      await rm(fixtureDir, { recursive: true, force: true });
      await mkdir(fixtureDir, { recursive: true });
      await writeSkill(
        fixtureDir,
        'linkedin-brief',
        `name: linkedin-brief\ndescription: Blog to brief JSON.\nmodel: sonnet\ntriggers: [brief, linkedin brief]`,
      );
      await writeSkill(
        fixtureDir,
        'linkedin-convert',
        `name: linkedin-convert\ndescription: Brief and blog to native LinkedIn text post.\nmodel: sonnet\ntriggers: [convert, linkedin convert]`,
      );
    });

    afterAll(async () => {
      await rm(TMP_ROOT, { recursive: true, force: true });
    });

    it('returns all skills with valid frontmatter, sorted by directory name', async () => {
      const skills = await discoverSkills(fixtureDir);
      expect(skills).toHaveLength(2);
      expect(skills[0]?.frontmatter.name).toBe('linkedin-brief');
      expect(skills[1]?.frontmatter.name).toBe('linkedin-convert');
      expect(skills[0]?.frontmatter.model).toBe('sonnet');
      expect(skills[0]?.frontmatter.triggers).toEqual(['brief', 'linkedin brief']);
    });

    it('returns empty array when skills dir does not exist', async () => {
      const skills = await discoverSkills(join(TMP_ROOT, 'does-not-exist'));
      expect(skills).toEqual([]);
    });

    it('throws when SKILL.md has no frontmatter', async () => {
      const bad = join(TMP_ROOT, 'bad-missing-frontmatter');
      await mkdir(join(bad, 'linkedin-broken'), { recursive: true });
      await writeFile(join(bad, 'linkedin-broken', 'SKILL.md'), '# No frontmatter here\n\nBody.\n', 'utf8');
      await expect(discoverSkills(bad)).rejects.toThrow(/missing YAML frontmatter/);
    });

    it('throws when frontmatter model is unsupported', async () => {
      const bad = join(TMP_ROOT, 'bad-model');
      await writeSkill(
        bad,
        'linkedin-bad-model',
        `name: linkedin-bad-model\ndescription: Bad.\nmodel: gpt4\ntriggers: [x]`,
      );
      await expect(discoverSkills(bad)).rejects.toThrow(/frontmatter invalid/);
    });
  });

  describe('uploadSkills dry-run mode', () => {
    it('returns discovered skills without throwing and without network call', async () => {
      const fixtureDir = join(TMP_ROOT, 'dry-run');
      await rm(fixtureDir, { recursive: true, force: true });
      await writeSkill(
        fixtureDir,
        'linkedin-gen',
        `name: linkedin-gen\ndescription: Orchestrator.\nmodel: sonnet\ntriggers: [linkedin-gen]`,
      );

      const result = await uploadSkills({ skillsDir: fixtureDir, dryRun: true });
      expect(result).toHaveLength(1);
      expect(result[0]?.frontmatter.name).toBe('linkedin-gen');

      await rm(fixtureDir, { recursive: true, force: true });
    });

    it('handles empty skills dir gracefully (Phase A state)', async () => {
      const emptyDir = join(TMP_ROOT, 'empty');
      await mkdir(emptyDir, { recursive: true });
      const result = await uploadSkills({ skillsDir: emptyDir, dryRun: true });
      expect(result).toEqual([]);
      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe('uploadSkills non-dry-run', () => {
    it('throws a clear deferred-implementation error', async () => {
      const fixtureDir = join(TMP_ROOT, 'defer');
      await mkdir(fixtureDir, { recursive: true });
      await expect(uploadSkills({ skillsDir: fixtureDir, dryRun: false })).rejects.toThrow(
        /deferred to Phase E6/,
      );
      await rm(fixtureDir, { recursive: true, force: true });
    });
  });
});
