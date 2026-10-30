'use server';

import { cookies } from 'next/headers';
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, isThemeChoice } from '@/lib/theme/theme';

// Saves the person's light / dark / system choice (MOM-30) as one cookie holding only "light" or "dark"; "system" removes it.
// A Server Action can be reached by a direct POST, so the value is checked here and anything else is refused.
export async function setThemeChoice(choice: unknown): Promise<{ ok: boolean }> {
  if (!isThemeChoice(choice)) return { ok: false };
  const jar = await cookies();
  if (choice === 'system') {
    jar.delete(THEME_COOKIE);
  } else {
    jar.set(THEME_COOKIE, choice, {
      path: '/',
      maxAge: THEME_COOKIE_MAX_AGE,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return { ok: true };
}
