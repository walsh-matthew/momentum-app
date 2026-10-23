import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { PageFrame } from '@/components/layout/PageFrame';
import { getCurrentUser } from '@/lib/services/auth';

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
        <h2 id="account-heading" className="section-title">
          Account
        </h2>
        <p className="mt-2 text-sm text-muted">
          Signed in as <span className="font-medium text-foreground">{user.data.email ?? 'your account'}</span>.
        </p>
        <SignOutButton bordered className="mt-3 w-fit" />
      </section>
      <p className="mt-4 max-w-xl text-sm text-muted">More settings will appear here.</p>
    </PageFrame>
  );
}
