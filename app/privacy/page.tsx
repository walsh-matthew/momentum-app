import type { Metadata } from 'next';
import { PageBackRow } from '@/components/layout/PageBackRow';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';
import { getCurrentUser } from '@/lib/services/auth';

export const metadata: Metadata = {
  title: 'Privacy notice · Momentum',
  description: 'What Momentum stores, what it sends to Claude, and how to have your data deleted.',
};

// Public: reachable signed out (PUBLIC_PATHS in lib/supabase/proxy.ts), and linked from sign-up on /login. A signed-in visitor gets
// the way home and Sign out (MOM-148) in place of the notice's "Back to sign in"; a signed-out visitor sees the page as before.
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const user = await getCurrentUser().catch(() => null);
  const signedIn = user !== null && user.ok && user.data !== null;
  return (
    <div className="mx-auto w-full max-w-2xl p-4 py-8">
      {signedIn && <PageBackRow className="mb-3" />}
      <main>
        <PrivacyNotice signedIn={signedIn} />
      </main>
    </div>
  );
}
