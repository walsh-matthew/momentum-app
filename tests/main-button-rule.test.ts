// MOM-145: the main-button rule, enforced across the app's components. A main button is the solid accent button of a screen: a default
// <Button>, a <MainButton>, a <SetupButton tone="main">, or any button the markup fills with bg-primary. It is never disabled and never
// faded. While work is in flight it stays solid and says so (aria-busy, lib/forms/mainButton.ts); when a single-answer input has no value
// the button is not rendered at all, and a form with several fields answers a tap with a callout (lib/forms/missing.ts).
// Pure: it reads the source, with no browser and no network.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const BACKSLASH = String.fromCharCode(92);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.tsx') ? [path] : [];
  });
const FILES = walk(join(ROOT, 'components')).map((p) => relative(ROOT, p).split(sep).join('/'));

// Files that are not a place a main button is used, and why.
const EXEMPT: Record<string, string> = {
  'components/ui/button.tsx': 'the definition of the shared Button: its base styles fade any disabled button, and no main one is disabled',
  'components/setup/SetupButton.tsx': 'the definition of the setup button (a main one takes busy instead of disabled)',
  'components/setup/AnswerChoice.tsx': 'an answer is filled only while it is enabled (filled = main and not disabled), so a locked one is not a main button',
};

interface Tag {
  file: string;
  line: number;
  name: string;
  text: string;
}

// Every opening tag of the button components, up to its closing ">" (braces, strings and arrow functions skipped).
function tagsIn(file: string): Tag[] {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const tags: Tag[] = [];
  const open = /<(Button|button|SetupButton|MainButton)\b/g;
  for (let m = open.exec(source); m; m = open.exec(source)) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote && source[i - 1] !== BACKSLASH) quote = null;
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    tags.push({ file, line: source.slice(0, m.index).split('\n').length, name: m[1], text: source.slice(m.index, i + 1) });
  }
  return tags;
}

// A choice (a radio, a toggle) that is chosen is filled too, but it is a choice, not the screen's main button.
const isChoice = (t: Tag) => /role="radio"|aria-pressed|type="radio"|type="checkbox"/.test(t.text);
const hasVariant = (t: Tag) => /\bvariant=/.test(t.text);
const isMain = (t: Tag): boolean => {
  if (isChoice(t)) return false;
  if (t.name === 'MainButton') return true;
  if (t.name === 'Button') return !hasVariant(t);
  if (t.name === 'SetupButton') return /tone=("main"|\{[^}]*'main')/.test(t.text) && !/tone=\{[^}]*'second'/.test(t.text.replace(/'main'/, ''));
  return /\bbg-primary\b/.test(t.text);
};
// What makes a button disabled or faded, in its own tag.
const FADE = [/\bdisabled\b(?!:)/, /\baria-disabled\b/, /\bdisabled:/, /\bopacity-\d/, /\bopacity:/];
const faded = (t: Tag) => FADE.some((re) => re.test(t.text));

const all = FILES.filter((f) => !(f in EXEMPT)).flatMap(tagsIn);
const mains = all.filter(isMain);

describe('the main-button rule', () => {
  it('finds the main buttons it is meant to (so an empty sweep cannot pass)', () => {
    const where = new Set(mains.map((t) => t.file));
    for (const file of [
      'components/auth/SignInForm.tsx',
      'components/auth/ResetPasswordForm.tsx',
      'components/goals/GoalBuilderWizard.tsx',
      'components/review/ReviewSitting.tsx',
      'components/rebalance/RebalanceDrawer.tsx',
      'components/setup/AnswerBox.tsx',
      'components/setup/QuickPathCard.tsx',
      'components/entries/NumberControl.tsx',
      'components/integrations/ConnectionControls.tsx',
    ]) expect(where.has(file), file).toBe(true);
    expect(mains.length).toBeGreaterThan(20);
  });

  it('no main button is disabled or faded', () => {
    const offenders = mains.filter(faded).map((t) => `${t.file}:${t.line} <${t.name}> ${t.text.replace(/\s+/g, ' ').slice(0, 140)}`);
    expect(offenders).toEqual([]);
  });

  it('every exemption names a file that exists', () => {
    for (const file of Object.keys(EXEMPT)) expect(statSync(join(ROOT, file)).isFile(), file).toBe(true);
  });

  it('the shared SetupButton and Button base styles are the only place a faded look can come from, and a main SetupButton takes busy', () => {
    const setup = readFileSync(join(ROOT, 'components/setup/SetupButton.tsx'), 'utf8');
    expect(setup).toMatch(/busy\?: boolean/);
    expect(setup).toMatch(/busyProps/);
    expect(readFileSync(join(ROOT, 'app/globals.css'), 'utf8')).not.toMatch(/main-disabled/);
  });
});
