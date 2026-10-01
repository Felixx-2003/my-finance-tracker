import type { PrismaClient } from '@prisma/client';
import { todayKL } from './finance';

/** Clear financial records together so a failed reset leaves the database intact. */
export async function resetHistory(db: PrismaClient) {
  const startedOn = todayKL();
  await db.$transaction([
    db.payback.deleteMany(),
    db.transaction.deleteMany(),
    db.paybackPerson.deleteMany(),
    db.budget.deleteMany(),
    db.account.updateMany({ data: { openingBalance: 0 } }),
  ]);
  return { startedOn };
}
