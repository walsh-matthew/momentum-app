import type { MetadataRoute } from 'next';

// The web manifest (MOM-142): what a phone reads when the site is added to the home screen. It names the app and its
// colors and nothing else, because the repo is public. A manifest holds one theme color, so it matches the viewport's
// dark theme color in app/layout.tsx (MOM-30 added a light one beside it). The icon files are made by
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
