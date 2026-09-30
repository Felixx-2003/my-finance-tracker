import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

if (!process.argv.includes('--apply')) {
  console.error('Pass --apply after verifying DATABASE_URL points to your private cloud database.');
  process.exit(1);
}
if (!process.env.DATABASE_URL?.startsWith('postgresql://') && !process.env.DATABASE_URL?.startsWith('postgres://')) {
  console.error('DATABASE_URL must be a Postgres connection string.');
  process.exit(1);
}
if (!process.env.DIRECT_URL?.startsWith('postgresql://') && !process.env.DIRECT_URL?.startsWith('postgres://')) {
  console.error('DIRECT_URL must be a Postgres connection string.');
  process.exit(1);
}

const source = new DatabaseSync(resolve(process.env.LOCAL_DB_PATH || 'prisma/dev.db'), { readOnly: true });
const cloud = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
const rows = table => source.prepare(`SELECT * FROM "${table}"`).all();
const booleans = values => values.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, ['favorite', 'onboarded'].includes(key) ? Boolean(value) : value])));
const dates = values => values.map(row => ({ ...row, date: new Date(row.date), createdAt: new Date(row.createdAt) }));

try {
  const settings = booleans(rows('Settings'));
  const categories = booleans(rows('Category'));
  const accounts = rows('Account');
  const people = rows('PaybackPerson');
  const transactions = dates(rows('Transaction'));
  const budgets = rows('Budget');
  const paybacks = rows('Payback');
  const existing = await cloud.transaction.count();
  if (existing || await cloud.account.count() || await cloud.category.count()) {
    throw new Error('Cloud database must be empty before import to avoid merging unrelated finance records.');
  }
  await cloud.$transaction(async tx => {
    for (const row of settings) await tx.settings.upsert({ where: { id: row.id }, create: row, update: row });
    await tx.category.createMany({ data: categories });
    await tx.account.createMany({ data: accounts });
    await tx.paybackPerson.createMany({ data: people });
    await tx.budget.createMany({ data: budgets });
    await tx.transaction.createMany({ data: transactions });
    await tx.payback.createMany({ data: paybacks });
    for (const table of ['Category', 'Account', 'PaybackPerson', 'Budget', 'Transaction', 'Payback']) {
      await tx.$queryRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`);
    }
  }, { timeout: 120000 });
  console.log(`Imported ${accounts.length} accounts, ${categories.length} categories, and ${transactions.length} transactions.`);
} finally {
  source.close();
  await cloud.$disconnect();
}
