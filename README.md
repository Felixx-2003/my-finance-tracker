# MyFinance

A mobile-first personal finance tracker for daily expenses, income, transfers, budgets, accounts, paybacks, and reports. Values are stored in MYR cents in a local SQLite database. The default finance cycle runs from the 25th to the 24th, using the Asia/Kuala_Lumpur date.

## Run locally

Requires Node.js 24 or newer.

```bash
npm install --include=dev
npm run db:setup
npm run dev
```

Open <http://127.0.0.1:3000>. The setup command applies the checked-in SQL migrations, generates Prisma Client, and loads demo data. **On an existing installation, run only `npm run db:migrate` and `npm run db:generate` to preserve your records.** `npm run db:seed` replaces all finance data with the sample records. **Settings → Your data → Clear history & start fresh** permanently clears transactions, paybacks, saved people, and budgets and sets all account opening balances to zero after confirmation. Account names, categories, and preferences remain. New entries default to today in Asia/Kuala_Lumpur; set your current opening balances in Accounts before recording new spending. This clears the database used by the running app (Neon in the cloud or SQLite locally).

This Windows environment's Prisma schema engine could not run `prisma migrate dev` or `migrate deploy`, so `db:migrate` uses Node's SQLite API to apply the SQL migration under `prisma/migrations`. The schema and generated Prisma client remain the source of types and data access. Future migrations can be added as ordered folders with `migration.sql` files.

## Structure

- `app/page.tsx`: app screens, navigation, forms, charts, and client interactions
- `app/api/data/route.ts`: validated CRUD and import API
- `app/api/reset/route.ts`: demo reset API
- `lib/finance.ts`: cycle and money calculations
- `prisma/schema.prisma`: relational data model
- `prisma/migrations`: database migration SQL
- `prisma/seed.ts`: demo accounts, budgets, transactions, and paybacks
- `scripts`: setup and smoke test helpers

## Where data lives

Accounts, transactions, budgets, categories, and paybacks are stored by Prisma in `prisma/dev.db` on the computer running the app. Browser `localStorage` only remembers the last account and category chosen in the quick transaction form. The app currently has no sign-in and binds to `127.0.0.1`, so it is for local use on this computer. Back up `prisma/dev.db` to keep your records safe.

## Private cloud deployment

The cloud build uses Next.js on Vercel and a hosted Postgres database, such as Neon. The local build keeps SQLite. `vercel.json` selects the cloud build automatically on Vercel. The cloud API requires a single-user password and signed session cookie before any finance data is served.

1. Back up `prisma/dev.db`. Create a private Postgres database and copy its connection string.
2. In the Vercel project, set `DATABASE_URL` to Neon's **pooled** connection string and `DIRECT_URL` to its **direct** connection string. Set `APP_PASSWORD` to a strong unique password and `AUTH_SECRET` to a random secret of at least 32 characters. For the local setup commands below, set both `DATABASE_URL` and `DIRECT_URL` to the direct URL in the command environment; keep your normal `.env` set to SQLite for local use.
3. Apply the cloud schema with `npm run db:cloud:push`. Prisma uses `DIRECT_URL` for this command. It must connect to the new, empty Postgres database and does not use the local SQLite migrations.
4. Run `npm run build:cloud` locally to generate the Postgres Prisma Client, then `npm run db:cloud:import` to copy the existing local SQLite records to the empty cloud database. The import uses `DIRECT_URL`, preserves account and transaction IDs, and refuses to merge with existing cloud finance data. Run `npm run db:cloud:verify` to compare every imported table against SQLite.
5. Deploy the repository to Vercel. The sign-in page will protect the app and all data APIs. After cloud commands, run `npm run db:generate` before starting the local SQLite app again.

Cloud services have free tier limits and can change their terms. The app is not deployed until you create the hosting/database projects and set these private credentials. Never commit `.env`, database files, or passwords.

## Accounting rules

- Income includes only income transactions.
- Personal expense is the original expense less every friend’s assigned share, even while their payback is pending.
- Cash outflow is the original amount paid. A received payback changes an account balance, but never income.
- Transfers change two account balances and do not affect income, expenses, or savings.
- Savings are income less personal expenses.

CSV export includes the requested columns and encodes paybacks as `Name:Amount;Name:Amount` in the Payback column. Import recognizes exported transactions and paybacks; it skips rows whose account or category is missing. Imported paybacks start pending because the export format does not include receipt history.

For a live smoke check after starting the server, run `node scripts/smoke.mjs`. It restores the demo data when finished.

Run `npm run test:reset` to verify both reset confirmations, database rollback, empty reloads, and fresh entries using a disposable SQLite database. It leaves your actual finance records untouched.

**Settings → Your data → Reset to empty** is a separate reset that also deletes every account and category. It inserts no demo data. After confirmation, add an account with your current balance and create categories in Settings to start recording today. Appearance and cycle preferences remain.

Normal saves apply the confirmed API result directly to the screen instead of reloading all finance data. Bulk CSV imports and resets still reload the database. The cloud backend is configured for Vercel Singapore (`sin1`) alongside the current Neon Singapore database. Run `npm run test:actions` to compare screen updates against full database reloads using disposable test data.
