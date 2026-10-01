export type Category = {id:number;name:string;icon:string;color:string;kind:string;favorite:boolean};
export type Account = {id:number;name:string;type:string;provider:string|null;openingBalance:number};
export type Payback = {id:number;amount:number;receivedAmount:number;personId:number;person:{id:number;name:string};receivedAccountId:number|null;receivedAccount?:Account|null};
export type Tx = {id:number;type:string;amount:number;date:string;merchant:string;note:string;categoryId:number|null;category:Category|null;accountId:number|null;account:Account|null;fromAccountId:number|null;fromAccount:Account|null;toAccountId:number|null;toAccount:Account|null;paybacks:Payback[]};
export type Budget = {id:number;categoryId:number;amount:number;category:Category};
export type Data = {settings:{cycleStartDay:number;theme:string;onboarded:boolean};categories:Category[];accounts:Account[];budgets:Budget[];people:{id:number;name:string}[];transactions:Tx[]};

type TransactionRecord = Omit<Tx, 'category' | 'account' | 'fromAccount' | 'toAccount' | 'paybacks'>;
type PaybackRecord = Omit<Payback, 'person'> & { transactionId: number; person?: { id: number; name: string } };

function upsert<T extends { id: number }>(items: T[], item: T): T[] {
  return items.some(current => current.id === item.id)
    ? items.map(current => current.id === item.id ? item : current)
    : [...items, item];
}

/** Apply a confirmed save response without downloading the entire database again. */
export function applyMutation(current: Data, action: string, result: unknown): Data | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as { id: number };
  let next = { ...current };
  switch (action) {
    case 'transaction.save': {
      const saved = result as TransactionRecord;
      const previous = current.transactions.find(transaction => transaction.id === saved.id);
      next.transactions = upsert(current.transactions, {
        ...saved, category: null, account: null, fromAccount: null, toAccount: null,
        paybacks: saved.type === 'EXPENSE' ? previous?.paybacks || [] : [],
      });
      break;
    }
    case 'transaction.delete':
      next.transactions = current.transactions.filter(transaction => transaction.id !== row.id);
      break;
    case 'budget.save': {
      const saved = result as Omit<Budget, 'category'>;
      const category = current.categories.find(category => category.id === saved.categoryId);
      if (!category) return null;
      next.budgets = upsert(current.budgets, { ...saved, category });
      break;
    }
    case 'budget.delete':
      next.budgets = current.budgets.filter(budget => budget.id !== row.id);
      break;
    case 'account.save':
      next.accounts = upsert(current.accounts, result as Account);
      break;
    case 'account.delete':
      next.accounts = current.accounts.filter(account => account.id !== row.id);
      break;
    case 'category.save':
      next.categories = upsert(current.categories, result as Category);
      break;
    case 'category.delete':
      next.categories = current.categories.filter(category => category.id !== row.id);
      next.budgets = current.budgets.filter(budget => budget.categoryId !== row.id);
      break;
    case 'settings.save':
      next.settings = result as Data['settings'];
      break;
    case 'payback.save':
    case 'payback.receive': {
      const saved = result as PaybackRecord;
      const person = saved.person || current.people.find(person => person.id === saved.personId);
      if (!person || !current.transactions.some(transaction => transaction.id === saved.transactionId)) return null;
      next.people = upsert(current.people, { id: person.id, name: person.name });
      next.transactions = current.transactions.map(transaction => transaction.id === saved.transactionId
        ? { ...transaction, paybacks: upsert(transaction.paybacks, { ...saved, person }) }
        : { ...transaction, paybacks: transaction.paybacks.filter(payback => payback.id !== saved.id) });
      break;
    }
    case 'payback.delete':
      next.transactions = current.transactions.map(transaction => ({ ...transaction, paybacks: transaction.paybacks.filter(payback => payback.id !== row.id) }));
      break;
    default:
      return null; // Bulk CSV imports still need a complete refresh.
  }
  const categories = new Map(next.categories.map(category => [category.id, category]));
  const accounts = new Map(next.accounts.map(account => [account.id, account]));
  const people = new Map(next.people.map(person => [person.id, person]));
  return {
    ...next,
    categories: [...next.categories].sort((a, b) => Number(/^Other(?: Income)?$/i.test(a.name)) - Number(/^Other(?: Income)?$/i.test(b.name)) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)),
    accounts: [...next.accounts].sort((a, b) => a.id - b.id),
    budgets: next.budgets.map(budget => ({ ...budget, category: categories.get(budget.categoryId)! })).sort((a, b) => a.id - b.id),
    people: [...next.people].sort((a, b) => a.name.localeCompare(b.name)),
    transactions: next.transactions.map(transaction => ({
      ...transaction,
      category: categories.get(transaction.categoryId ?? 0) || null,
      account: accounts.get(transaction.accountId ?? 0) || null,
      fromAccount: accounts.get(transaction.fromAccountId ?? 0) || null,
      toAccount: accounts.get(transaction.toAccountId ?? 0) || null,
      paybacks: transaction.paybacks.map(payback => ({ ...payback, person: people.get(payback.personId)!, receivedAccount: accounts.get(payback.receivedAccountId ?? 0) || null })),
    })).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
  };
}
