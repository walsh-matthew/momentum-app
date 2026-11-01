import type { Metadata, Viewport } from 'next';
import { chromeColor } from '@/lib/theme/theme';
import { getStoredTheme } from '@/lib/theme/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Momentum',
  description: 'AI-powered Life Operating System',
};

// The app follows the device unless the person chose (MOM-30): the browser chrome takes the chosen theme's colour, or with no choice
// the device's (MOM-145).
export async function generateViewport(): Promise<Viewport> {
  return {
    colorScheme: 'light dark',
    themeColor: chromeColor(await getStoredTheme()),
    width: 'device-width',
    initialScale: 1,
  };
}

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
