// One-off render of the home-screen icons from the logo mark (MOM-142): a lime tile with the italic Georgia "m" in
// dark green, the same mark the header draws. The "m" is centered by its inked pixels (the glyph's real bounds), not
// by the font's line box, so it sits in the middle of the tile at every size.
//
// Rerun it only when the mark changes, from the repo root:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/render-icons.ts
// and commit the PNGs. Add `--previews <dir>` to also write home-screen preview images into <dir>.
//
// It uses `sharp`, which Next.js already installs; it is not a dependency of the app and is not in package.json.
// The "m" is drawn with the machine's Georgia (or a serif fallback), so run it where Georgia is installed.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const LIME = '#c6f36d';
const INK = '#1a2412';
const ROOT = path.resolve(import.meta.dirname, '..');

// The "m" is this share of the tile's width; the maskable icon shrinks it to keep it inside Android's 80% safe zone.
const MARK_WIDTH_SHARE = 0.62;
const MASKABLE_SCALE = 0.78;

interface IconTarget {
  file: string;
  size: number;
  scale: number;
}

const TARGETS: IconTarget[] = [
  { file: 'app/icon.png', size: 512, scale: 1 },
  { file: 'app/apple-icon.png', size: 180, scale: 1 },
  { file: 'public/icons/icon-192.png', size: 192, scale: 1 },
  { file: 'public/icons/icon-512.png', size: 512, scale: 1 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, scale: MASKABLE_SCALE },
];

// The "m" alone on a transparent canvas, trimmed to its inked pixels, sized to the share of the tile asked for.
async function inkedMark(tileSize: number, scale: number): Promise<Buffer> {
  const fontSize = tileSize * 1.4;
  const canvas = Math.round(fontSize * 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}">
<text x="${canvas / 2}" y="${canvas * 0.62}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700" font-size="${fontSize}" fill="${INK}" letter-spacing="${-0.13 * fontSize}">m</text></svg>`;
  const trimmed = await sharp(Buffer.from(svg)).trim().png().toBuffer();
  const targetWidth = Math.round(tileSize * MARK_WIDTH_SHARE * scale);
  return sharp(trimmed).resize({ width: targetWidth }).png().toBuffer();
}

async function renderIcon({ size, scale }: IconTarget): Promise<Buffer> {
  const mark = await inkedMark(size, scale);
  const { width, height } = await sharp(mark).metadata();
  if (!width || !height) throw new Error('Could not measure the rendered mark.');
  return sharp({ create: { width: size, height: size, channels: 4, background: LIME } })
    .composite([{ input: mark, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png()
    .toBuffer();
}

// How far the dark pixels' center is from the tile's center, in pixels (should be within 1).
async function inkOffset(icon: Buffer): Promise<{ dx: number; dy: number }> {
  const { data, info } = await sharp(icon).greyscale().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < 128) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { dx: (minX + maxX + 1) / 2 - info.width / 2, dy: (minY + maxY + 1) / 2 - info.height / 2 };
}

// Previews of the icons on a dark and a light home screen, and Android's circle crop of the plain vs maskable icon.
async function writePreviews(dir: string, icons: Map<string, Buffer>): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const rounded = async (icon: Buffer, px: number) => {
    const mask = Buffer.from(`<svg width="${px}" height="${px}"><rect width="${px}" height="${px}" rx="${Math.round(px * 0.2237)}" fill="#fff"/></svg>`);
    return sharp(icon).resize(px, px).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  };
  const items: [string, number, string][] = [
    ['app/apple-icon.png', 180, 'iPhone 180'],
    ['public/icons/icon-192.png', 192, 'Android 192'],
    ['app/icon.png', 96, 'tab icon, 2x'],
    ['app/icon.png', 64, 'small tab icon, 2x'],
  ];
  for (const [name, bg, fg, label] of [
    ['1-home-screen-dark.png', '#0b0d0c', '#cfd6d1', 'Dark home screen'],
    ['2-home-screen-light.png', '#f1f1f4', '#222222', 'Light home screen'],
  ]) {
    const comps = [];
    let labels = '';
    let x = 40;
    for (const [file, px, text] of items) {
      comps.push({ input: await rounded(icons.get(file)!, px), left: x, top: 150 + Math.round((192 - px) / 2) });
      labels += `<text x="${x}" y="400" fill="${fg}" font-family="Arial" font-size="18">${text}</text>`;
      x += 220;
    }
    const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520"><rect width="900" height="520" fill="${bg}"/><text x="40" y="70" fill="${fg}" font-family="Arial" font-size="26" font-weight="700">${label}</text>${labels}<text x="40" y="450" fill="${fg}" font-family="Arial" font-size="18">name under each icon: Momentum</text></svg>`);
    await sharp(base).composite(comps).png().toFile(path.join(dir, name));
  }
  const circle = Buffer.from('<svg width="192" height="192"><circle cx="96" cy="96" r="96" fill="#fff"/></svg>');
  const crop = (icon: Buffer) => sharp(icon).resize(192, 192).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  await sharp({ create: { width: 480, height: 260, channels: 3, background: '#f1f1f4' } })
    .composite([
      { input: await crop(icons.get('public/icons/icon-512.png')!), left: 30, top: 34 },
      { input: await crop(icons.get('public/icons/icon-maskable-512.png')!), left: 258, top: 34 },
    ])
    .png()
    .toFile(path.join(dir, '3-android-circle-plain-vs-maskable.png'));
  await sharp(icons.get('app/icon.png')!).toFile(path.join(dir, '4-icon-512.png'));
}

async function main(): Promise<void> {
  const icons = new Map<string, Buffer>();
  for (const target of TARGETS) {
    const icon = await renderIcon(target);
    const { dx, dy } = await inkOffset(icon);
    console.log(`${target.file} ${target.size}px: ink center off by ${dx.toFixed(1)}, ${dy.toFixed(1)} px`);
    if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) throw new Error(`The mark is off center in ${target.file}.`);
    const out = path.join(ROOT, target.file);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, icon);
    icons.set(target.file, icon);
  }
  const flag = process.argv.indexOf('--previews');
  if (flag !== -1 && process.argv[flag + 1]) await writePreviews(path.resolve(process.argv[flag + 1]), icons);
}

void main();
