// MOM-30: WCAG AA contrast of the approved text-on-surface pairs, in both themes, read from the tokens in app/globals.css.
// Text needs 4.5:1, and the graphics a person has to see (a ring, an icon, a toggle, the border of a control) need 3:1.
// A pair is one the app really draws: a colour on the surfaces it sits on, or on its own translucent tint over a surface.
// Pure: no browser, no network.

import { describe, expect, it } from 'vitest';
import { contrast, over, parseColour, type Rgb } from './helpers/color';
import { readSheet, resolve, themeBlocks } from './helpers/css';

const blocks = themeBlocks(readSheet('app/globals.css'));
const THEMES = { dark: blocks.dark, light: { ...blocks.dark, ...blocks.lightMedia } } as const;
type Theme = keyof typeof THEMES;

const colourOf = (theme: Theme, token: string): Rgb => {
  const value = resolve(`var(${token})`, THEMES[theme]);
  const c = parseColour(value);
  return c.alpha < 1 ? over(c, colourOf(theme, '--background')) : c.rgb;
};
const channelOf = (theme: Theme, token: string): Rgb => parseColour(resolve(`var(${token})`, THEMES[theme])).rgb;
// A translucent tint of a colour channel over a surface: rgb(var(--lime-rgb) / 9%) over --card-fill.
const tint = (theme: Theme, channel: string, alpha: number, surface: string): Rgb =>
  over({ rgb: channelOf(theme, channel), alpha }, colourOf(theme, surface));

// The card fill is the surface of every card (round 2 of the look review), and --page-wide is the page behind the three columns.
const SURFACES = ['--background', '--page-wide', '--card-fill', '--field-fill', '--secondary'];
// Colours the app draws as text on those surfaces.
const TEXT = [
  '--foreground', '--muted', '--accent', '--danger', '--streak', '--channel',
  '--text-bright-1', '--text-bright-2', '--text-bright-3', '--text-bright-4', '--text-bright-5',
  '--text-soft-1', '--text-soft-2', '--text-soft-3', '--text-soft-4', '--text-soft-5',
  '--text-dim-1', '--text-dim-2', '--text-dim-3', '--text-lime-1', '--text-lime-2',
];

