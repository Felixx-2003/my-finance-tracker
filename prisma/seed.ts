import { PrismaClient } from '@prisma/client';
import { cycleFor, todayKL } from '../lib/finance.ts';

export async function seed(db: PrismaClient) {
  await db.payback.deleteMany();
  await db.transaction.deleteMany();
  await db.budget.deleteMany();
  await db.paybackPerson.deleteMany();
  await db.category.deleteMany();
  await db.account.deleteMany();
  await db.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const cats = [
    ['Food','UtensilsCrossed','#e88757',true,'EXPENSE'], ['Transport','Car','#659bd1',true,'EXPENSE'],
    ['Shopping','ShoppingBag','#b69acf',false,'EXPENSE'], ['Bills','Receipt','#a2a5d4',false,'EXPENSE'],
    ['Entertainment','Gamepad2','#db9ab0',false,'EXPENSE'], ['Health','HeartPulse','#70b9a3',false,'EXPENSE'],
    ['Education','BookOpen','#d7ae70',false,'EXPENSE'], ['Other','Shapes','#9fa9ad',false,'EXPENSE'],
    ['Salary','BriefcaseBusiness','#73aa8a',true,'INCOME'], ['Other Income','CirclePlus','#7ebbad',false,'INCOME']
  ] as const;
  const categories: Record<string,number> = {};
  for (const [name,icon,color,favorite,kind] of cats) categories[name] = (await db.category.create({ data: {name,icon,color,favorite,kind} })).id;
  const accounts: Record<string,number> = {};
  for (const [name,type,balance,provider] of [['Cash','Cash',18000,null],['Bank','Bank',245000,null],['E-Wallet','E-Wallet',9000,null],['Debit Card','Debit Card',0,null],['Credit Card','Credit Card',0,null]] as const) accounts[name] = (await db.account.create({data:{name,type,openingBalance:balance,provider}})).id;
  for (const [name,amount] of [['Food',60000],['Transport',30000],['Shopping',25000],['Bills',45000],['Entertainment',20000],['Health',15000]] as const) await db.budget.create({data:{categoryId:categories[name],amount}});
  const {start} = cycleFor(todayKL(),25);
  const day = (offset:number) => { const d = new Date(`${start}T12:00:00.000Z`); d.setUTCDate(d.getUTCDate()+offset); return d; };
  const rows = [
    {type:'INCOME',amount:350000,date:day(0),merchant:'Salary',categoryId:categories.Salary,accountId:accounts.Bank},
    {type:'EXPENSE',amount:4250,date:day(1),merchant:'KFC',categoryId:categories.Food,accountId:accounts['E-Wallet']},
    {type:'EXPENSE',amount:7000,date:day(2),merchant:'Petrol',categoryId:categories.Transport,accountId:accounts.Bank},
    {type:'EXPENSE',amount:750,date:day(3),merchant:'Mixue',categoryId:categories.Food,accountId:accounts['E-Wallet']},
    {type:'EXPENSE',amount:5500,date:day(4),merchant:'Netflix',categoryId:categories.Entertainment,accountId:accounts['Credit Card']},
    {type:'EXPENSE',amount:1890,date:day(5),merchant:'Lunch',categoryId:categories.Food,accountId:accounts['E-Wallet']},
    {type:'EXPENSE',amount:8000,date:day(5),merchant:'Dinner with friends',categoryId:categories.Food,accountId:accounts.Bank},
    {type:'TRANSFER',amount:10000,date:day(2),merchant:'E-Wallet top up',fromAccountId:accounts.Bank,toAccountId:accounts['E-Wallet']}
  ];
  const created = [];
  for (const row of rows) created.push(await db.transaction.create({data:row}));
  const joshua = await db.paybackPerson.create({data:{name:'Joshua'}});
  const dixon = await db.paybackPerson.create({data:{name:'Dixon'}});
  await db.payback.create({data:{transactionId:created[1].id,personId:joshua.id,amount:1500}});
  await db.payback.create({data:{transactionId:created[6].id,personId:joshua.id,amount:2000}});
  await db.payback.create({data:{transactionId:created[6].id,personId:dixon.id,amount:2000,receivedAmount:500,receivedAccountId:accounts.Bank}});
}
if (process.argv[1]?.replaceAll('\\','/').endsWith('/prisma/seed.ts')) {
  const db = new PrismaClient();
  seed(db).finally(() => db.$disconnect());
}
