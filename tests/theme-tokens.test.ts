// MOM-30: the light palette and the theme choice, read from app/globals.css.
// 1. Every colour token that is not an alias has a light value, and the light blocks hold nothing else.
// 2. The two light blocks (the device's light setting, and the "light" choice) are identical.
// 3. Dark is unchanged: every rule of today's stylesheet, with its tokens resolved to their dark values, equals the same rule in
//    tests/fixtures/globals.dark-baseline.css, the stylesheet as it was before the light palette, with its own tokens resolved.
//    The one deliberate exception is the surface of a card (its background, border and shadow): round 2 of the look review gave
//    every card one shared surface (tests/theme-cards.test.ts), so those four properties are not compared on a card.
// 4. The root layout and the cookie code agree on one word each.
// Pure: no browser, no network.

import { describe, expect, it } from 'vitest';
import { THEME_CHOICES, isThemeChoice, storedTheme } from '@/lib/theme/theme';
import { THEME_CHROME_COLOR, chromeColor } from '@/lib/theme/theme';
import { parseColour } from './helpers/color';
import { parseRules, readSheet, resolve, themeBlocks, declsOf, type CssRule } from './helpers/css';

const sheet = readSheet('app/globals.css');
const baseline = readSheet('tests/fixtures/globals.dark-baseline.css');
const blocks = themeBlocks(sheet);

// Not a colour, so it has no light value; and a token that is an alias of another one follows it.
const isAlias = (value: string) => /^var\(--[\w-]+\)$/.test(value);
const NOT_A_COLOUR = new Set(['color-scheme', '--radius']);
// The blocks whose surface round 2 changed on purpose, and the properties that make up a surface.
const CARD_SELECTORS = new Set([
  '.focus-card', '.channel-card', '.home-notice', '.home-goal', '.plan-goal', '.goal-card', '.connected-app-row', '.sidebar-goal',
  '.score-card', '.home-hero', '.connected-stack', '.sheet-surface', '.adaptive-sheet', '.goal-builder-banner',
]);
const SURFACE_PROPS = new Set(['background', 'background-color', 'border', 'box-shadow']);
// Round 4 gave every card heading one style (.card-title in app/globals.css; tests/theme-cards.test.ts). The three places the old
// stylesheet styled a card's heading by its position are the second deliberate exception to "dark is unchanged".
const HEADING_RULES_REMOVED = new Set(['.home-goal h3', '.plan-goal h3']);
const HEADING_RULES_RENAMED: Record<string, string> = { '.plan-section > h2': '.plan-section:not(.plan-goal) > h2' };
const HEADING_TYPE_PROPS_DROPPED: Record<string, Set<string>> = { '.goal-builder-copy h2': new Set(['font-size', 'font-weight', 'letter-spacing']) };

describe('the light palette (tokens)', () => {
  it('every colour token has a light value, and the light blocks add no token the dark block lacks', () => {
    const needsLight = Object.entries(blocks.dark)
      .filter(([name, value]) => !NOT_A_COLOUR.has(name) && !isAlias(value))
      .map(([name]) => name)
      .sort();
    const light = Object.keys(blocks.lightMedia).filter((name) => name !== 'color-scheme').sort();
    expect(light).toEqual(needsLight);
    expect(needsLight.length).toBeGreaterThan(60);
  });

  it('the light block for the device and the light block for the choice are the same, declaration for declaration', () => {
    expect(blocks.lightChoice).toEqual(blocks.lightMedia);
    expect(blocks.lightMedia['color-scheme']).toBe('light');
    expect(blocks.darkChoice['color-scheme']).toBe('dark');
  });

  it('follows the device by default: the root offers both schemes, and only the media query and the choice change tokens', () => {
    expect(blocks.dark['color-scheme']).toBe('light dark');
    const light = parseRules(sheet).filter((r) => r.path.join('|') === '@media (prefers-color-scheme: light)');
    expect(light.map((r) => r.selector)).toEqual([":root:not([data-theme='dark'])"]);
    // A person who chose dark keeps dark on a light device: the media block does not apply to data-theme="dark".
    expect(light[0].selector).toContain(":not([data-theme='dark'])");
  });
});

