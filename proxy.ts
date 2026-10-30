import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except Next internals and static files. The web manifest is skipped too: a phone fetches it without a
  // session, and a redirect to /login would break adding the site to the home screen (MOM-142).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
