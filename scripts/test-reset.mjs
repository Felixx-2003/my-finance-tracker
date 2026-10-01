import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
async function loadTypeScript(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)(name => dependencies[name] ?? require(name), exports);
  return exports;
}
const finance = await loadTypeScript('../lib/finance.ts');
const { todayKL, dbDate } = finance;
const { resetHistory, resetToEmpty } = await loadTypeScript('../lib/reset-history.ts', { './finance': finance });

const directory = await mkdtemp(join(tmpdir(), 'myfinance-reset-test-'));
const databasePath = join(directory, 'reset.db');
const url = 'file:' + databasePath.replaceAll('\\', '/');
const db = new PrismaClient({ datasourceUrl: url });
try {
  const sqlite = new DatabaseSync(databasePath);
  const migrationsDirectory = new URL('../prisma/migrations/', import.meta.url);
  for (const name of (await readdir(migrationsDirectory)).filter(name => /^\d/.test(name)).sort()) {
    sqlite.exec(await readFile(new URL(name + '/migration.sql', migrationsDirectory), 'utf8'));
  }
  sqlite.close();
  await db.settings.create({ data: { id: 1, theme: 'dark', cycleStartDay: 25, onboarded: true } });
  const category = await db.category.create({ data: { name: 'Food', kind: 'EXPENSE', icon: 'Shapes', color: '#000000' } });
  const bank = await db.account.create({ data: { name: 'Bank', type: 'Bank', openingBalance: 120000 } });
  const card = await db.account.create({ data: { name: 'Card', type: 'Credit Card', openingBalance: -30000 } });
  await db.budget.create({ data: { categoryId: category.id, amount: 50000 } });
  const expense = await db.transaction.create({ data: { type: 'EXPENSE', amount: 10000, date: dbDate('2026-09-20'), accountId: bank.id, categoryId: category.id } });
  await db.transaction.create({ data: { type: 'INCOME', amount: 300000, date: dbDate('2026-09-20'), accountId: bank.id } });
  await db.transaction.create({ data: { type: 'TRANSFER', amount: 10000, date: dbDate('2026-09-20'), fromAccountId: bank.id, toAccountId: card.id } });
  const person = await db.paybackPerson.create({ data: { name: 'Friend' } });
  await db.payback.create({ data: { transactionId: expense.id, personId: person.id, amount: 4000, receivedAmount: 1000, receivedAccountId: bank.id } });
  const snapshot = async () => ({
    settings: await db.settings.findMany(), categories: await db.category.findMany(),
    accounts: await db.account.findMany(), budgets: await db.budget.findMany(),
    transactions: await db.transaction.findMany(), people: await db.paybackPerson.findMany(), paybacks: await db.payback.findMany(),
  });
  const before = await snapshot();
  const { POST } = await loadTypeScript('../app/api/reset-history/route.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/reset-history': { resetHistory },
  });
  const request = confirmation => ({ json: async () => ({ confirmation }) });
  assert.equal((await POST({ json: async () => { throw new Error('Malformed JSON'); } })).status, 400);
  assert.equal((await POST(request(undefined))).status, 400);
  assert.equal((await POST(request('wrong'))).status, 400);
  assert.deepEqual(await snapshot(), before, 'Unconfirmed requests must not change any records');
  const triggerConnection = new DatabaseSync(databasePath);
  triggerConnection.exec("CREATE TRIGGER prevent_reset BEFORE UPDATE OF openingBalance ON Account BEGIN SELECT RAISE(ABORT, 'simulated reset failure'); END");
  triggerConnection.close();
  const failed = await POST(request('RESET_HISTORY'));
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).ok, false);
  assert.deepEqual(await snapshot(), before, 'A failed reset must roll back every deletion');
  const dropConnection = new DatabaseSync(databasePath);
  dropConnection.exec('DROP TRIGGER prevent_reset');
  dropConnection.close();
  const confirmed = await POST(request('RESET_HISTORY'));
  assert.equal(confirmed.status, 200);
  const receipt = await confirmed.json();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.startedOn, todayKL());
  const after = await snapshot();
  for (const name of ['budgets', 'transactions', 'people', 'paybacks']) assert.equal(after[name].length, 0, name);
  assert.deepEqual(after.accounts, before.accounts.map(account => ({ ...account, openingBalance: 0 })));
  assert.deepEqual(after.categories, before.categories);
  assert.deepEqual(after.settings, before.settings);
  await resetHistory(db);
  const fresh = await db.transaction.create({ data: { type: 'EXPENSE', amount: 1500, date: dbDate(todayKL()), accountId: bank.id, categoryId: category.id } });
  assert.equal(fresh.date.toISOString().slice(0, 10), todayKL());
  assert.equal(await db.transaction.count(), 1);
  await db.budget.create({ data: { categoryId: category.id, amount: 30000 } });
  const newPerson = await db.paybackPerson.create({ data: { name: 'New friend' } });
  await db.payback.create({ data: { transactionId: fresh.id, personId: newPerson.id, amount: 500, receivedAmount: 200, receivedAccountId: bank.id } });
  const beforeEmpty = await snapshot();
  const { POST: resetEmpty } = await loadTypeScript('../app/api/reset-empty/route.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/reset-history': { resetToEmpty },
  });
  assert.equal((await resetEmpty({ json: async () => { throw new Error('Malformed JSON'); } })).status, 400);
  for (const confirmation of [undefined, 'wrong', 'RESET_HISTORY']) {
    assert.equal((await resetEmpty(request(confirmation))).status, 400);
  }
  assert.deepEqual(await snapshot(), beforeEmpty, 'Empty reset requires its own confirmation');
  const failEmpty = new DatabaseSync(databasePath);
  failEmpty.exec("CREATE TRIGGER prevent_empty_reset BEFORE DELETE ON Category BEGIN SELECT RAISE(ABORT, 'simulated empty reset failure'); END");
  failEmpty.close();
  assert.equal((await resetEmpty(request('RESET_TO_EMPTY'))).status, 500);
  assert.deepEqual(await snapshot(), beforeEmpty, 'Empty reset must roll back accounts and all earlier deletions on failure');
  const allowEmpty = new DatabaseSync(databasePath);
  allowEmpty.exec('DROP TRIGGER prevent_empty_reset');
  allowEmpty.close();
  const emptyResponse = await resetEmpty(request('RESET_TO_EMPTY'));
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), { ok: true, startedOn: todayKL() });
  const completelyEmpty = await snapshot();
  for (const name of ['budgets', 'transactions', 'people', 'paybacks', 'accounts', 'categories']) {
    assert.equal(completelyEmpty[name].length, 0, name + ' must be empty');
  }
  assert.deepEqual(completelyEmpty.settings, beforeEmpty.settings);
  assert.equal((await resetEmpty(request('RESET_TO_EMPTY'))).status, 200);
  const dataApi = await loadTypeScript('../app/api/data/route.ts', {
    '@/lib/prisma': { prisma: db }, '@/lib/finance': finance,
  });
  const emptyScreen = await (await dataApi.GET()).json();
  for (const name of ['budgets', 'transactions', 'people', 'accounts', 'categories']) assert.equal(emptyScreen[name].length, 0, 'Loading must not restore demo data');
  const save = async body => {
    const response = await dataApi.POST({ json: async () => body });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  };
  const newAccount = await save({ action: 'account.save', name: 'My wallet', type: 'Cash', openingBalance: '100' });
  const newCategory = await save({ action: 'category.save', name: 'Lunch', kind: 'EXPENSE' });
  const firstRecord = await save({ action: 'transaction.save', type: 'EXPENSE', amount: '10', accountId: newAccount.id, categoryId: newCategory.id });
  assert.equal(firstRecord.date.slice(0, 10), todayKL());
  assert.equal(await db.transaction.count(), 1);
  console.log('Both resets passed: explicit confirmations, complete deletion, failure rollback, repeat resets, no demo records on reload, and new setup with transactions defaulting to today.');
} finally {
  await db.$disconnect();
  for (const name of await readdir(directory)) await unlink(join(directory, name));
  await rmdir(directory);
}
