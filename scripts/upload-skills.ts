/**
 * upload-skills.ts — Register plugin skills with Anthropic Managed Agents.
 *
 * Scans skills/{name}/SKILL.md files, extracts frontmatter (name, description,
 * model, triggers), and either:
 *   - Prints what WOULD be uploaded (--dry-run, default for safety), OR
 *   - Calls the Anthropic API to register each skill (execution deferred to
 *     post-Phase-C once all 6 skills are authored).
 *
 * Expected skills (populated during Phase B + Phase C):
 *   linkedin-gen, linkedin-brief, linkedin-convert,
 *   linkedin-carousel, linkedin-validate, linkedin-schedule
 *
 * Usage:
 *   npx tsx scripts/upload-skills.ts             # dry-run (default)
 *   npx tsx scripts/upload-skills.ts --dry-run   # explicit dry-run
 *   npx tsx scripts/upload-skills.ts --upload    # real API call (Phase E6)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.enum(['sonnet', 'opus', 'haiku']),
  triggers: z.array(z.string().min(1)).min(1),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface DiscoveredSkill {
  skillDir: string;
  skillMdPath: string;
  frontmatter: SkillFrontmatter;
}

export interface UploadSkillsOptions {
  skillsDir: string;
  dryRun: boolean;
}

export function parseFrontmatter(source: string, path: string): SkillFrontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || match[1] === undefined) {
    throw new Error(`SKILL.md missing YAML frontmatter: ${path}`);
  }
  const body = match[1];
  const raw: Record<string, unknown> = {};

  for (const line of body.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      raw[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter((s) => s.length > 0);
    } else {
      raw[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  const parsed = SkillFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `SKILL.md frontmatter invalid at ${path}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}

export async function discoverSkills(skillsDir: string): Promise<DiscoveredSkill[]> {
  const absDir = resolve(skillsDir);
  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const skills: DiscoveredSkill[] = [];
  for (const entry of entries.sort()) {
    const skillDir = join(absDir, entry);
    const s = await stat(skillDir);
    if (!s.isDirectory()) continue;
    const skillMdPath = join(skillDir, 'SKILL.md');
    try {
      const content = await readFile(skillMdPath, 'utf8');
      skills.push({
        skillDir,
        skillMdPath,
        frontmatter: parseFrontmatter(content, skillMdPath),
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
  return skills;
}

export async function uploadSkills(options: UploadSkillsOptions): Promise<DiscoveredSkill[]> {
  const skills = await discoverSkills(options.skillsDir);

  if (options.dryRun) {
    process.stdout.write(`[DRY RUN] Discovered ${skills.length} skill(s) in ${resolve(options.skillsDir)}:\n`);
    for (const { frontmatter, skillMdPath } of skills) {
      process.stdout.write(
        `  ${frontmatter.name} (model=${frontmatter.model}, triggers=[${frontmatter.triggers.join(', ')}]) -> ${skillMdPath}\n`,
      );
    }
    if (skills.length === 0) {
      process.stdout.write('  (no skills yet — skills land in Phase B + Phase C)\n');
    }
    return skills;
  }

  throw new Error(
    'Non-dry-run upload not implemented. Managed Agents upload is deferred to Phase E6 — once all 6 skills are authored (Phases B1-B5 + C2), revisit this branch to wire the Anthropic API call.',
  );
}

async function runCli(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const scriptDir = dirname(__filename);
  const rootDir = resolve(scriptDir, '..');
  const skillsDir = join(rootDir, 'skills');
  const dryRun = !process.argv.includes('--upload');

  await uploadSkills({ skillsDir, dryRun });
  process.stdout.write('Done.\n');
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runCli().catch((err: unknown) => {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`upload-skills failed: ${message}\n`);
    process.exit(1);
  });
}
