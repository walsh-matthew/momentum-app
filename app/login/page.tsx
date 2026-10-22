import { SignInForm } from '@/components/auth/SignInForm';

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const initialError = error === 'confirmation' ? 'That confirmation link is invalid or has expired. Sign in, or create the account again.' : null;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <SignInForm initialError={initialError} />
    </main>
  );
}
