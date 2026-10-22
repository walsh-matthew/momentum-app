// Session refresh and route protection for proxy.ts (Next.js 16 renamed Middleware to Proxy).
// Refreshing the session here is what lets Server Components, which cannot write cookies, keep
// reading a valid one. This is an optimistic gate: services still authenticate every read and
// write through RLS and getUser() (CLAUDE.md, Security).

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnv } from '@/lib/config/env';
import type { Database } from '@/types/database.types';

// Reachable without a session. /auth/callback completes the email-confirmation link, which
// arrives before the browser holds a session.
const PUBLIC_PATHS = ['/login', '/auth/callback'];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = getPublicEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, cacheHeaders) => {
        // Refreshed tokens go on the request (so this render sees them) and on the response (so
        // the browser stores them). The cache headers keep a CDN from sharing one user's cookies.
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getUser() revalidates the token with Supabase Auth; getSession() would trust the cookie.
  const { data } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (!data.user && !isPublicPath(pathname)) return redirectKeepingCookies(request, response, '/login');
  if (data.user && pathname === '/login') return redirectKeepingCookies(request, response, '/');
  return response;
}

// A redirect is a new response, so the refreshed cookies and cache headers must be copied over.
function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = '';
  const redirect = NextResponse.redirect(target);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  from.headers.forEach((value, key) => {
    if (key === 'cache-control' || key === 'expires' || key === 'pragma') redirect.headers.set(key, value);
  });
  return redirect;
}
