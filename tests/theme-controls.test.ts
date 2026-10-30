// MOM-30, round 3 of the look review: a tappable answer must not be mistaken for the answer box.
// - A choice (an idea, a reading, a proposal's other answer, the date picker, the theme choice) looks like a button: the accent as a
//   tinted fill and an accent border, deeper on hover and while pressed, with its text at AA.
// - The answer box is a plain field: the page's colour sunk into the card, with no tint and the control border of every field
//   (3:1 in light).
// Both come from the shared setup components, so every card gets them, and from tokens in app/globals.css.
// Pure: no browser, no network.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, over, parseColour, type Rgb } from './helpers/color';
import { parseRules, readSheet, resolve, themeBlocks } from './helpers/css';

const sheet = readSheet('app/globals.css');
const rules = parseRules(sheet);
const blocks = themeBlocks(sheet);
const THEMES = { dark: blocks.dark, light: { ...blocks.dark, ...blocks.lightMedia } } as const;
const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const share = (theme: 'dark' | 'light', token: string): number => Number(resolve(`var(${token})`, THEMES[theme]).replace('%', '')) / 100;

describe('the shared classes', () => {
  const LAYER = ['@layer components'];
  const rule = (selector: string, path: string[] = LAYER) => rules.find((r) => r.selector === selector && r.path.join('|') === path.join('|'));
  const decl = (selector: string, prop: string, path: string[] = LAYER) => Object.fromEntries(rule(selector, path)?.decls ?? [])[prop];

  it('a choice is the accent, tinted, with an accent border: only tokens, no literal colour', () => {
    expect(decl('.answer-choice', 'border-color')).toBe('color-mix(in oklab, var(--accent) var(--choice-line), transparent)');
    expect(decl('.answer-choice', 'background-color')).toBe('color-mix(in oklab, var(--accent) var(--choice-tint), transparent)');
  });

  it('a choice is deeper on hover (only where there is a pointer) and deeper again while pressed', () => {
    expect(decl('.answer-choice:hover:not(:disabled)', 'background-color', ['@layer components', '@media (hover: hover)'])).toContain('var(--choice-hover)');
    expect(decl('.answer-choice:active:not(:disabled)', 'background-color')).toContain('var(--choice-press)');
  });

  it('the answer box is the --field-fill with an inset shadow: no tint', () => {
    expect(decl('.field-input', 'background-color')).toBe('var(--field-fill)');
    expect(decl('.field-input', 'box-shadow')).toBe('var(--field-shadow)');
  });

  it('the setup components use them: choices through answerChoiceClasses, the box through field-input, with no tint of their own', () => {
    const choice = source('components/setup/AnswerChoice.tsx');
    expect(choice).toMatch(/'answer-choice text-foreground'/);
    expect(choice).not.toMatch(/bg-foreground/);
    const box = source('components/setup/AnswerBox.tsx');
    expect(box).toMatch(/\bfield-input\b/);
    // The field itself (the textarea), not the little × beside it, which has its own hover.
    const field = box.match(/<textarea[\s\S]*?\/>/)?.[0] ?? '';
    expect(field).toContain('field-input');
    expect(field).not.toMatch(/bg-foreground|bg-accent|bg-primary/);
    // The date picker and the theme choice take the same look.
    expect(source('components/setup/DateAnswer.tsx')).toMatch(/answerChoiceClasses/);
    expect(source('components/settings/ThemeChoice.tsx')).toMatch(/answer-choice/);
  });
});

