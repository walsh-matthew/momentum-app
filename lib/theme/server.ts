import { cookies } from 'next/headers';
import { THEME_COOKIE, storedTheme, type StoredTheme, type ThemeChoice } from './theme';

// The theme a person chose, read on the server (MOM-30): the root layout puts it on <html> so the page paints in it.
export async function getStoredTheme(): Promise<StoredTheme | null> {
  return storedTheme((await cookies()).get(THEME_COOKIE)?.value);
}

// The same, as the Settings control shows it: no cookie is "match my device".
export async function getThemeChoice(): Promise<ThemeChoice> {
  return (await getStoredTheme()) ?? 'system';
}
