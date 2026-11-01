import { CreateAccountForm } from '@/components/auth/CreateAccountForm';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { SignInForm } from '@/components/auth/SignInForm';
import { getCaptchaConfig } from '@/lib/config/env';

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reset?: string; signup?: string }>;
}

const ERRORS: Record<string, string> = {
  confirmation: 'That confirmation link is invalid or has expired. Sign in, or create the account again.',
  reset: 'That reset link is invalid or has expired. Enter your email and we will send a new one.',
};

// The sign-in card, the create-account card (?signup=1), or the forgot-password card when the address asks for it (?reset=1)
// or an emailed reset link did not work (?error=reset). The CAPTCHA is read here, on the server, and only its public site key is passed on.
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, reset, signup } = await searchParams;
  const initialError = (error && ERRORS[error]) || null;
  const captcha = getCaptchaConfig();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      {reset === '1' || error === 'reset' ? (
        <ForgotPasswordForm initialError={initialError} captcha={captcha} />
      ) : signup === '1' ? (
        <CreateAccountForm captcha={captcha} />
      ) : (
        <SignInForm initialError={initialError} captcha={captcha} />
      )}
    </main>
  );
}
