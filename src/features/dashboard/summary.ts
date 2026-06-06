import type { Transaction } from '../../types';

export interface CategoryTotal {
  slug: string;
  total: number;
}

export interface Summary {
  income: number;
  expense: number;
  net: number;
  /** Expense rows grouped by category, sorted descending by total. */
  expenseByCategory: CategoryTotal[];
  /** Income rows grouped by category, sorted descending by total. */
  incomeByCategory: CategoryTotal[];
}

/**
 * Pure aggregator over a list of transactions.
 * - Only `status === 'confirmed'` rows are counted (Phase-1 never writes 'pending',
 *   but SMS Phase-2 will, so we filter defensively here).
 * - `income` / `expense` are summed by `type`.
 * - `net = income - expense`.
 * - The breakdown is split by `type` (`expenseByCategory` / `incomeByCategory`)
 *   so the dashboard can show one or the other — never a mix — and each ring's
 *   slices sum to its own total. Both are sorted descending by total.
 */
export function summarize(txns: Transaction[]): Summary {
  let income = 0;
  let expense = 0;
  const expenseTotals = new Map<string, number>();
  const incomeTotals = new Map<string, number>();

  for (const tx of txns) {
    if (tx.status !== 'confirmed') continue;
    if (tx.type === 'income') {
      income += tx.amount;
      incomeTotals.set(tx.category_slug, (incomeTotals.get(tx.category_slug) ?? 0) + tx.amount);
    } else {
      expense += tx.amount;
      expenseTotals.set(tx.category_slug, (expenseTotals.get(tx.category_slug) ?? 0) + tx.amount);
    }
  }

  const toSorted = (m: Map<string, number>): CategoryTotal[] =>
    Array.from(m, ([slug, total]) => ({ slug, total })).sort((a, b) => b.total - a.total);

  return {
    income,
    expense,
    net: income - expense,
    expenseByCategory: toSorted(expenseTotals),
    incomeByCategory: toSorted(incomeTotals),
  };
}
