import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const HOOK_PATH = join(ROOT, 'hooks', 'session-start.sh');
const HOOKS_JSON = join(ROOT, 'hooks', 'hooks.json');

describe('session-start hook', () => {
  it('session-start.sh exists and is a regular file', async () => {
    const s = await stat(HOOK_PATH);
    expect(s.isFile()).toBe(true);
  });

  it('announces plugin name and all 6 skills', async () => {
    const content = await readFile(HOOK_PATH, 'utf8');
    expect(content).toMatch(/^#!\/bin\/bash/);
    expect(content).toContain('linkedin-post-writer loaded');
    for (const skill of [
      'linkedin-gen',
      'linkedin-brief',
      'linkedin-convert',
      'linkedin-carousel',
      'linkedin-validate',
      'linkedin-schedule',
    ]) {
      expect(content).toContain(skill);
    }
  });

  it('announces linkedin-writer agent', async () => {
    const content = await readFile(HOOK_PATH, 'utf8');
    expect(content).toContain('linkedin-writer');
  });

  it('hooks.json registers SessionStart with correct matcher and command path', async () => {
    const raw = await readFile(HOOKS_JSON, 'utf8');
    const parsed = JSON.parse(raw) as {
      hooks: { SessionStart: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
    };
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    const entry = parsed.hooks.SessionStart[0];
    expect(entry?.matcher).toBe('startup|resume|clear|compact');
    expect(entry?.hooks[0]?.type).toBe('command');
    expect(entry?.hooks[0]?.command).toBe('${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh');
  });
});
