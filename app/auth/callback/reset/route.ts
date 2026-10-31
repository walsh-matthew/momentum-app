import { NextResponse, type NextRequest } from 'next/server';
import { exchangeAuthCode, verifyRecoveryToken } from '@/lib/services/auth';

// Landing point of the emailed password reset link. The link is a token link, /auth/callback/reset?token_hash=...&type=recovery
// (MOM-122), which opens in any browser because it needs nothing kept by the browser that asked. The older
// /auth/callback/reset?code=... link (reset emails sent before the token template) is still accepted; it works only
// in the browser that asked.
// It is public because /auth/callback/ is (lib/supabase/proxy.ts): the link arrives before the browser holds a
// session. A good token or code becomes the recovery session and the person goes on to /auth/reset, which is not
// public. A stale, used or foreign one goes back to /login, which offers to send another link. A good token also sets
// the signed marker cookie that /auth/reset needs (lib/services/recoveryMarker.ts); without RECOVERY_COOKIE_SECRET the
// token path is refused and only the older code link works.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const code = request.nextUrl.searchParams.get('code');
  const target = request.nextUrl.clone();
  const secure = target.protocol === 'https:';
  target.search = '';

  if (tokenHash && type === 'recovery') {
    const verified = await verifyRecoveryToken(tokenHash);
    if (verified.ok) {
      target.pathname = '/auth/reset';
      const response = NextResponse.redirect(target);
      const { name, value, maxAge } = verified.data.cookie;
      response.cookies.set(name, value, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge });
      return response;
    }
  } else if (!tokenHash && code) {
    const exchanged = await exchangeAuthCode(code);
    if (exchanged.ok) {
      target.pathname = '/auth/reset';
      return NextResponse.redirect(target);
    }
  }
  target.pathname = '/login';
  target.searchParams.set('error', 'reset');
  return NextResponse.redirect(target);
}
