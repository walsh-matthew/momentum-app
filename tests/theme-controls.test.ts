// MOM-30, round 3 of the look review, and MOM-145: a tappable answer must not be mistaken for the answer box, and only the chosen one
// is coloured.
// - A choice that is not chosen (an idea, a reading, a proposal's other answer, the date picker, a theme or review choice) has no fill, a
//   full-strength accent border (3:1 against the card) and the ordinary text colour, with a faint accent wash on hover and while pressed.
//   The chosen one is the solid accent fill (a tint of the accent as a fill looked olive on the dark card).
// - The answer box is a plain field: the page's colour sunk into the card, with no tint and the control border of every field
//   (3:1 in both themes).
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

  it('a choice that is not chosen has the accent as its border and no fill: only tokens, no literal colour', () => {
    expect(decl('.answer-choice', 'border-color')).toBe('var(--accent)');
    expect(decl('.answer-choice', 'background-color')).toBe('transparent');
    expect(sheet).not.toMatch(/--choice-(line|tint)/);
  });

  it('a choice gets a faint accent wash on hover (only where there is a pointer) and a deeper one while pressed', () => {
    expect(decl('.answer-choice:hover:not(:disabled)', 'background-color', ['@layer components', '@media (hover: hover)'])).toContain('var(--accent) 10%');
    expect(decl('.answer-choice:active:not(:disabled)', 'background-color')).toContain('var(--accent) 18%');
  });

  it("/plan's buttons take the same outlined look", () => {
    expect(decl('.plan-button', 'border')).toBe('1px solid var(--accent)');
    expect(decl('.plan-button', 'background')).toBe('transparent');
    expect(decl('.plan-button', 'color')).toBe('var(--foreground)');
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
  const card = colour('--card-fill');
  const foreground = colour('--foreground');
  const accent = colour('--accent');
  // What is behind a choice at rest, on hover (the accent at 10%) and pressed (18%).
  const states: [string, Rgb][] = [
    ['at rest', card],
    ['on hover', over({ rgb: accent, alpha: 0.1 }, card)],
    ['pressed', over({ rgb: accent, alpha: 0.18 }, card)],
  ];

  it('the text of a choice reads at 4.5:1 at rest, on hover and pressed (and on the page, for a choice outside a card)', () => {
    for (const [state, behind] of states) expect(contrast(foreground, behind), `${theme} text ${state}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(foreground, colour('--background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('a choice has a visible accent border: 3:1 against its card, its hover wash and the page', () => {
    for (const [state, behind] of states) expect(contrast(accent, behind), `${theme} border ${state}`).toBeGreaterThanOrEqual(3);
    expect(contrast(accent, colour('--background'))).toBeGreaterThanOrEqual(3);
  });

  it('a chosen answer is the solid accent, far from the card, and an unchosen one has no fill of its own', () => {
    expect(contrast(colour('--primary'), card), 'the chosen fill against the card').toBeGreaterThanOrEqual(3);
    expect(contrast(colour('--primary-foreground'), colour('--primary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(states[0][1], card)).toBe(1);
  });

  it('a choice is plainly not the answer box: the box is inset into the card, the choice is flat', () => {
    expect(t['--field-shadow'], 'the field is inset').toContain('inset');
    // The field carries no accent at all: it is either the page colour (dark) or the card's own fill (light).
    expect(Math.max(...colour('--field-fill')) - Math.min(...colour('--field-fill')), 'the field is untinted').toBeLessThan(0.06);
  });

  it(theme === 'dark' ? 'dark: the field is the page colour, sunk into the card (MOM-145: the card is darker, the border marks the field)' : 'light: the field is the card own white', () => {
    if (theme === 'dark') {
      expect(resolve('var(--field-fill)', t)).toBe(resolve('var(--background)', t));
      expect(contrast(colour('--field-fill'), card)).toBeGreaterThanOrEqual(1.1);
    } else {
      expect(resolve('var(--field-fill)', t)).toBe(resolve('var(--card-fill)', t));
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
