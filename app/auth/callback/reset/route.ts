import { NextResponse, type NextRequest } from 'next/server';
import { exchangeAuthCode } from '@/lib/services/auth';

// Landing point of the emailed password reset link: /auth/callback/reset?code=...
// It is public because /auth/callback/ is (lib/supabase/proxy.ts): the link arrives before the browser holds a
// session. A good code becomes the recovery session and the person goes on to /auth/reset, which is not public.
// A stale, used or foreign code goes back to /login, which offers to send another link.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const target = request.nextUrl.clone();
  target.search = '';

  if (code) {
    const result = await exchangeAuthCode(code);
    if (result.ok) {
      target.pathname = '/auth/reset';
      return NextResponse.redirect(target);
    }
  }
  target.pathname = '/login';
  target.searchParams.set('error', 'reset');
  return NextResponse.redirect(target);
}
