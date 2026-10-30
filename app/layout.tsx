import type { Metadata, Viewport } from 'next';
import { getStoredTheme } from '@/lib/theme/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Momentum',
  description: 'AI-powered Life Operating System',
};

// The app follows the device unless the person chose (MOM-30): the browser chrome takes the matching colour.
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f3' },
    { media: '(prefers-color-scheme: dark)', color: '#111513' },
  ],
  width: 'device-width',
  initialScale: 1,
};

interface RootLayoutProps {
  children: React.ReactNode;
}

// data-theme is set only when the person chose a theme; with none, app/globals.css follows the device on its own. Reading the
// cookie here (on the server) is what makes the choice paint with no flash on a reload.
export default async function RootLayout({ children }: RootLayoutProps) {
  const theme = await getStoredTheme();
  return (
    <html lang="en" data-theme={theme ?? undefined}>
      <body>{children}</body>
    </html>
  );
}