describe.each(['dark', 'light'] as const)('%s theme', (theme) => {
  const t = THEMES[theme];
  const colour = (token: string): Rgb => parseColour(resolve(`var(${token})`, t)).rgb;
  const accent = colour('--accent');
  // The accent's share over the card, as the fill of a choice at rest, on hover and pressed.
  const fill = (token: string): Rgb => over({ rgb: accent, alpha: share(theme, token) }, colour('--card-fill'));

  it('the text of a choice reads at 4.5:1 at rest, on hover and pressed (and on the page, for a choice outside a card)', () => {
    for (const state of ['--choice-tint', '--choice-hover', '--choice-press']) {
      expect(contrast(colour('--foreground'), fill(state)), `${theme} text on ${state}`).toBeGreaterThanOrEqual(4.5);
      const onPage = over({ rgb: accent, alpha: share(theme, state) }, colour('--background'));
      expect(contrast(colour('--foreground'), onPage), `${theme} text on ${state} over the page`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('a choice has a visible accent border (3:1 against its card) and hover and pressed are each deeper than the last', () => {
    const border = over({ rgb: accent, alpha: share(theme, '--choice-line') }, colour('--card-fill'));
    expect(contrast(border, colour('--card-fill'))).toBeGreaterThanOrEqual(3);
    expect(share(theme, '--choice-tint')).toBeLessThan(share(theme, '--choice-hover'));
    expect(share(theme, '--choice-hover')).toBeLessThan(share(theme, '--choice-press'));
  });

  it('a choice is plainly not the answer box: a coloured (accent) border and a tinted fill, against a neutral border and an untinted, inset field', () => {
    const spread = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b);
    const card = colour('--card-fill');
    const choiceBorder = over({ rgb: accent, alpha: share(theme, '--choice-line') }, card);
    // The field's border is the foreground at the control strength: grey-green, with little colour in it.
    const strength = Math.max(share(theme, '--ctl-min'), 0.3);
    const fieldBorder = over({ rgb: colour('--foreground'), alpha: 1 }, card, strength);
    expect(spread(choiceBorder), 'the choice border is coloured').toBeGreaterThan(0.15);
    expect(spread(fieldBorder), 'the field border is neutral').toBeLessThan(0.1);
    expect(t['--field-shadow'], 'the field is inset').toContain('inset');
    // The field carries no accent at all: it is either the page colour (dark) or the card's own fill (light).
    expect(spread(colour('--field-fill')), 'the field is untinted').toBeLessThan(0.06);
  });

  it(theme === 'dark' ? 'dark: the field is the page colour, sunk into the card by a clear step (unchanged since round 3)' : 'light: the field is the card own white, and the choices carry a clearly visible tint', () => {
    if (theme === 'dark') {
      expect(resolve('var(--field-fill)', t)).toBe(resolve('var(--background)', t));
      expect(contrast(colour('--field-fill'), colour('--card-fill'))).toBeGreaterThanOrEqual(1.3);
      expect(share(theme, '--choice-tint')).toBe(0.12);
    } else {
      expect(resolve('var(--field-fill)', t)).toBe(resolve('var(--card-fill)', t));
      // A tint you can see on a white card: the choice's fill differs from the white by a clear step, and the field does not.
      const choiceFill = over({ rgb: accent, alpha: share(theme, '--choice-tint') }, colour('--card-fill'));
      expect(contrast(choiceFill, colour('--card-fill'))).toBeGreaterThanOrEqual(1.1);
      expect(share(theme, '--choice-tint')).toBeGreaterThanOrEqual(0.16);
    }
  });
});

describe('light theme: the answer box keeps its 3:1 control border', () => {
  it('the border of a field, at the control strength, reads 3:1 against the card and the page', () => {
    const t = THEMES.light;
    const strength = share('light', '--ctl-min');
    const foreground = parseColour(resolve('var(--foreground)', t)).rgb;
    for (const behind of ['--card-fill', '--background']) {
      const under = parseColour(resolve(`var(${behind})`, t)).rgb;
      expect(contrast(over({ rgb: foreground, alpha: 1 }, under, strength), under), behind).toBeGreaterThanOrEqual(3);
    }
    expect(source('components/setup/AnswerBox.tsx')).toMatch(/\bctl-30\b/);
  });
});
