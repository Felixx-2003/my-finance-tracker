import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/prisma';
import { dbDate, parseMoney, todayKL, personalExpense } from '@/lib/finance';

export const dynamic = 'force-dynamic';
const includes = { category: true, account: true, fromAccount: true, toAccount: true, paybacks: { include: { person: true, receivedAccount: true } } } as const;
const id = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new Error('Choose a valid item.'); return n; };
const optionalId = (v: unknown) => v === null || v === undefined || v === '' ? null : id(v);
const clean = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);
const date = (v: unknown) => { const s = String(v || todayKL()); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(dbDate(s).getTime()) || dbDate(s).toISOString().slice(0,10) !== s) throw new Error('Choose a valid date.'); return dbDate(s); };

export async function GET() {
  const [settings, categories, accounts, budgets, people, transactions] = await Promise.all([
    db.settings.upsert({where:{id:1},create:{id:1},update:{}}),
    db.category.findMany({orderBy:[{favorite:'desc'},{name:'asc'}]}),
    db.account.findMany({orderBy:{id:'asc'}}),
    db.budget.findMany({include:{category:true},orderBy:{id:'asc'}}),
    db.paybackPerson.findMany({orderBy:{name:'asc'}}),
    db.transaction.findMany({include:includes,orderBy:[{date:'desc'},{id:'desc'}]})
  ]);
  categories.sort((a,b) => Number(/^Other(?: Income)?$/i.test(a.name)) - Number(/^Other(?: Income)?$/i.test(b.name)));
  return NextResponse.json({settings,categories,accounts,budgets,people,transactions});
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = clean(body.action, 40);
    let result: unknown = null;
    if (action === 'transaction.save') {
      const type = clean(body.type);
      if (!['EXPENSE','INCOME','TRANSFER'].includes(type)) throw new Error('Choose a transaction type.');
      const amount = parseMoney(body.amount);
      const data = {
        type, amount, date: date(body.date), merchant: clean(body.merchant), note: clean(body.note, 500),
        categoryId: type === 'TRANSFER' ? null : optionalId(body.categoryId),
        accountId: type === 'TRANSFER' ? null : optionalId(body.accountId),
        fromAccountId: type === 'TRANSFER' ? id(body.fromAccountId) : null,
        toAccountId: type === 'TRANSFER' ? id(body.toAccountId) : null
      };
      if (type === 'TRANSFER' && data.fromAccountId === data.toAccountId) throw new Error('Choose two different accounts.');
      if (type !== 'TRANSFER' && (!data.categoryId || !data.accountId)) throw new Error('Choose a category and account.');
      if (body.id && type === 'EXPENSE') {
        const sum = await db.payback.aggregate({where:{transactionId:id(body.id)},_sum:{amount:true}});
        if ((sum._sum.amount || 0) > amount) throw new Error('Paybacks cannot exceed the expense.');
      }
      result = body.id ? await db.transaction.update({where:{id:id(body.id)},data}) : await db.transaction.create({data});
      if (body.id && type !== 'EXPENSE') await db.payback.deleteMany({where:{transactionId:id(body.id)}});
    } else if (action === 'transaction.delete') {
      result = await db.transaction.delete({where:{id:id(body.id)}});
    } else if (action === 'payback.save') {
      const transactionId = id(body.transactionId);
      const transaction = await db.transaction.findUnique({where:{id:transactionId},include:{paybacks:true}});
      if (!transaction || transaction.type !== 'EXPENSE') throw new Error('Choose an expense.');
      const amount = parseMoney(body.amount);
      const existingId = optionalId(body.id);
      const other = transaction.paybacks.filter(p => p.id !== existingId).reduce((s,p) => s + p.amount,0);
      if (other + amount > transaction.amount) throw new Error('Paybacks cannot exceed the expense.');
      const existing = transaction.paybacks.find(p => p.id === existingId);
      if (existing && existing.receivedAmount > amount) throw new Error('Payback cannot be less than the amount already received.');
      const name = clean(body.person,80);
      if (!name) throw new Error('Enter a person’s name.');
      const person = await db.paybackPerson.upsert({where:{name},create:{name},update:{}});
      const receivedAmount = body.receivedAmount === undefined ? undefined : Math.round(Number(body.receivedAmount) * 100);
      if (receivedAmount !== undefined && (!Number.isInteger(receivedAmount) || receivedAmount < 0 || receivedAmount > amount)) throw new Error('Received amount must be between zero and the payback amount.');
      const data = {transactionId,personId:person.id,amount, ...(receivedAmount === undefined ? {} : {receivedAmount}),receivedAccountId:optionalId(body.receivedAccountId)};
      result = existingId ? await db.payback.update({where:{id:existingId},data}) : await db.payback.create({data});
    } else if (action === 'payback.receive') {
      const payback = await db.payback.findUnique({where:{id:id(body.id)},include:{transaction:true}});
      if (!payback) throw new Error('Payback not found.');
      const received = parseMoney(body.amount);
      if (received + payback.receivedAmount > payback.amount) throw new Error('Received amount exceeds what is owed.');
      const receivedAccountId=optionalId(body.accountId) || payback.receivedAccountId || payback.transaction.accountId;
      if (payback.receivedAmount && payback.receivedAccountId && receivedAccountId !== payback.receivedAccountId) throw new Error('Use the same account for partial receipts on this payback.');
      result = await db.payback.update({where:{id:payback.id},data:{receivedAmount:payback.receivedAmount+received,receivedAccountId}});
    } else if (action === 'payback.delete') {
      result = await db.payback.delete({where:{id:id(body.id)}});
    } else if (action === 'budget.save') {
      const categoryId = id(body.categoryId);
      const amount = parseMoney(body.amount);
      result = await db.budget.upsert({where:{categoryId},create:{categoryId,amount},update:{amount}});
    } else if (action === 'budget.delete') {
      result = await db.budget.delete({where:{categoryId:id(body.categoryId)}});
    } else if (action === 'account.save') {
      const name = clean(body.name,50);
      const type = clean(body.type,30);
      if (!name || !['Cash','Bank','E-Wallet','Debit Card','Credit Card','Other'].includes(type)) throw new Error('Enter an account name and type.');
      const provider = type === 'E-Wallet' ? clean(body.provider,50) || null : null;
      const openingBalance = Math.round(Number(body.openingBalance || 0)*100);
      if (!Number.isSafeInteger(openingBalance)) throw new Error('Enter a valid opening balance.');
      result = body.id ? await db.account.update({where:{id:id(body.id)},data:{name,type,provider,openingBalance}}) : await db.account.create({data:{name,type,provider,openingBalance}});
    } else if (action === 'account.delete') {
      const accountId = id(body.id);
      const used = await db.transaction.count({where:{OR:[{accountId},{fromAccountId:accountId},{toAccountId:accountId}]}});
      const received = await db.payback.count({where:{receivedAccountId:accountId}});
      if (used || received) throw new Error('This account has transactions or received paybacks. Move or delete them first.');
      result = await db.account.delete({where:{id:accountId}});
    } else if (action === 'category.save') {
      const name = clean(body.name,40);
      const kind = clean(body.kind);
      if (!name || !['EXPENSE','INCOME'].includes(kind)) throw new Error('Enter a category name and type.');
      const data = {name,kind,icon:clean(body.icon) || 'Shapes',color:clean(body.color) || '#9fa9ad',favorite:Boolean(body.favorite)};
      result = body.id ? await db.category.update({where:{id:id(body.id)},data}) : await db.category.create({data});
    } else if (action === 'category.delete') {
      const categoryId = id(body.id);
      const used = await db.transaction.count({where:{categoryId}});
      if (used) throw new Error('This category has transactions. Reassign them first.');
      result = await db.category.delete({where:{id:categoryId}});
    } else if (action === 'settings.save') {
      const cycleStartDay = Number(body.cycleStartDay);
      if (!Number.isInteger(cycleStartDay) || cycleStartDay < 1 || cycleStartDay > 31) throw new Error('Cycle start day must be between 1 and 31.');
      const theme = clean(body.theme);
      if (!['light','dark','system'].includes(theme)) throw new Error('Choose a theme.');
      result = await db.settings.upsert({where:{id:1},create:{id:1,cycleStartDay,theme,onboarded:Boolean(body.onboarded)},update:{cycleStartDay,theme,onboarded:Boolean(body.onboarded)}});
    } else if (action === 'demo.reset') {
      // Reset is handled by the seed script to preserve one source of demo data.
      throw new Error('Run npm run db:seed to reset demo data.');
    } else if (action === 'data.import') {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length > 5000) throw new Error('Choose a valid CSV file (up to 5,000 rows).');
      const accounts = await db.account.findMany();
      const categories = await db.category.findMany();
      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const type = clean(row.Type).toUpperCase();
        if (!['EXPENSE','INCOME','TRANSFER'].includes(type)) { skipped++; continue; }
        const accountName=clean(row.Account);
        const account = accounts.find(a => a.name === accountName);
        const category = categories.find(c => c.name === clean(row.Category));
        if (type === 'TRANSFER') {
          const [from,to]=accountName.split(' → ').map(s=>accounts.find(a=>a.name===s));
          if (!from || !to || from.id===to.id) { skipped++; continue; }
          await db.transaction.create({data:{type,amount:parseMoney(row.Amount),date:date(row.Date),fromAccountId:from.id,toAccountId:to.id,merchant:clean(row.Merchant),note:clean(row.Note,500)}});
          imported++;continue;
        }
        if (!account || !category) { skipped++; continue; }
        const paybackText=clean(row.Payback,1000);
        const paybacks=type==='EXPENSE'&&paybackText.includes(':')?paybackText.split(';').map(s=>{const [person,value]=s.split(':');return {person:clean(person,80),amount:parseMoney(value)};}):[];
        const amount=parseMoney(row.Amount);
        if(paybacks.reduce((s,p)=>s+p.amount,0)>amount) {skipped++;continue;}
        const created=await db.transaction.create({data:{type,amount,date:date(row.Date),accountId:account.id,categoryId:category.id,merchant:clean(row.Merchant),note:clean(row.Note,500)}});
        for(const p of paybacks){const person=await db.paybackPerson.upsert({where:{name:p.person},create:{name:p.person},update:{}});await db.payback.create({data:{transactionId:created.id,personId:person.id,amount:p.amount}});}
        imported++;
      }
      result = {imported,skipped};
    } else throw new Error('Unknown action.');
    return NextResponse.json({ok:true,result});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return NextResponse.json({ok:false,error:message.includes('Unique constraint')?'That name is already in use.':message}, {status:400});
  }
}
