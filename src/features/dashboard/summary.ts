import type { Transaction } from '../../types';

export interface CategoryTotal {
  slug: string;
  total: number;
}

export interface Summary {
  income: number;
  expense: number;
  net: number;
  byCategory: CategoryTotal[];
}

/**
 * Pure aggregator over a list of transactions.
 * - Only `status === 'confirmed'` rows are counted (Phase-1 never writes 'pending',
 *   but SMS Phase-2 will, so we filter defensively here).
 * - `income` / `expense` are summed by `type`.
 * - `net = income - expense`.
 * - `byCategory` totals every confirmed row by `category_slug`, sorted descending
 *   by total. Income and expense categories never share a slug (see category map),
 *   so combining them in one breakdown is unambiguous.
 */
export function summarize(txns: Transaction[]): Summary {
  let income = 0;
  let expense = 0;
  const totals = new Map<string, number>();

  for (const tx of txns) {
    if (tx.status !== 'confirmed') continue;
    if (tx.type === 'income') {
      income += tx.amount;
    } else {
      expense += tx.amount;
    }
    totals.set(tx.category_slug, (totals.get(tx.category_slug) ?? 0) + tx.amount);
  }

  const byCategory: CategoryTotal[] = Array.from(totals, ([slug, total]) => ({ slug, total }))
    .sort((a, b) => b.total - a.total);

  return { income, expense, net: income - expense, byCategory };
}
