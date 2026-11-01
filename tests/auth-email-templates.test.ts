// The two auth emails Momentum sends (MOM-149): sign-up confirmation and password reset. Each names Momentum, has one
// button and the plain link written out, says what happens if ignored, and has no image, tracking or other link.
// The link formats are the ones the callbacks expect (app/auth/callback/route.ts, app/auth/callback/reset/route.ts).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, parseColour } from './helpers/color';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const config = read('supabase/config.toml');

// The light-mode accent, written as a hex because mail apps do not read oklch(): the value of --accent in :root of
// app/globals.css, converted (oklch(0.52 0.135 132)).
const BUTTON = '#4a7814';

const EMAILS = [
  {
    name: 'confirmation',
    file: 'supabase/templates/confirmation.html',
    subject: 'Confirm your email for Momentum',
    link: '{{ .ConfirmationURL }}',
    button: 'Confirm my email',
    words: [
      'Thanks for signing up for Momentum.',
      'If you didn&#39;t sign up for Momentum, ignore this email. The account stays unconfirmed and can&#39;t be used.',
      'If the link has expired, sign up again with this same address and we&#39;ll send you a new one.',
    ],
  },
  {
    name: 'recovery',
    file: 'supabase/templates/recovery.html',
    subject: 'Set a new password for Momentum',
    link: '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery',
    button: 'Set a new password',
    words: [
      'We got a request to reset the password for the Momentum account at this address.',
      'The link works once, from any browser or device, and expires in an hour.',
      'If you didn&#39;t ask for this, ignore this email. Your password stays as it is.',
    ],
  },
] as const;

describe.each(EMAILS)('the $name email', (email) => {
  const html = read(email.file);

  it('is wired into the local stack with its subject and file', () => {
    const block = new RegExp(
      `\\[auth\\.email\\.template\\.${email.name}\\]\\s*subject = "([^"]+)"\\s*content_path = "([^"]+)"`,
    ).exec(config);
    expect(block?.[1]).toBe(email.subject);
    expect(block?.[2]).toBe(`./${email.file}`);
  });

  it('names Momentum, says why it came and what happens if it is ignored', () => {
    expect(html).toContain('>Momentum</p>');
    for (const line of email.words) expect(html).toContain(line);
  });

  it('has one button, and the same link written out in plain text', () => {
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([email.link]);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`>${email.button}</a>`);
    expect(html).toContain('If the button doesn&#39;t work, copy this link into your browser:');
    // Once as the button's address, once written out.
    expect(html.split(email.link)).toHaveLength(3);
  });

  it('has no image, tracking, script or outside address, and styles are inline', () => {
    expect(html).not.toMatch(/<img|<script|<link|<style|<iframe|background-image|url\(/i);
    expect(html).not.toMatch(/utm_|pixel|track/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it('fixes the button colours so it is never greyed out, in a light or a dark mail app', () => {
    const style = /<a [^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(style).toContain(`background-color:${BUTTON}`);
    expect(style).toContain(';color:#ffffff');
  });

  it("uses Momentum's light-mode accent for the button, never the old blue", () => {
    expect(html).toContain(BUTTON);
    expect(html).not.toContain('#1d4ed8');
  });
});

describe("the emails' button colour", () => {
  it("is the app's light-mode accent, within one step of each channel", () => {
    const globals = read('app/globals.css');
    // The first oklch --accent in the file is the light theme's (the dark theme's is a hex).
    const accent = /--accent:\s*(oklch\([^)]*\))/.exec(globals)?.[1];
    expect(accent).toBeTruthy();
    const want = parseColour(accent as string).rgb;
    const got = parseColour(BUTTON).rgb;
    for (let i = 0; i < 3; i++) expect(Math.abs(want[i] - got[i]) * 255).toBeLessThan(1);
  });

  it('holds 4.5:1 against its white text', () => {
    expect(contrast(parseColour('#ffffff').rgb, parseColour(BUTTON).rgb)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the emails promise what the stack sets', () => {
  it('says "an hour" only while the email link expiry is 3600 seconds', () => {
    expect(config).toMatch(/^otp_expiry = 3600$/m);
  });

  it('configures no email Momentum does not send', () => {
    expect(config).not.toMatch(/^\[auth\.email\.template\.(invite|magic_link|email_change|reauthentication)\]/m);
  });
});
