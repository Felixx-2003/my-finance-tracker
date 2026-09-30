import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { seed } from '@/prisma/seed';

export async function POST() {
  try { await seed(prisma); return NextResponse.json({ok:true}); }
  catch(e) { return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Could not reset data.'},{status:500}); }
}
