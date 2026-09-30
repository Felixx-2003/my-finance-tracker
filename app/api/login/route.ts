import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cloudMode, issueSession, sessionCookie } from '@/lib/cloud-auth';

export async function POST(request: NextRequest) {
  if (!cloudMode()) return NextResponse.json({ ok: true });
  const expected = process.env.APP_PASSWORD || '';
  const secret = process.env.AUTH_SECRET || '';
  if (!expected || secret.length < 32) return NextResponse.json({ ok: false, error: 'Cloud sign-in is not configured.' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const actualHash = createHash('sha256').update(password).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(actualHash, expectedHash)) {
    await new Promise(resolve => setTimeout(resolve, 400));
    return NextResponse.json({ ok: false, error: 'Incorrect password.' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie, await issueSession(secret), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 14 * 24 * 60 * 60,
  });
  return response;
}
