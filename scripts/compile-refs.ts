/**
 * compile-refs.ts — Build per-skill compiled reference files for LinkedIn plugin.
 *
 * Reads raw playbook files from docs/rag/linkedin-playbook/ and produces 4 merged
 * bundles in references/compiled/ for injection via --append-system-prompt-file
 * (zero Read tool calls during skill execution).
 *
 * Mapping (from docs/plans/2026-04-23-plugin-architecture-full-auto.md Appendix A):
 *   refs-linkedin-playbook.md  ← 01-main-playbook.md + 05-hashtags-timing-language.md
 *   refs-linkedin-templates.md ← 02-templates-hooks.md
 *   refs-linkedin-formats.md   ← 04-media-format-decision.md
 *   refs-linkedin-carousel.md  ← 06-carousel-design.md
 *
 * Usage:
 *   npx tsx scripts/compile-refs.ts
 *   // or programmatically:
 *   import { compileRefs } from './scripts/compile-refs.js';
 *   await compileRefs({ inputDir, outputDir });
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface CompileRefsOptions {
  inputDir: string;
  outputDir: string;
}

interface BundleSpec {
  outputFile: string;
  purpose: string;
  sources: string[];
}

const BUNDLES: BundleSpec[] = [
  {
    outputFile: 'refs-linkedin-playbook.md',
    purpose: 'Playbook (algorithm mechanics + hashtags/timing)',
    sources: ['01-main-playbook.md', '05-hashtags-timing-language.md'],
  },
  {
    outputFile: 'refs-linkedin-templates.md',
    purpose: 'Templates + Hooks (12 hook formulas, 7 post structures, CTA bank)',
    sources: ['02-templates-hooks.md'],
  },
  {
    outputFile: 'refs-linkedin-formats.md',
    purpose: 'Format Decision (text vs carousel vs video matrix)',
    sources: ['04-media-format-decision.md'],
  },
  {
    outputFile: 'refs-linkedin-carousel.md',
    purpose: 'Carousel Design (slide structure, typography, safe zones)',
    sources: ['06-carousel-design.md'],
  },
];

function buildHeader(purpose: string): string {
  return [
    `# LinkedIn Generation Reference — ${purpose}`,
    '',
    'Compiled for `--append-system-prompt-file` injection into LinkedIn skill runs.',
    'Do NOT read these files with the Read tool — they are already in the system prompt.',
    '',
  ].join('\n');
}

function buildSeparator(sourceFile: string): string {
  const name = basename(sourceFile, '.md');
  return ['', '---', '', `## Reference: ${name}`, '', ''].join('\n');
}

async function ensureFile(path: string): Promise<void> {
  try {
    const s = await stat(path);
    if (!s.isFile()) {
      throw new Error(`expected file, got directory: ${path}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`source file not found: ${path}`);
    }
    throw err;
  }
}

async function buildBundle(
  inputDir: string,
  outputDir: string,
  spec: BundleSpec,
): Promise<{ file: string; bytes: number }> {
  const parts: string[] = [buildHeader(spec.purpose)];

  for (const source of spec.sources) {
    const srcPath = join(inputDir, source);
    await ensureFile(srcPath);
    const content = await readFile(srcPath, 'utf8');
    parts.push(buildSeparator(source));
    parts.push(content.trimEnd());
    parts.push('');
  }

  const body = parts.join('\n');
  const outPath = join(outputDir, spec.outputFile);
  await writeFile(outPath, body, 'utf8');
  const s = await stat(outPath);
  return { file: spec.outputFile, bytes: s.size };
}

export async function compileRefs(options: CompileRefsOptions): Promise<void> {
  const inputDir = resolve(options.inputDir);
  const outputDir = resolve(options.outputDir);

  await mkdir(outputDir, { recursive: true });

  for (const spec of BUNDLES) {
    await buildBundle(inputDir, outputDir, spec);
  }
}

async function runCli(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const scriptDir = dirname(__filename);
  const rootDir = resolve(scriptDir, '..');
  const inputDir = join(rootDir, 'docs', 'rag', 'linkedin-playbook');
  const outputDir = join(rootDir, 'references', 'compiled');

  await mkdir(outputDir, { recursive: true });

  const results: Array<{ file: string; bytes: number }> = [];
  for (const spec of BUNDLES) {
    const res = await buildBundle(inputDir, outputDir, spec);
    results.push(res);
  }

  process.stdout.write('Compiled reference files:\n');
  for (const { file, bytes } of results) {
    process.stdout.write(`  ${file}: ${bytes} bytes\n`);
  }
  process.stdout.write('Done.\n');
}

// CLI entrypoint: only run when executed directly via tsx/node, not when imported.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runCli().catch((err: unknown) => {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`compile-refs failed: ${message}\n`);
    process.exit(1);
  });
}
