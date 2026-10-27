import type { Metadata } from 'next';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';

export const metadata: Metadata = {
  title: 'Privacy notice · Momentum',
  description: 'What Momentum stores, what it sends to Claude, and how to have your data deleted.',
};

// Public: reachable signed out (PUBLIC_PATHS in lib/supabase/proxy.ts), and linked from sign-up on /login.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 py-8">
      <PrivacyNotice />
    </main>
  );
}
