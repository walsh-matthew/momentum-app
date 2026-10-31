// @vitest-environment jsdom
//
// MOM-30: the light / dark / system choice. The Settings control changes data-theme on <html> at once and saves the cookie in the
// background; the action refuses anything but the three words and keeps nothing but "light" or "dark" in the cookie.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeChoice } from '@/components/settings/ThemeChoice';
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from '@/lib/theme/theme';

const { setThemeChoice, jar } = vi.hoisted(() => ({
  setThemeChoice: vi.fn(async (_choice: unknown): Promise<{ ok: boolean }> => ({ ok: true })),
  jar: { set: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/app/actions/theme', () => ({ setThemeChoice }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));

beforeEach(() => {
  setThemeChoice.mockClear();
  setThemeChoice.mockImplementation(async () => ({ ok: true }));
  delete document.documentElement.dataset.theme;
});
afterEach(cleanup);

const radio = (name: string) => screen.getByRole('radio', { name });

describe('the Settings control', () => {
  it('offers match my device, light and dark, with the saved one selected', () => {
    render(<ThemeChoice initial="dark" />);
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Match my device', 'Light', 'Dark']);
    expect(radio('Dark').getAttribute('aria-checked')).toBe('true');
    expect(radio('Light').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
  });

  it('every choice is at least 44px tall to tap', () => {
    render(<ThemeChoice initial="system" />);
    for (const r of screen.getAllByRole('radio')) expect(r.className).toContain('min-h-11');
  });

  it('light changes the page at once and saves the choice; match my device removes both', async () => {
    render(<ThemeChoice initial="system" />);
    fireEvent.click(radio('Light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(radio('Light').getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(setThemeChoice).toHaveBeenCalledWith('light'));
    // The settled state (MOM-96): the save is called before its transition ends, and the buttons stay disabled until it does, so a
    // tap before then is dropped. Under a full run's load that tap came too early (day-end 2026-10-31).
    await waitFor(() => expect((radio('Match my device') as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(radio('Match my device'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await waitFor(() => expect(setThemeChoice).toHaveBeenLastCalledWith('system'));
  });

  it('puts the choice back and says so when it could not be saved', async () => {
    setThemeChoice.mockImplementation(async () => ({ ok: false }));
    render(<ThemeChoice initial="dark" />);
    document.documentElement.dataset.theme = 'dark';
    fireEvent.click(radio('Light'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    // The settled state (MOM-96): the choice is back and the buttons can be tapped again, not only the alert.
    const dark = (await screen.findByRole('radio', { name: 'Dark', checked: true })) as HTMLButtonElement;
    expect(dark.disabled).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('does nothing when the chosen one is tapped again', () => {
    render(<ThemeChoice initial="dark" />);
    fireEvent.click(radio('Dark'));
    expect(setThemeChoice).not.toHaveBeenCalled();
  });
});

describe('the action', () => {
  beforeEach(() => {
    jar.set.mockClear();
    jar.delete.mockClear();
  });

  it('keeps one cookie that holds only light or dark, for a year, not readable by scripts', async () => {
    const { setThemeChoice: save } = await vi.importActual<typeof import('@/app/actions/theme')>('@/app/actions/theme');
    expect(await save('dark')).toEqual({ ok: true });
    expect(jar.set).toHaveBeenCalledWith(THEME_COOKIE, 'dark', expect.objectContaining({ path: '/', maxAge: THEME_COOKIE_MAX_AGE, sameSite: 'lax', httpOnly: true }));
    expect(await save('light')).toEqual({ ok: true });
    expect(jar.set).toHaveBeenLastCalledWith(THEME_COOKIE, 'light', expect.anything());
  });

  it('"system" removes the cookie, and anything else is refused without touching it', async () => {
    const { setThemeChoice: save } = await vi.importActual<typeof import('@/app/actions/theme')>('@/app/actions/theme');
    expect(await save('system')).toEqual({ ok: true });
    expect(jar.delete).toHaveBeenCalledWith(THEME_COOKIE);
    for (const bad of ['', 'auto', 'Dark', null, undefined, 1, { theme: 'dark' }]) expect(await save(bad)).toEqual({ ok: false });
    expect(jar.set).not.toHaveBeenCalled();
  });
});
