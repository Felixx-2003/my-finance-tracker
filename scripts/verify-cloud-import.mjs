import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

const local = new DatabaseSync('prisma/dev.db', { readOnly: true });
const cloud = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
const models = [
  ['Settings', 'settings'], ['Category', 'category'], ['Account', 'account'],
  ['Budget', 'budget'], ['PaybackPerson', 'paybackPerson'],
  ['Transaction', 'transaction'], ['Payback', 'payback'],
];
const normalized = row => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key,
  value instanceof Date ? value.getTime() : ['onboarded', 'favorite'].includes(key) ? Boolean(value) : value,
]));

try {
  for (const [table, model] of models) {
    const left = local.prepare(`SELECT * FROM "${table}" ORDER BY id`).all().map(normalized);
    const right = (await cloud[model].findMany({ orderBy: { id: 'asc' } })).map(normalized);
    if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${table} differs from local SQLite.`);
    console.log(`${table}: ${right.length} records match`);
  }
} finally {
  local.close();
  await cloud.$disconnect();
}
