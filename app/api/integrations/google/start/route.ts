import { NextResponse, type NextRequest } from 'next/server';
import { beginGoogleConnect } from '@/lib/services/googleOAuth';

// Starts the Google Calendar consent flow for the signed-in user (MOM-62): sends them to Google's consent screen
// and sets the short-lived state cookie the callback checks. A POST, from the "Connect" button's form, so a link or
// a prefetch cannot start it. proxy.ts already sends a signed-out visitor to /login; the service checks the
// session again. All the logic is in lib/services/googleOAuth.ts.
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const started = await beginGoogleConnect(origin);

  if (!started.ok) {
    const target = new URL(started.outcome === 'signed_out' ? '/login' : '/connections', origin);
    if (started.outcome !== 'signed_out') target.searchParams.set('google', started.outcome);
    return NextResponse.redirect(target, 303);
  }

  const response = NextResponse.redirect(started.redirectTo, 303);
  response.cookies.set(started.cookie.name, started.cookie.value, {
    httpOnly: true,
    // Lax: the callback is a top-level navigation back from Google, which Lax allows and Strict would drop.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    // Only the callback needs it.
    path: '/api/auth/callback/google',
    maxAge: started.cookie.maxAge,
  });
  return response;
}
