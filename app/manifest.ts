import type { MetadataRoute } from 'next';

// The web manifest (MOM-142): what a phone reads when the site is added to the home screen. It names the app and its
// colors and nothing else, because the repo is public. The colors match the viewport's theme color in app/layout.tsx;
// the app is dark only today, so they can follow the light palette once MOM-30 merges. The icon files are made by
// scripts/render-icons.ts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Momentum',
    short_name: 'Momentum',
    start_url: '/',
    display: 'standalone',
    background_color: '#111513',
    theme_color: '#111513',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
