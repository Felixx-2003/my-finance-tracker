import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resetToEmpty } from '@/lib/reset-history';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== 'RESET_TO_EMPTY') {
    return NextResponse.json({ ok: false, error: 'Confirm before resetting to empty.' }, { status: 400 });
  }
  try {
    const result = await resetToEmpty(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not reset to empty. Your records have not been changed.' }, { status: 500 });
  }
}
