// The home-screen icon, apple-icon and web manifest (MOM-142).
//
// Next.js serves `app/icon.png`, `app/apple-icon.png` and `app/manifest.ts` as routes by file name alone, so a
// renamed or deleted file would drop the home-screen icon with no error. These tests pin the three files, the
// manifest's approved fields, and that every icon the manifest names exists in `public/`.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { config } from '@/proxy';

const ROOT = process.cwd();
const PNG_SIGNATURE = '89504e470d0a1a0a';

// The width and height stored in a PNG's header.
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(path.join(ROOT, file));
  expect(bytes.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('home-screen icons', () => {
  it('has the icon and apple-icon route files as square PNGs', () => {
    expect(pngSize('app/icon.png')).toEqual({ width: 512, height: 512 });
    expect(pngSize('app/apple-icon.png')).toEqual({ width: 180, height: 180 });
  });

  it('has a manifest route', () => {
    expect(existsSync(path.join(ROOT, 'app/manifest.ts'))).toBe(true);
  });
});

describe('the sign-in proxy', () => {
  // A phone fetches the manifest and the icons with no session, so none of them may be redirected to /login.
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/manifest.webmanifest', '/icon.png', '/apple-icon.png', '/icons/icon-192.png', '/icons/icon-maskable-512.png'])(
    'does not run on %s',
    (pathname) => {
      expect(matcher.test(pathname)).toBe(false);
    },
  );

  it.each(['/', '/settings', '/login'])('still runs on the page %s', (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });
});

describe('web manifest', () => {
  const result = manifest();

  it('names the app, its colors and its start URL, and nothing personal', () => {
    expect(result).toMatchObject({
      name: 'Momentum',
      short_name: 'Momentum',
      start_url: '/',
      display: 'standalone',
      background_color: '#111513',
      theme_color: '#111513',
    });
    expect(Object.keys(result).sort()).toEqual(
      ['background_color', 'display', 'icons', 'name', 'short_name', 'start_url', 'theme_color'].sort(),
    );
  });

  it("keeps the theme color the viewport uses for the device's dark setting", () => {
    const layout = readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
    expect(layout).toContain(`{ media: '(prefers-color-scheme: dark)', color: '${result.theme_color}' }`);
  });

  it('lists a 192 icon, a 512 icon and a maskable 512 icon, each a real PNG of its declared size', () => {
    const icons = result.icons ?? [];
    expect(icons.map((icon) => `${icon.sizes}:${icon.purpose}`).sort()).toEqual([
      '192x192:any',
      '512x512:any',
      '512x512:maskable',
    ]);
    for (const icon of icons) {
      const [width, height] = (icon.sizes ?? '').split('x').map(Number);
      expect(pngSize(path.join('public', icon.src))).toEqual({ width, height });
    }
  });
});
