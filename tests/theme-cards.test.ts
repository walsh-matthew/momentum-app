// MOM-30, round 2 of the look review: every card and section block has ONE surface, on every screen, through three tokens
// (--card-fill, --card-line, --card-shadow in app/globals.css). Before, a dozen classes each hard-coded their own fill, border
// alpha (6 to 9%) and glow, so two sections side by side did not match, and in light the white cards sat on an almost white page.
// 1. The shared rule exists and gives a card the three tokens.
// 2. Every card-like rule in the stylesheet is in that rule, and sets none of the surface itself (the overlay sheets and the
//    desktop banner use the tokens next to their own shadow or border).
// 3. Every card built from Tailwind classes in a component uses the shared class.
// 4. The first heading of a card is one shared, semibold style (.card-title) in both themes (round 4).
// 5. A card is clearly perceptible against the page in both themes, and so is its border, in numbers.
// Pure: no browser, no network.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, over, parseColour, type Rgb } from './helpers/color';
import { parseRules, readSheet, resolve, themeBlocks, type CssRule } from './helpers/css';

const sheet = readSheet('app/globals.css');
const rules = parseRules(sheet);
const blocks = themeBlocks(sheet);
const THEMES = { dark: blocks.dark, light: { ...blocks.dark, ...blocks.lightMedia } } as const;

const isTheme = (r: CssRule) => r.selector.startsWith(':root');
const shared = rules.find((r) => r.selector.startsWith('.card-surface,'));
const sharedSelectors = (shared?.selector ?? '').split(',').map((x) => x.trim());
const declared = (r: CssRule, prop: string) => r.decls.filter(([p]) => p === prop).map(([, v]) => v);

// Overlay sheets and the desktop banner: they use the tokens, next to their own drop shadow or their lime border.
const OWN_SURFACE = new Set(['.sheet-surface', '.adaptive-sheet', '.goal-builder-banner']);
const SURFACE_PROPS = ['background', 'background-color', 'border', 'border-color', 'box-shadow'];

describe('the shared card surface', () => {
  it('is one rule that gives a card the fill, the border and the shadow from the three tokens', () => {
    expect(shared, 'a rule starting with .card-surface').toBeDefined();
    const d = Object.fromEntries(shared!.decls);
    expect(d['background-color']).toBe('var(--card-fill)');
    expect(d.border).toBe('1px solid var(--card-line)');
    expect(d['box-shadow']).toBe('var(--card-shadow)');
    expect(sharedSelectors.length).toBeGreaterThan(8);
  });

  it('every card-like rule in the stylesheet is in it (a rounded block, 13px or more, with a border or a fill)', () => {
    const cardLike = rules
      .filter((r) => !isTheme(r) && !r.selector.startsWith('@') && r !== shared)
      .filter((r) => {
        const radius = Number((declared(r, 'border-radius')[0] ?? '').match(/^(\d+)px/)?.[1] ?? 0);
        const hasSurface = declared(r, 'border').length + declared(r, 'background').length + declared(r, 'background-color').length > 0;
        // 90px and up is a pill or a dot, not a block.
        return radius >= 13 && radius < 90 && hasSurface;
      })
      .map((r) => r.selector);
    const strays = cardLike.filter((sel) => !sharedSelectors.includes(sel) && !OWN_SURFACE.has(sel));
    expect(strays, 'add it to the shared rule in app/globals.css (and to CARD_SELECTORS in tests/theme-tokens.test.ts)').toEqual([]);
    // The rules that still hold a card's own radius and surface (the sheets, the banner), and the shared list that holds the rest.
    expect(cardLike.length).toBeGreaterThan(2);
  });

  it('a card sets no surface of its own: no fill, border or shadow outside the three tokens', () => {
    const own: string[] = [];
    for (const r of rules.filter((x) => !isTheme(x) && x !== shared)) {
      const isCard = sharedSelectors.includes(r.selector) || OWN_SURFACE.has(r.selector);
      if (!isCard) continue;
      for (const prop of SURFACE_PROPS) {
        for (const value of declared(r, prop)) {
          if (value.includes('var(--card-')) continue;
          // The desktop banner keeps its lime border: an accent, not a surface.
          if (r.selector === '.goal-builder-banner' && prop === 'border') continue;
          // Square the corners and drop the line where a sheet meets the screen edge.
          if (prop === 'border' && /^0$|^none$/.test(value)) continue;
          own.push(`${r.selector} { ${prop}: ${value} }`);
        }
      }
    }
    expect(own).toEqual([]);
  });

  it('the hero and score card keep their glow, drawn over the shared fill', () => {
    for (const sel of ['.home-hero', '.score-card']) {
      const r = rules.find((x) => x.selector === sel)!;
      expect(declared(r, 'background')[0], sel).toMatch(/^radial-gradient\(.+\), var\(--card-fill\)$/);
    }
  });
});

