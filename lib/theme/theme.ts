// The theme choice (MOM-30). With no choice the app follows the device (prefers-color-scheme in app/globals.css, no script).
// A person who picks "Light" or "Dark" in Settings gets a cookie that holds only that one word; the root layout reads it on the
// server and sets data-theme on <html>, so the first paint is already the right theme. "Match my device" removes the cookie.
// Pure: no browser or server API here, so the screen, the action and the tests share one definition.

export const THEME_COOKIE = 'momentum-theme';
// A year, in seconds: the choice is a preference, not a session.
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type StoredTheme = 'light' | 'dark';
export type ThemeChoice = StoredTheme | 'system';

export const THEME_CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// What a cookie value means: a stored theme, or null for anything else (no cookie, a damaged value), which is "match my device".
export function storedTheme(value: string | null | undefined): StoredTheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}
