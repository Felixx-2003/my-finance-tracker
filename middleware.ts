import { NextRequest, NextResponse } from 'next/server';
import { cloudMode, sessionCookie, validSession } from './lib/cloud-auth';

export async function middleware(request: NextRequest) {
  if (!cloudMode()) return NextResponse.next();
  const secret = process.env.AUTH_SECRET || '';
  const password = process.env.APP_PASSWORD || '';
  if (!password || secret.length < 32) return new NextResponse('Cloud sign-in is not configured.', { status: 503 });

  const path = request.nextUrl.pathname;
  if (path === '/login' || path === '/api/login') return NextResponse.next();
  if (await validSession(request.cookies.get(sessionCookie)?.value, secret)) return NextResponse.next();
  if (path.startsWith('/api/')) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  const login = new URL('/login', request.url);
  login.searchParams.set('next', path === '/' ? '/' : path);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };
