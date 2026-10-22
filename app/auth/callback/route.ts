import { NextResponse, type NextRequest } from 'next/server';
import { exchangeAuthCode } from '@/lib/services/auth';

// Landing point of the emailed confirmation link: /auth/callback?code=...
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const target = request.nextUrl.clone();
  target.search = '';

  if (code) {
    const result = await exchangeAuthCode(code);
    if (result.ok) {
      target.pathname = '/';
      return NextResponse.redirect(target);
    }
  }
  target.pathname = '/login';
  target.searchParams.set('error', 'confirmation');
  return NextResponse.redirect(target);
}
