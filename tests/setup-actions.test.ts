// The two Server Actions of guided setup (app/actions/setup.ts, MOM-111) are thin: they hand the conversation to the service
// as it came (it is `unknown`; the service parses and authenticates) and give back what it answers. One thing is pinned
// because the browser test found it the hard way: the save action must NOT revalidate any path. Next refreshes the page the
// person is on after a Server Action that does, and the refreshed /setup page (which sees that setup is already done) would
// replace the "Your setup is saved" message at once.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), take: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/lib/services/setup', () => ({ saveApprovedSetup: mocks.save, takeSetupTurn: mocks.take }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { askSetupTurn, saveSetup } from '@/app/actions/setup';

beforeEach(() => {
  mocks.save.mockReset();
  mocks.take.mockReset();
  mocks.revalidatePath.mockReset();
});

describe('guided setup actions', () => {
  it('askSetupTurn gives the conversation to the service untouched and returns its answer', async () => {
    const raw = { anything: 'at all' };
    mocks.take.mockResolvedValue({ ok: true, data: { kind: 'wait', message: 'm', retryAfterSeconds: 1 } });
    expect(await askSetupTurn(raw)).toEqual({ ok: true, data: { kind: 'wait', message: 'm', retryAfterSeconds: 1 } });
    expect(mocks.take).toHaveBeenCalledWith(raw);
  });

  it.each([
    [{ ok: true, data: { goals: 1, targets: 2 } }],
    [{ ok: false, error: 'Could not save your setup. Nothing was saved.' }],
  ])('saveSetup returns the service\'s answer and refreshes no page: %j', async (answer) => {
    mocks.save.mockResolvedValue(answer);
    const session = { transcript: [] };
    expect(await saveSetup(session, true)).toEqual(answer);
    expect(mocks.save).toHaveBeenCalledWith(session, true);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not import or call revalidatePath at all', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'actions', 'setup.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/revalidatePath|next\/cache/);
  });
});
