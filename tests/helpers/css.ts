// A small reader for app/globals.css (MOM-30), enough for the theme tests: it splits the sheet into rules with the at-rules they
// sit in, reads each rule's declarations, and resolves var() and the two arithmetic forms the stylesheet uses (max() and calc()
// of percentages). It is not a CSS parser: it relies on the sheet having no braces or semicolons inside strings or urls.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CssRule {
  // The at-rules around it, outermost first ("@layer components", "@media (min-width: 1200px)"), then the selector.
  path: string[];
  selector: string;
  decls: [string, string][];
}

export const readSheet = (relative: string): string => readFileSync(join(process.cwd(), relative), 'utf8');

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

export function parseRules(source: string): CssRule[] {
  const css = stripComments(source);
  const rules: CssRule[] = [];
  const walk = (start: number, end: number, path: string[]): void => {
    let i = start;
    while (i < end) {
      const open = css.indexOf('{', i);
      if (open === -1 || open >= end) return;
      // A statement before the rule (`@import '…';`) is not part of its selector.
      const prelude = squash(css.slice(i, open).split(';').pop() ?? '');
      let depth = 1;
      let j = open + 1;
      while (j < end && depth > 0) {
        if (css[j] === '{') depth += 1;
        else if (css[j] === '}') depth -= 1;
        j += 1;
      }
      const body = css.slice(open + 1, j - 1);
      if (prelude.startsWith('@') && /\{/.test(body) && !/^@(keyframes|theme)/.test(prelude)) {
        walk(open + 1, j - 1, [...path, prelude]);
      } else {
        const decls: [string, string][] = [];
        for (const part of body.split(';')) {
          const at = part.indexOf(':');
          if (at > 0 && !part.includes('{')) decls.push([squash(part.slice(0, at)), squash(part.slice(at + 1))]);
        }
        rules.push({ path, selector: prelude, decls });
      }
      i = j;
    }
  };
  walk(0, css.length, []);
  return rules;
}

export const declsOf = (rule: CssRule): Record<string, string> => Object.fromEntries(rule.decls);

// The three blocks that hold the theme tokens.
export interface ThemeBlocks {
  dark: Record<string, string>;
  lightMedia: Record<string, string>;
  lightChoice: Record<string, string>;
  darkChoice: Record<string, string>;
}
export function themeBlocks(source: string): ThemeBlocks {
  const rules = parseRules(source);
  const find = (selector: string, media: string | null) =>
    rules.find((r) => r.selector === selector && (media === null ? r.path.length === 0 : r.path.join('|') === media));
  const get = (r: CssRule | undefined, what: string) => {
    if (!r) throw new Error(`globals.css has no ${what} block`);
    return declsOf(r);
  };
  return {
    dark: get(find(':root', null), ':root'),
    lightMedia: get(find(":root:not([data-theme='dark'])", '@media (prefers-color-scheme: light)'), 'light media'),
    lightChoice: get(find(":root[data-theme='light']", null), "light choice"),
    darkChoice: get(find(":root[data-theme='dark']", null), "dark choice"),
  };
}

// var(--x) replaced by its value, repeatedly, from `tokens`; then max(N%, 0%) and calc(N% * 1) evaluated, so a value written with
// tokens compares equal to the literal it replaced.
export function resolve(value: string, tokens: Record<string, string>): string {
  let out = value;
  for (let n = 0; n < 8 && /var\(--[\w-]+\)/.test(out); n++) {
    out = out.replace(/var\((--[\w-]+)\)/g, (whole, name: string) => tokens[name] ?? whole);
  }
  out = out.replace(/max\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/g, (_w, a: string, b: string) => `${Math.max(Number(a), Number(b))}%`);
  out = out.replace(/calc\(\s*([\d.]+)%\s*\*\s*([\d.]+)\s*\)/g, (_w, a: string, b: string) => `${Number((Number(a) * Number(b)).toFixed(4))}%`);
  return squash(out);
}
