import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthBrand, LINK_CLASS } from '@/components/auth/AuthCardParts';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { getCurrentUser, hasRecoverySession } from '@/lib/services/auth';

// Reads the signed-in user's session, so this page renders per request.
export const dynamic = 'force-dynamic';

// The page behind the emailed reset link. It is not a public path: /auth/callback/reset turns the link's code into
// the recovery session first, and proxy.ts sends anyone without a session to /login. A session that did not come
// from a reset link (a normal sign-in) sees a fixed message instead of the form.
export default async function ResetPasswordPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const recovering = await hasRecoverySession().catch(() => false);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      {recovering ? (
        <ResetPasswordForm />
      ) : (
        <div className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
          <AuthBrand />
          <h1 className="text-lg font-semibold tracking-[-0.03em]">This link has expired</h1>
          <p className="text-sm text-muted">
            This page opens from the link in a password reset email, and that link works once. Sign out and ask for a new
            one from the sign-in page.
          </p>
          <SignOutButton bordered className="w-fit" />
          <Link href="/" className={`${LINK_CLASS} self-start`}>
            Back to Momentum
          </Link>
        </div>
      )}
    </main>
  );
}
