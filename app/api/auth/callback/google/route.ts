import { NextResponse, type NextRequest } from 'next/server';
import { GOOGLE_STATE_COOKIE, completeGoogleConnect } from '@/lib/services/googleOAuth';

// Where Google sends the user back (MOM-62). An authenticated route: it is not in PUBLIC_PATHS in
// lib/supabase/proxy.ts, so a signed-out visitor is sent to /login before this runs, and the service checks the
// session again. It verifies state, exchanges the code on the server and stores the tokens; see
// lib/services/googleOAuth.ts. The only thing that goes in the redirect is a fixed outcome code: never a token,
// the code Google sent, or anything Google wrote.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;

  const outcome = await completeGoogleConnect({
    origin,
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    cookieValue: request.cookies.get(GOOGLE_STATE_COOKIE)?.value,
  });

  const target = new URL(outcome === 'signed_out' ? '/login' : '/connections', origin);
  if (outcome !== 'signed_out') target.searchParams.set('google', outcome);
  const response = NextResponse.redirect(target, 303);
  // The state is single-use, whatever happened.
  response.cookies.set(GOOGLE_STATE_COOKIE, '', { httpOnly: true, path: '/api/auth/callback/google', maxAge: 0 });
  return response;
}
