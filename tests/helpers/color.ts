// Colour maths for the theme tests (MOM-30): the colours globals.css writes (hex, oklch(), a space-separated rgb triplet), WCAG
// contrast, and the colour a translucent one comes to over a surface.

export type Rgb = [number, number, number];
export interface Colour {
  rgb: Rgb;
  alpha: number;
}

const enc = (x: number): number => {
  const v = Math.max(0, Math.min(1, x));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function oklch(l: number, c: number, hueDegrees: number): Rgb {
  const h = (hueDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    enc(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    enc(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    enc(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

const alphaOf = (text: string | undefined): number => (text === undefined ? 1 : text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text));

export function parseColour(value: string): Colour {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return { rgb: [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as Rgb, alpha: 1 };
  const ok = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (ok) return { rgb: oklch(Number(ok[1]), Number(ok[2]), Number(ok[3])), alpha: alphaOf(ok[4]) };
  const triplet = v.match(/^(\d+) (\d+) (\d+)$/);
  if (triplet) return { rgb: [Number(triplet[1]) / 255, Number(triplet[2]) / 255, Number(triplet[3]) / 255], alpha: 1 };
  throw new Error(`cannot read the colour "${value}"`);
}

// `top` painted over an opaque `under`.
export const over = (top: Colour, under: Rgb, alpha: number = top.alpha): Rgb =>
  top.rgb.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb;

const luminance = ([r, g, b]: Rgb): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
