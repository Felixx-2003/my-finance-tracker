export type TransactionLike = { type: string; amount: number; date: string | Date; categoryId?: number | null; merchant?: string; paybacks?: { amount: number; receivedAmount: number }[] };

export function todayKL() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function dateOnly(value: string | Date) { return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10); }
export function dbDate(value: string) { return new Date(`${value}T12:00:00.000Z`); }
export function money(cents: number) { return `RM${(cents / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
export function parseMoney(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100 && Math.abs(Math.round(n * 100) - n * 100) > 1e-7) throw new Error('Enter an amount greater than RM0 with at most two decimal places.');
  return Math.round(n * 100);
}
export function cycleFor(date: string, startDay: number, offset = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const monthStart = (year:number,monthIndex:number) => {
    const lastDay=new Date(Date.UTC(year,monthIndex+1,0)).getUTCDate();
    return new Date(Date.UTC(year,monthIndex,Math.min(startDay,lastDay)));
  };
  const thisMonth=monthStart(y,m-1);
  const monthIndex=m-1+(new Date(`${date}T12:00:00Z`)<thisMonth?-1:0)+offset;
  const start=monthStart(y,monthIndex);
  const end=monthStart(y,monthIndex+1);
  end.setUTCDate(end.getUTCDate()-1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
export function personalExpense(t: TransactionLike) { return t.type === 'EXPENSE' ? Math.max(0, t.amount - (t.paybacks || []).reduce((s, p) => s + p.amount, 0)) : 0; }
export function totals(transactions: TransactionLike[]) {
  const income = transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const cashOutflow = transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.reduce((s, t) => s + personalExpense(t), 0);
  const pending = transactions.flatMap(t => t.paybacks || []).reduce((s, p) => s + p.amount - p.receivedAmount, 0);
  return { income, cashOutflow, expense, pending, savings: income - expense, savingsRate: income ? ((income - expense) / income) * 100 : 0 };
}