// MOM-145 changed dark on purpose, in the places named here and nowhere else: each is listed so the comparison below still fails for
// any other change. The card surface and the choice look are tokens and rules the old stylesheet did not have, so they are not compared.
// 1. A control's border: --ctl-min (0% -> 38%) and --input (white 12% -> 38%) lift every dark control border to 3:1.
const DARK_VALUES_BEFORE_MOM_145: Record<string, string> = { '--ctl-min': '0%', '--input': 'oklch(1 0 0 / 12%)' };
// 2. Tokens nothing uses any more are gone (--card was an alias of --panel).
const DARK_TOKENS_DROPPED = new Set(['--panel', '--card', '--surface-raised', '--surface-soft']);
const THEME_MAPPINGS_DROPPED = new Set(['--color-panel', '--color-card', '--color-surface-raised', '--color-surface-soft']);
// 3. The /plan day-kind selects take the field fill (the page colour sunk into the card) in place of --surface-raised.
// 4. /plan's .plan-button is outlined (the accent border, no fill, the ordinary text colour), not a tint of the accent.
const DECLS_CHANGED: Record<string, { to: string; before: string }> = {
  '.plan-kinds select|background': { to: 'var(--field-fill)', before: '#1b201f' },
  '.plan-button|border': { to: '1px solid var(--accent)', before: '1px solid rgb(198 243 109 / 35%)' },
  '.plan-button|background': { to: 'transparent', before: 'rgb(198 243 109 / 9%)' },
  '.plan-button|color': { to: 'var(--foreground)', before: '#c6f36d' },
};

