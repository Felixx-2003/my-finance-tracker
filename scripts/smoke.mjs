import assert from 'node:assert/strict';

const base='http://127.0.0.1:3000';
async function state(){const r=await fetch(`${base}/api/data`);assert.equal(r.status,200);return r.json();}
async function action(name,body,status=200){const r=await fetch(`${base}/api/data`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,...body})});const data=await r.json();assert.equal(r.status,status,`${name}: ${data.error||''}`);return data;}
try {
  let d=await state();
  assert.equal(d.transactions.length,8);
  const food=d.categories.find(x=>x.name==='Food');
  const maybank=d.accounts.find(x=>x.name==='Maybank');
  const tng=d.accounts.find(x=>x.name==='Touch n Go');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const expense=(await action('transaction.save',{type:'EXPENSE',amount:100,date,merchant:'Smoke dinner',categoryId:food.id,accountId:maybank.id})).result;
  const payback=(await action('payback.save',{transactionId:expense.id,person:'Smoke friend',amount:40})).result;
  d=await state();
  let tx=d.transactions.find(x=>x.id===expense.id);
  assert.equal(tx.amount-tx.paybacks.reduce((s,p)=>s+p.amount,0),6000);
  assert.equal(tx.paybacks[0].receivedAmount,0);
  await action('payback.receive',{id:payback.id,amount:15,accountId:maybank.id});
  d=await state(); tx=d.transactions.find(x=>x.id===expense.id);
  assert.equal(tx.paybacks[0].receivedAmount,1500);
  assert.equal(tx.paybacks[0].amount-tx.paybacks[0].receivedAmount,2500);
  await action('payback.save',{transactionId:expense.id,person:'Too much',amount:61},400);
  await action('transaction.save',{id:expense.id,type:'EXPENSE',amount:39,date,merchant:'Smoke dinner',categoryId:food.id,accountId:maybank.id},400);
  d=await state();
  assert.equal(d.transactions.find(x=>x.id===expense.id).amount,10000);
  const transfer=(await action('transaction.save',{type:'TRANSFER',amount:100,date,fromAccountId:maybank.id,toAccountId:tng.id})).result;
  await action('transaction.save',{type:'TRANSFER',amount:100,date,fromAccountId:maybank.id,toAccountId:maybank.id},400);
  d=await state();
  assert.equal(d.transactions.find(x=>x.id===transfer.id).type,'TRANSFER');
  assert.equal(d.transactions.find(x=>x.id===expense.id).paybacks.length,1);
  const imported=await action('data.import',{rows:[{Date:date,Type:'EXPENSE',Amount:'20.00',Category:'Food',Account:'Maybank',Merchant:'CSV lunch',Note:'',Payback:'CSV friend:5.00'}, {Date:date,Type:'TRANSFER',Amount:'30.00',Category:'',Account:'Maybank → Touch n Go',Merchant:'CSV transfer',Note:'',Payback:''}]});
  assert.equal(imported.result.imported,2);
  d=await state();
  assert.equal(d.transactions.find(x=>x.merchant==='CSV lunch').paybacks[0].amount,500);
  assert.equal(d.transactions.find(x=>x.merchant==='CSV transfer').type,'TRANSFER');
  console.log('Smoke flows passed: expense, personal cost, partial payback, transfer, CSV import, validations.');
} finally {
  const r=await fetch(`${base}/api/reset`,{method:'POST'});
  const j=await r.json();
  assert.equal(r.status,200,`Reset failed: ${j.error||''}`);
  console.log('Demo data restored.');
}