describe('a card built from classes in a component', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) ? [p] : [];
    });
  const files = [...walk(join(process.cwd(), 'components')), ...walk(join(process.cwd(), 'app'))];

  it('uses the shared class, not its own border and fill (controls, which take ctl-* borders, are not cards)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/["'`]([^"'`\n]*\brounded-[^"'`\n]*)["'`]/g)) {
        const classes = m[1];
        const looksLikeCard = /\bborder\b/.test(classes) && /\bbg-(secondary|panel|card|surface-soft|surface-raised)\b/.test(classes);
        const isControl = /\bctl-|placeholder:|\bsr-only\b/.test(classes);
        if (looksLikeCard && !isControl && !/\bcard-surface\b|\bchannel-card\b/.test(classes)) offenders.push(`${file.replace(process.cwd(), '')}: ${classes.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(files.length).toBeGreaterThan(40);
  });

  it('the cards that use it, count and all', () => {
    const uses = files.filter((f) => /\b(card-surface|channel-card)\b/.test(readFileSync(f, 'utf8')));
    expect(uses.length).toBeGreaterThan(15);
  });
});

describe("every page's section blocks", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) ? [p] : [];
    });
  const root = process.cwd().replace(/\\/g, '/');
  const files = [...walk(join(process.cwd(), 'components')), ...walk(join(process.cwd(), 'app'))];
  // The classes that give a block the shared surface: the shared rule's own, and the overlay sheets and banner.
  const CARD_CLASSES = new Set([...sharedSelectors, ...OWN_SURFACE].map((sel) => sel.replace(/^\./, '')));

  // A <section> that is not itself a card is only allowed where it holds nothing but cards (a heading and intro above them) or is
  // a layout wrapper. Each is listed with the reason; a new section that is neither fails here until it is a card or is listed.
  const GROUPS: Record<string, string> = {
    'components/layout/AppShell.tsx#Daily workspace': 'layout: the page workspace',
    'components/layout/PageFrame.tsx#title': 'layout: the page workspace',
    'components/layout/GoalCards.tsx#goal-cards-heading': 'a list of goal cards',
    'components/layout/NavSidebar.tsx#active-goals-heading': 'the sidebar list of goals',
    'components/plan/PlanScreen.tsx#plan-things': "the plan's goal cards under their heading and intro",
    'components/review/ReviewScreen.tsx#Your last review': 'a heading over the recap cards',
    "components/review/ReviewScreen.tsx#This week's review": 'a heading over the recap cards',
    "components/review/ReviewScreen.tsx#This week's recap": 'a heading over the recap cards',
    'components/entries/ManualEntryPanel.tsx#recent-entries': 'a heading over the entry cards',
    'components/entries/ChecklistControl.tsx#item.title': 'one step inside the checklist control',
    'components/goals/GoalBuilderWizard.tsx#Completion criteria': 'a group inside the wizard sheet',
    'components/goals/GoalBuilderWizard.tsx#Week 1 plan': 'a group inside the wizard sheet',
    'components/home/HomeScoreboardSection.tsx#Your week': 'the home scoreboard: a hero and goal cards',
    'components/rebalance/RebalanceDrawer.tsx#Tasks that did not move': 'a list of cards inside the drawer sheet',
    'components/rebalance/RebalanceDrawer.tsx#Proposed task shifts': 'a list of cards inside the drawer sheet',
    'components/tasks/RecentlyDoneList.tsx#recently-done-heading': 'a heading over the task cards',
    'components/tasks/UpNextList.tsx#up-next-heading': 'a heading over the task cards',
  };

  const sections = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const constants = new Map([...text.matchAll(/const (\w+) =\s*['"`]([^'"`]*)['"`]/g)].map((m) => [m[1], m[2]]));
    return [...text.matchAll(/<section\b([^>]*)>/g)].map((m) => {
      const attrs = m[1];
      const literal = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/);
      const named = attrs.match(/className=\{(\w+)\}/);
      const classes = literal ? (literal[1] ?? literal[2] ?? literal[3]) : named ? (constants.get(named[1]) ?? '') : '';
      const id = attrs.match(/aria-labelledby="([^"]+)"|aria-label="([^"]+)"|aria-labelledby=\{([^}]+)\}|aria-label=\{([^}]+)\}/);
      const label = id ? (id[1] ?? id[2] ?? id[3] ?? id[4]) : '';
      return { key: `${file.replace(/\\/g, '/').replace(`${root}/`, '')}#${label}`, classes };
    });
  });

  it('is a card (the shared surface), or a declared group of cards or layout wrapper', () => {
    const offenders = sections
      .filter((sec) => !sec.classes.split(/\s+/).some((c) => CARD_CLASSES.has(c)))
      .filter((sec) => !(sec.key in GROUPS))
      .map((sec) => `${sec.key} [${sec.classes}]`);
    expect(offenders, 'make it a card (card-surface or a card class) or add it to GROUPS with the reason').toEqual([]);
    expect(sections.length).toBeGreaterThan(40);
  });

  it('lists no group that is not there any more (so the list cannot rot)', () => {
    const keys = new Set(sections.map((sec) => sec.key));
    expect(Object.keys(GROUPS).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("the blocks that were not cards are now: /plan's kinds of day, and every section of /privacy", () => {
    const plan = sections.find((sec) => sec.key === 'components/plan/PlanScreen.tsx#plan-kinds')!;
    expect(plan.classes.split(/\s+/)).toContain('plan-goal');
    const privacy = sections.filter((sec) => sec.key.startsWith('components/privacy/PrivacyNotice.tsx#'));
    expect(privacy.length).toBe(6);
    for (const sec of privacy) expect(sec.classes.split(/\s+/), sec.key).toContain('channel-card');
  });
});

describe('the title of a card', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) ? [p] : [];
    });
  const root = process.cwd().replace(/\\/g, '/');
  const files = [...walk(join(process.cwd(), 'components')), ...walk(join(process.cwd(), 'app'))];

  // Every h2 to h4 in a component: where it is, the classes it has (a constant is looked up), and its first words.
  const headings = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const constants = new Map([...text.matchAll(/const (\w+) =\s*['"`]([^'"`]*)['"`]/g)].map((m) => [m[1], m[2]]));
    return [...text.matchAll(/<(h[2-4])\b([^>]*)>\s*([^<]{0,60})/g)].map((m) => {
      const attrs = m[2];
      const literal = attrs.match(/className="([^"]*)"/);
      const named = attrs.match(/className=\{(\w+)\}/);
      const classes = literal ? literal[1] : named ? (constants.get(named[1]) ?? '') : '';
      return { file: file.replace(/\\/g, '/').replace(`${root}/`, ''), tag: m[1], classes, signature: `${attrs} ${m[3]}`.replace(/\s+/g, ' ').trim() };
    });
  });

  // A heading that is not a card's title says why. A card's title is the first heading in a card; these are page and group headings
  // above cards, the titles of dialogs and drawers, a hero's headline, labels, and the sub-headings of rows inside a card.
  const NOT_A_CARD_TITLE: { file: string; match: RegExp; why: string }[] = [
    { file: 'components/entries/ChecklistControl.tsx', match: /item\.title/, why: 'one step inside the checklist control' },
    { file: 'components/entries/ManualEntryPanel.tsx', match: /recent-entries/, why: 'a heading over the entry cards' },
    { file: 'components/goals/GoalBuilderWizard.tsx', match: /text-lg font-semibold/, why: 'the title of the wizard dialog' },
    { file: 'components/goals/GoalBuilderWizard.tsx', match: /Completion criteria|Week 1 plan/, why: 'groups inside the wizard dialog' },
    { file: 'components/home/HomeHeroCard.tsx', match: /home-hero-title/, why: "a hero card's headline" },
    { file: 'components/home/WeekHero.tsx', match: /home-hero-title/, why: "a hero card's headline" },
    { file: 'components/home/MilestoneRow.tsx', match: /title/, why: 'a row inside a goal card' },
    { file: 'components/home/TargetRow.tsx', match: /card\.title/, why: 'a row inside a goal card' },
    { file: 'components/home/YourPlanCard.tsx', match: /CARD_TODAY|LEFT_OVER/, why: 'a sub-heading inside the plan card' },
    { file: 'components/layout/GoalCards.tsx', match: /goal-cards-heading/, why: 'a heading over the goal cards' },
    { file: 'components/layout/NavSidebar.tsx', match: /sidebar-label/, why: 'a sidebar label' },
    { file: 'components/plan/PlanScreen.tsx', match: /windowTitle/, why: "the week's heading above the plan" },
    { file: 'components/plan/PlanScreen.tsx', match: /plan-things/, why: 'a heading over the goal cards' },
    { file: 'components/plan/PlanScreen.tsx', match: /item\.title/, why: 'a row inside a goal card' },
    { file: 'components/rebalance/RebalanceDrawer.tsx', match: /text-lg font-semibold|text-sm font-medium/, why: 'titles and groups in the drawer sheet' },
    { file: 'components/rebalance/RebalanceSideCard.tsx', match: /eyebrow/, why: 'an eyebrow label, not a title' },
    { file: 'components/review/ReviewScreen.tsx', match: /Your last review/, why: 'a heading over the recap cards' },
    { file: 'components/setup/QuickPathCard.tsx', match: /CARD_TEXT\.note|CARD_TEXT\.body/, why: "the quick path's part labels and the name of the step in view, in regular weight (setup's one bold line is its lead)" },
    { file: 'components/tasks/RecentlyDoneList.tsx', match: /recently-done-heading/, why: 'a heading over the task cards' },
    { file: 'components/tasks/UpNextList.tsx', match: /up-next-heading/, why: 'a heading over the task cards' },
  ];
  const exempt = (h: (typeof headings)[number]) => NOT_A_CARD_TITLE.some((e) => e.file === h.file && e.match.test(h.signature));

  it('every heading is a card title (the shared class) or says why it is not', () => {
    const strays = headings.filter((h) => !h.classes.split(/\s+/).includes('card-title') && !exempt(h)).map((h) => `${h.file}: <${h.tag} ${h.signature}>`);
    expect(strays, 'give the card heading class "card-title", or list the heading in NOT_A_CARD_TITLE with the reason').toEqual([]);
    expect(headings.length).toBeGreaterThan(50);
  });

  it('lists no exception that is not there any more (so the list cannot rot)', () => {
    const stale = NOT_A_CARD_TITLE.filter((e) => !headings.some((h) => h.file === e.file && e.match.test(h.signature))).map((e) => `${e.file} ${e.match}`);
    expect(stale).toEqual([]);
  });

  it('is semibold at one size, in both themes: one rule, and no card rule restyles its heading', () => {
    const title = rules.find((r) => r.selector === '.card-title');
    expect(title, 'a .card-title rule').toBeDefined();
    const d = Object.fromEntries(title!.decls);
    expect(d['font-weight']).toBe('600');
    expect(d['font-size']).toBe('16px');
    // Neither theme block touches type: the title is the same in both.
    for (const block of [blocks.dark, blocks.lightMedia, blocks.lightChoice]) expect(Object.keys(block).filter((k) => /font|letter/.test(k))).toEqual([]);
    // A rule that styles a card's heading by its place (".home-goal h3 { font-size }") would beat the class and bring back the mismatch.
    const restyled = rules
      .filter((r) => /^\.(home-goal|plan-goal|channel-card|focus-card|home-notice|goal-card|score-card)\s+h[2-4]\b/.test(r.selector))
      .filter((r) => r.decls.some(([p]) => /^font-(size|weight)$/.test(p)))
      .map((r) => r.selector);
    expect(restyled).toEqual([]);
  });

  it('the cards the owner named use it: Stay fit, What kind of day is each one?, Priorities you named, Your plan, Account', () => {
    const uses = (file: string, text: RegExp) => headings.some((h) => h.file === file && text.test(h.signature) && h.classes.split(/\s+/).includes('card-title'));
    expect(uses('components/home/GoalScoreboardCard.tsx', /goal\.title/)).toBe(true);
    expect(uses('components/plan/PlanScreen.tsx', /KINDS_HEADING/)).toBe(true);
    expect(uses('components/review/RecapBody.tsx', /Priorities you named/)).toBe(true);
    expect(uses('components/home/YourPlanCard.tsx', /CARD_HEADING/)).toBe(true);
    expect(uses('app/settings/page.tsx', /Account/)).toBe(true);
  });
});

describe.each(['dark', 'light'] as const)('%s theme: a card stands out from the page', (theme) => {
  const t = THEMES[theme];
  const colour = (token: string): Rgb => {
    const c = parseColour(resolve(`var(${token})`, t));
    return c.alpha < 1 ? over(c, colour('--background')) : c.rgb;
  };
  // Dark: its own fill against a dark page. Light: white against a tinted page, helped by the border and the shadow.
  const MIN_FILL = theme === 'dark' ? 1.3 : 1.15;

  it(`the fill reads at least ${MIN_FILL}:1 against the page, on the phone page and the desktop page behind the three columns`, () => {
    expect(contrast(colour('--card-fill'), colour('--background'))).toBeGreaterThanOrEqual(MIN_FILL);
    expect(contrast(colour('--card-fill'), colour('--page-wide'))).toBeGreaterThanOrEqual(MIN_FILL);
  });

  it('the border reads at least 1.3:1 against the page and against the card, so an edge shows even when the screen washes out', () => {
    const line = parseColour(resolve('var(--card-line)', t));
    for (const behind of ['--background', '--page-wide', '--card-fill']) {
      const edge = over(line, colour(behind));
      expect(contrast(edge, colour(behind)), `border over ${behind}`).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('the card tokens are one set: the three of them are defined, and the shadow is never "none"', () => {
    for (const token of ['--card-fill', '--card-line', '--card-shadow']) expect(t[token], token).toBeTruthy();
    expect(t['--card-shadow']).not.toBe('none');
  });
});
