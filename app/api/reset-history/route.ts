import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resetHistory } from '@/lib/reset-history';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== 'RESET_HISTORY') {
    return NextResponse.json({ ok: false, error: 'Confirm before clearing your history.' }, { status: 400 });
  }
  try {
    const result = await resetHistory(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not clear history. Your records have not been changed.' }, { status: 500 });
  }
}