describe.each(['dark', 'light'] as const)('%s theme', (theme) => {
  it.each(TEXT)('%s reads at 4.5:1 on every surface', (token) => {
    for (const surface of SURFACES) {
      expect(contrast(colourOf(theme, token), colourOf(theme, surface)), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('text on a fill: the accent button, the lime fills, the secondary surface', () => {
    expect(contrast(colourOf(theme, '--primary-foreground'), colourOf(theme, '--primary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf(theme, '--secondary-foreground'), colourOf(theme, '--secondary'))).toBeGreaterThanOrEqual(4.5);
    for (const onLime of ['--on-lime-1', '--on-lime-2']) {
      expect(contrast(colourOf(theme, onLime), colourOf(theme, '--lime')), onLime).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The quick path's choices (MOM-111, components/setup/AnswerChoice.tsx choiceClasses): the answers a person did not choose are plain,
  // the card's own colour with a border; the one they chose is filled with the accent and a check mark. Both have to read in both
  // themes: the words of each at 4.5:1, the check on the fill (a graphic, 3:1, and it is the button's own text colour, so 4.5:1), the
  // fill itself as a shape against the card (3:1), and the border of a plain one as an edge (3:1).
  it('a chosen answer reads, and stands out from a plain one: the words, the check, the fill and the edge', () => {
    const card = colourOf(theme, '--card-fill');
    // Chosen: the accent fill with its own text colour (and its check, which draws in that colour).
    expect(contrast(colourOf(theme, '--primary-foreground'), colourOf(theme, '--primary')), 'the chosen answer\'s words and check on the fill').toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf(theme, '--primary'), card), 'the chosen answer\'s fill against the card').toBeGreaterThanOrEqual(3);
    // Plain: the ordinary text colour on the card, and the control border (never fainter than --ctl-min) as an edge against it.
    expect(contrast(colourOf(theme, '--foreground'), card), 'a plain answer\'s words on the card').toBeGreaterThanOrEqual(4.5);
    const ctl45 = Math.max(0.45, Number(resolve('var(--ctl-min)', THEMES[theme]).replace('%', '')) / 100);
    const edge = over({ rgb: colourOf(theme, '--foreground'), alpha: ctl45 }, card);
    expect(contrast(edge, card), 'a plain answer\'s border against the card').toBeGreaterThanOrEqual(3);
    // And the two look different: the chosen fill is far from the card, the plain answer is the card.
    expect(contrast(colourOf(theme, '--primary'), card)).toBeGreaterThan(contrast(card, card));
  });

  it('text on a hovered accent button still reads at 4.5:1, over every surface it can sit on', () => {
    const share = Number(resolve('var(--hover-primary)', THEMES[theme]).replace('%', '')) / 100;
    const base = resolve('var(--hover-base)', THEMES[theme]);
    for (const surface of SURFACES) {
      const under: Rgb = base === 'transparent' ? colourOf(theme, surface) : [0, 0, 0];
      const fill = colourOf(theme, '--primary').map((c, i) => c * share + under[i] * (1 - share)) as Rgb;
      expect(contrast(colourOf(theme, '--primary-foreground'), fill), `hover over ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('text on its own translucent tint: the badges, chips, alerts and notes', () => {
    const pairs: [string, string, Rgb][] = [
      ['--danger on the red fill (9%)', '--danger', tint(theme, '--red-rgb', 0.09, '--card-fill')],
      ['--streak on the amber alert fill (8%)', '--streak', tint(theme, '--amber-rgb', 0.08, '--card-fill')],
      ['--streak on the amber alert fill (8%, on the page)', '--streak', tint(theme, '--amber-rgb', 0.08, '--background')],
      // The quick path's "Needs your answer" callout (MOM-111, components/setup/NeedsAnswer.tsx): its label is --streak (above), and
      // its question, its note and the words of every control inside it sit on the same amber fill.
      ['--foreground, the callout question, on the amber callout fill (8%)', '--foreground', tint(theme, '--amber-rgb', 0.08, '--card-fill')],
      ['--muted, the callout note, on the amber callout fill (8%)', '--muted', tint(theme, '--amber-rgb', 0.08, '--card-fill')],
      ['--foreground on the amber callout fill (8%, on the page)', '--foreground', tint(theme, '--amber-rgb', 0.08, '--background')],
      ['--muted on the amber callout fill (8%, on the page)', '--muted', tint(theme, '--amber-rgb', 0.08, '--background')],
      ['--lime on the accent chip (9%)', '--lime', tint(theme, '--lime-rgb', 0.09, '--card-fill')],
      ['--text-lime-1 on the badge (6%)', '--text-lime-1', tint(theme, '--lime-rgb', 0.06, '--card-fill')],
      ['--text-lime-1 on a good pattern (7%)', '--text-lime-1', tint(theme, '--lime-rgb', 0.07, '--card-fill')],
      ['--text-lime-2 on the banner (9%)', '--text-lime-2', tint(theme, '--lime-rgb', 0.09, '--background')],
      ['--channel on the channel tint (10%)', '--channel', tint(theme, '--blue-rgb', 0.1, '--card-fill')],
      ['--icon-blue on the app icon tint (11%)', '--icon-blue', tint(theme, '--blue2-rgb', 0.11, '--card-fill')],
      ['--muted on the white-ink fill (6%)', '--muted', tint(theme, '--ink', 0.06, '--card-fill')],
      ['--text-soft-1 on the effort tag (6%)', '--text-soft-1', tint(theme, '--ink', 0.06, '--card-fill')],
      ['--text-bright-1 on the ink fill (4%)', '--text-bright-1', tint(theme, '--ink', 0.04, '--background')],
    ];
    for (const [what, token, bg] of pairs) expect(contrast(colourOf(theme, token), bg), what).toBeGreaterThanOrEqual(4.5);
  });

  it('graphics a person has to see reach 3:1: the progress ring and bars, icons, the toggle and the sync dot', () => {
    for (const surface of ['--background', '--card-fill', '--field-fill']) {
      for (const token of ['--lime', '--icon-dim', '--icon-lime', '--icon-blue', '--sync-dot', '--stripe-a', '--stripe-b']) {
        expect(contrast(colourOf(theme, token), colourOf(theme, surface)), `${token} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(contrast(colourOf(theme, '--toggle-knob'), colourOf(theme, '--toggle-track')), 'the toggle knob on its track').toBeGreaterThanOrEqual(3);
  });
});

// MOM-145: a choice that is not chosen has a full-strength accent border and no fill. The border is an edge a person has to see, so it
// reaches 3:1 against the card, the page and the field, in both themes (lime in dark, the deeper green in light).
describe.each(['dark', 'light'] as const)('%s theme: the border of an unchosen choice', (theme) => {
  it('is the accent, at 3:1 against the card and the page', () => {
    for (const surface of ['--card-fill', '--background', '--page-wide']) {
      expect(contrast(colourOf(theme, '--accent'), colourOf(theme, surface)), `--accent on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("and its hover wash (the accent at 10%, pressed 18%) keeps the choice's text at 4.5:1", () => {
    for (const share of [0.1, 0.18]) {
      const wash = over({ rgb: colourOf(theme, '--accent'), alpha: share }, colourOf(theme, '--card-fill'));
      expect(contrast(colourOf(theme, '--foreground'), wash), `text on the ${share} wash`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// MOM-145: the plain callout of a form that is missing something (components/ui/MissingCallout.tsx) is the ordinary text on the amber
// note surface, over a card and over the page, and its border (--streak at 50%) is an edge a person can see (3:1 is not needed for a
// border that only repeats the words, but it stays visible).
describe.each(['dark', 'light'] as const)('%s theme: the missing-field callout', (theme) => {
  it('reads at 4.5:1 on the amber fill, over the card and over the page', () => {
    for (const surface of ['--card-fill', '--background']) {
      expect(contrast(colourOf(theme, '--foreground'), tint(theme, '--amber-rgb', 0.08, surface)), `--foreground on the callout over ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// MOM-145: the border of a control reaches 3:1 in both themes. The two themes differ only in how strong the border is (--ctl-min).
describe.each(['dark', 'light'] as const)('%s theme: the border of a control reaches 3:1', (theme) => {
  const ctlMin = Number(resolve('var(--ctl-min)', THEMES[theme]).replace('%', '')) / 100;
  const surfaces = ['--background', '--page-wide', '--card-fill', '--field-fill', '--secondary'];

  it('the control-border alpha is at least 3:1 on every surface, for both the ink and the foreground it is drawn with', () => {
    expect(ctlMin).toBeGreaterThan(0.3);
    for (const surface of surfaces) {
      const ink = over({ rgb: channelOf(theme, '--ink'), alpha: ctlMin }, colourOf(theme, surface));
      const foreground = over({ rgb: colourOf(theme, '--foreground'), alpha: ctlMin }, colourOf(theme, surface));
      expect(contrast(ink, colourOf(theme, surface)), `ink border on ${surface}`).toBeGreaterThanOrEqual(3);
      expect(contrast(foreground, colourOf(theme, surface)), `foreground border on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the --input border is 3:1 on every surface', () => {
    const input = parseColour(resolve('var(--input)', THEMES[theme]));
    for (const surface of surfaces) {
      expect(contrast(over(input, colourOf(theme, surface)), colourOf(theme, surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });
});
