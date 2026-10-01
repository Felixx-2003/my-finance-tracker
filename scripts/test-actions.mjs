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
const { applyMutation } = await loadTypeScript('../lib/client-data.ts');
const directory = await mkdtemp(join(tmpdir(), 'myfinance-save-test-'));
const databasePath = join(directory, 'save.db');
const db = new PrismaClient({ datasourceUrl: 'file:' + databasePath.replaceAll('\\', '/'), log: [{ emit: 'event', level: 'query' }] });
let queryCount = 0;
db.$on('query', () => queryCount++);
try {
  const sqlite = new DatabaseSync(databasePath);
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => /^\d/.test(name)).sort()) sqlite.exec(await readFile(new URL(name + '/migration.sql', migrations), 'utf8'));
  sqlite.close();
  const api = await loadTypeScript('../app/api/data/route.ts', { '@/lib/prisma': { prisma: db }, '@/lib/finance': finance });
  const read = async () => (await api.GET()).json();
  let client = await read();
  let verified = 0;
  let lastMetrics;
  const save = async (action, body, expectedStatus = 200) => {
    const original = JSON.stringify(client);
    const beforeWrite = queryCount;
    const response = await api.POST({ json: async () => ({ action, ...body }) });
    const writeQueries = queryCount - beforeWrite;
    const json = await response.json();
    assert.equal(response.status, expectedStatus, action + ': ' + (json.error || ''));
    if (expectedStatus !== 200) {
      assert.deepEqual(await read(), client, 'A rejected save must leave database and screen unchanged');
      return null;
    }
    const updated = applyMutation(client, action, json.result);
    assert.ok(updated, action + ' must apply without a reload');
    assert.equal(JSON.stringify(client), original, 'Updating must not mutate the previous React state');
    client = updated;
    const beforeRead = queryCount;
    const authoritative = await read();
    const reloadQueries = queryCount - beforeRead;
    assert.deepEqual(client, authoritative, action + ' must match a full database reload');
    verified++;
    lastMetrics = { action, writeQueries, avoidedReloadQueries: reloadQueries, responseBytes: Buffer.byteLength(JSON.stringify(json)), avoidedReloadBytes: Buffer.byteLength(JSON.stringify(authoritative)) };
    return json.result;
  };
  const bank = await save('account.save', { name: 'Bank', type: 'Bank', openingBalance: '500' });
  const wallet = await save('account.save', { name: 'Wallet', type: 'Cash', openingBalance: '100' });
  const food = await save('category.save', { name: 'Food', kind: 'EXPENSE', favorite: true });
  const salary = await save('category.save', { name: 'Salary', kind: 'INCOME' });
  const other = await save('category.save', { name: 'Other', kind: 'EXPENSE' });
  let budget = await save('budget.save', { categoryId: food.id, amount: '200' });
  budget = await save('budget.save', { categoryId: food.id, amount: '250' });
  const expense = await save('transaction.save', { type: 'EXPENSE', amount: '100', accountId: bank.id, categoryId: food.id, merchant: 'Dinner', date: '2026-09-25' });
  const income = await save('transaction.save', { type: 'INCOME', amount: '1000', accountId: bank.id, categoryId: salary.id });
  const transfer = await save('transaction.save', { type: 'TRANSFER', amount: '50', fromAccountId: bank.id, toAccountId: wallet.id });
  const share = await save('payback.save', { transactionId: expense.id, person: 'Alice', amount: '30' });
  await save('payback.receive', { id: share.id, amount: '10', accountId: wallet.id });
  await save('payback.save', { id: share.id, transactionId: expense.id, person: 'Bob', amount: '35' });
  await save('transaction.save', { id: expense.id, type: 'EXPENSE', amount: '120', accountId: wallet.id, categoryId: food.id, merchant: 'Dinner edited' });
  await save('transaction.save', { id: expense.id, type: 'EXPENSE', amount: '20', accountId: bank.id, categoryId: food.id }, 400);
  await save('account.delete', { id: wallet.id }, 400);
  await save('category.save', { id: food.id, name: 'Meals', kind: 'EXPENSE', favorite: true, color: '#12abcd' });
  await save('account.save', { id: wallet.id, name: 'Daily cash', type: 'Cash', openingBalance: '200' });
  await save('settings.save', { cycleStartDay: 15, theme: 'dark', onboarded: true });
  await save('payback.delete', { id: share.id });
  const secondShare = await save('payback.save', { transactionId: expense.id, person: 'Bob', amount: '20' });
  await save('transaction.save', { id: expense.id, type: 'INCOME', amount: '120', accountId: bank.id, categoryId: salary.id });
  assert.equal(client.transactions.find(transaction => transaction.id === expense.id).paybacks.length, 0);
  await save('transaction.delete', { id: income.id });
  await save('transaction.delete', { id: transfer.id });
  await save('account.delete', { id: wallet.id });
  await save('budget.save', { categoryId: other.id, amount: '50' });
  await save('category.delete', { id: other.id });
  await save('budget.delete', { categoryId: food.id });
  assert.equal(applyMutation(client, 'data.import', { imported: 1, skipped: 0 }), null);
  await db.transaction.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ type: 'EXPENSE', amount: 1000, date: finance.dbDate(finance.todayKL()), categoryId: food.id, accountId: bank.id, merchant: 'History ' + index })) });
  client = await read();
  await save('transaction.save', { type: 'EXPENSE', amount: '10', accountId: bank.id, categoryId: food.id });
  console.log('Expense save with 500 historical records:', lastMetrics);
  await save('budget.save', { categoryId: food.id, amount: '300' });
  console.log('Budget save with 500 historical records:', lastMetrics);
  console.log('Passed ' + verified + ' confirmed mutations: expense, income, transfer, budget, account, category, payback, settings, deletions, validation failures, and full reload parity.');
} finally {
  await db.$disconnect();
  for (const name of await readdir(directory)) await unlink(join(directory, name));
  await rmdir(directory);
}
