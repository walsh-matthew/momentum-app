import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { PageFrame } from '@/components/layout/PageFrame';
import { ThemeChoice } from '@/components/settings/ThemeChoice';
import { getCurrentUser } from '@/lib/services/auth';
import { getThemeChoice } from '@/lib/theme/server';

// Reads the signed-in user's session, so this page renders per request.
export const dynamic = 'force-dynamic';

// The Settings page, a stub for now: who is signed in, and the way to sign out. proxy.ts sends a signed-out
// visitor to /login before this renders; the redirect below is the same safe default as the home page's.
export default async function SettingsPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  return (
    <PageFrame active="settings" title="Settings" userEmail={user.data.email}>
      <section aria-labelledby="account-heading" className="channel-card mt-6 max-w-xl p-5">
        <h2 id="account-heading" className="card-title">
          Account
        </h2>
        <p className="mt-2 text-sm text-muted">
          Signed in as <span className="font-medium text-foreground">{user.data.email ?? 'your account'}</span>.
        </p>
        <SignOutButton bordered className="mt-3 w-fit" />
      </section>
      <section aria-labelledby="appearance-heading" className="channel-card mt-4 max-w-xl p-5">
        <h2 id="appearance-heading" className="card-title">
          Appearance
        </h2>
        <p className="mt-2 text-sm text-muted">
          Momentum follows your device, light or dark. Choose one here to keep it that way on this browser.
        </p>
        <ThemeChoice initial={await getThemeChoice()} />
      </section>
      <p className="mt-4 max-w-xl text-sm text-muted">More settings will appear here.</p>
    </PageFrame>
  );
}
