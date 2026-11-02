import { NextResponse, type NextRequest } from 'next/server';
import { exchangeAuthCode, getCurrentUser, verifyConfirmationToken } from '@/lib/services/auth';

// Landing point of the emailed confirmation link. The link is a token link, /auth/callback?token_hash=...&type=email (MOM-163),
// which signs the person in in whichever browser opens it. The older /auth/callback?code=... link (emails sent before the token
// template) is still accepted; it works only in the browser that signed up.
// A link that does not work goes to /login with a plain line, except when the browser already holds a session (the person is
// signed in, for example the link was opened twice): then it goes home with no message, because a signed-in person has nothing to fix.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const code = request.nextUrl.searchParams.get('code');
  const target = request.nextUrl.clone();
  target.search = '';

  let worked = false;
  if (tokenHash && type) worked = (await verifyConfirmationToken(tokenHash, type)).ok;
  else if (!tokenHash && code) worked = (await exchangeAuthCode(code)).ok;

  if (!worked) {
    const current = await getCurrentUser();
    worked = current.ok && current.data !== null;
  }
  if (worked) {
    target.pathname = '/';
    return NextResponse.redirect(target);
  }
  target.pathname = '/login';
  target.searchParams.set('error', 'confirmation');
  return NextResponse.redirect(target);
}
