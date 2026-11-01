// .claude/settings.json must deny the unfiltered Supabase status command and allow the keyless replacement
// (MOM-124 part 1), so an agent is never one unfiltered command away from printing the local stack's demo keys
// (F-047, F-049, F-051, F-057).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const settings = JSON.parse(readFileSync(join(process.cwd(), '.claude', 'settings.json'), 'utf8'));

describe('.claude/settings.json permissions', () => {
  it('denies the unfiltered supabase status command, in both the bare and npx forms', () => {
    expect(settings.permissions.deny).toContain('Bash(supabase status*)');
    expect(settings.permissions.deny).toContain('Bash(npx supabase status*)');
  });

  it('allows the keyless stack check without a prompt', () => {
    expect(settings.permissions.allow).toContain('Bash(npm run stack:status)');
  });

  it('allows the repository check without a prompt (MOM-124 item d)', () => {
    expect(settings.permissions.allow).toContain('Bash(npm run project:check)');
  });

  it('keeps every existing ask entry (push, db push, env, pr merge)', () => {
    expect(settings.permissions.ask).toEqual(
      expect.arrayContaining([
        'Bash(git push *)',
        'Bash(supabase db push *)',
        'Bash(npx supabase db push *)',
        'Bash(vercel env *)',
        'Bash(npx vercel env *)',
        'Bash(gh pr merge *)',
      ]),
    );
  });
});