describe('dark is unchanged', () => {
  const keyed = (rules: CssRule[], tokens: Record<string, string>, skip: (r: CssRule) => boolean) => {
    const seen = new Map<string, number>();
    return rules
      .filter((r) => !skip(r))
      .map((r) => {
        const base = `${r.path.join('|')}||${r.selector}`;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const surface = CARD_SELECTORS.has(r.selector);
        return [`${base}#${n}`, r.decls.filter(([p]) => !(surface && SURFACE_PROPS.has(p))).map(([p, v]) => [p, DECLS_CHANGED[`${r.selector}|${p}`]?.to === v ? DECLS_CHANGED[`${r.selector}|${p}`].before : resolve(v, tokens)])] as const;
      });
  };
  const isTokenRule = (r: CssRule) => r.selector.startsWith(':root');
  const NEW_RULES = new Set([
    '.ctl-border', '.ctl-20', '.ctl-30', '.ctl-45', '.primary-hover:hover',
    '.answer-choice', '.answer-choice:hover:not(:disabled)', '.answer-choice:active:not(:disabled)', '.field-input',
    // MOM-145: the hover of /plan's outlined button.
    '.plan-button:hover:not(:disabled)',
    '.card-title',
    // MOM-113 block 3.3: the weekly review's sitting after the recap. Written after the light palette, with tokens only, on the
    // shared card surface, so they have no pre-palette form to compare.
    '.review-sitting', '.review-card', '.review-card .home-note', '.review-card .review-line', '.review-choices', '.review-card .review-after',
  ]);
  const isSharedCard = (r: CssRule) => r.selector.startsWith('.card-surface,');

  const baselineRules = parseRules(baseline);
  const baselineRoot = declsOf(baselineRules.find((r) => r.selector === ':root')!);
  const darkBeforeMom145 = { ...blocks.dark, ...DARK_VALUES_BEFORE_MOM_145 };
  const now = keyed(parseRules(sheet), darkBeforeMom145, (r) => isTokenRule(r) || NEW_RULES.has(r.selector) || isSharedCard(r));
  const baselineNow = baselineRules
    .filter((r) => !HEADING_RULES_REMOVED.has(r.selector))
    .map((r) => ({ ...r, selector: HEADING_RULES_RENAMED[r.selector] ?? r.selector, decls: r.decls.filter(([p]) => !HEADING_TYPE_PROPS_DROPPED[r.selector]?.has(p) && !(r.selector === '@theme inline' && THEME_MAPPINGS_DROPPED.has(p))) }));
  const before = keyed(baselineNow, baselineRoot, isTokenRule);

  it('every rule of the old stylesheet is still there with the same declarations once tokens are resolved to dark', () => {
    expect(now.map(([k]) => k)).toEqual(before.map(([k]) => k));
    for (const [i, [key, decls]] of before.entries()) expect(now[i][1], key).toEqual(decls);
    expect(before.length).toBeGreaterThan(150);
  });

  it('every dark token of the old :root keeps its value (only color-scheme widened to "light dark")', () => {
    for (const [name, value] of Object.entries(baselineRoot)) {
      if (name === 'color-scheme' || DARK_TOKENS_DROPPED.has(name) || name in DARK_VALUES_BEFORE_MOM_145) continue;
      expect(blocks.dark[name], name).toBe(value);
    }
    expect(baselineRoot['color-scheme']).toBe('dark');
  });

  it('MOM-145: the deliberate changes are exactly the ones listed, and each is as designed', () => {
    for (const [name, before] of Object.entries(DARK_VALUES_BEFORE_MOM_145)) expect(baselineRoot[name] ?? before, name).toBe(before);
    expect(blocks.dark['--ctl-min']).toBe('38%');
    expect(blocks.dark['--input']).toBe('oklch(1 0 0 / 38%)');
    for (const name of DARK_TOKENS_DROPPED) {
      expect(blocks.dark[name], `${name} is gone from the dark block`).toBeUndefined();
      expect(blocks.lightMedia[name], `${name} is gone from the light block`).toBeUndefined();
      expect(sheet, name).not.toMatch(new RegExp(`var\(${name}\)`));
    }
    for (const [key, { to }] of Object.entries(DECLS_CHANGED)) {
      const [selector, prop] = key.split('|');
      const rule = parseRules(sheet).find((r) => r.selector === selector)!;
      expect(declsOf(rule)[prop], key).toBe(to);
    }
  });

  it('no colour literal is left in a rule outside the token blocks', () => {
    const literals = parseRules(sheet)
      .filter((r) => !isTokenRule(r) && r.selector !== '@theme inline')
      .flatMap((r) => r.decls.filter(([, v]) => /#[0-9a-fA-F]{3,8}\b|rgb\(\d/.test(v)).map(([p, v]) => `${r.selector} { ${p}: ${v} }`));
    expect(literals).toEqual([]);
  });
});

describe('the browser chrome colour (MOM-145)', () => {
  const hex = (token: string, theme: Record<string, string>) =>
    '#' + parseColour(resolve(`var(${token})`, theme)).rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

  it("is each theme's page background", () => {
    expect(THEME_CHROME_COLOR.dark).toBe(hex('--background', blocks.dark));
    expect(THEME_CHROME_COLOR.light).toBe(hex('--background', { ...blocks.dark, ...blocks.lightMedia }));
  });

  it('follows the choice when there is one, and the device when there is not', () => {
    expect(chromeColor('dark')).toBe(THEME_CHROME_COLOR.dark);
    expect(chromeColor('light')).toBe(THEME_CHROME_COLOR.light);
    expect(chromeColor(null)).toEqual([
      { media: '(prefers-color-scheme: light)', color: THEME_CHROME_COLOR.light },
      { media: '(prefers-color-scheme: dark)', color: THEME_CHROME_COLOR.dark },
    ]);
  });
});

describe('the theme choice', () => {
  it('has three choices, one of them "match my device", and reads only light or dark from a cookie', () => {
    expect(THEME_CHOICES.map((c) => c.value)).toEqual(['system', 'light', 'dark']);
    expect(THEME_CHOICES[0].label).toBe('Match my device');
    expect(storedTheme('light')).toBe('light');
    expect(storedTheme('dark')).toBe('dark');
    for (const bad of [undefined, null, '', 'system', 'LIGHT', 'light; path=/', 'blue']) expect(storedTheme(bad)).toBeNull();
  });

  it('refuses anything else as a choice', () => {
    for (const ok of ['system', 'light', 'dark']) expect(isThemeChoice(ok)).toBe(true);
    for (const bad of ['', 'auto', 'Dark', null, undefined, 3, {}]) expect(isThemeChoice(bad)).toBe(false);
  });
});
