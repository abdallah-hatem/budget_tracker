import type { Transaction, TxnType } from '../../types';
import { currentMonthKey } from '../dashboard/monthRange';

/** A category and its summed total. */
export interface CategoryTotal {
  slug: string;
  total: number;
}

export interface Biggest {
  amount: number;
  slug: string;
  occurred_at: string;
}

export interface StatHighlights {
  total: number;
  count: number;
  /** total / count (0 when there are no transactions). */
  avgPerTxn: number;
  biggest: Biggest | null;
  /** Distinct financial months with activity (at least 1). */
  months: number;
  /** total / months. */
  avgPerMonth: number;
  /** Top category by total — null when a single category is being focused. */
  highest: CategoryTotal | null;
  /** Smallest category by total — null when focusing or only one category. */
  lowest: CategoryTotal | null;
  /** Number of distinct categories with spend (for the current type). */
  categoryCount: number;
}

/**
 * Compute the "useful stats" for the Statistics screen over CONFIRMED
 * transactions of `type`, optionally scoped to one `categorySlug`. Pure — feed
 * it the already range-filtered list.
 */
export function computeStats(
  txns: Transaction[],
  type: TxnType,
  startDay: number,
  categorySlug?: string,
): StatHighlights {
  const rows = txns.filter(
    (t) =>
      t.status === 'confirmed' &&
      !t.is_internal_transfer &&
      t.type === type &&
      (!categorySlug || t.category_slug === categorySlug),
  );

  let total = 0;
  let biggest: Biggest | null = null;
  const monthSet = new Set<string>();
  const byCat = new Map<string, number>();

  for (const t of rows) {
    total += t.amount;
    if (!biggest || t.amount > biggest.amount) {
      biggest = { amount: t.amount, slug: t.category_slug, occurred_at: t.occurred_at };
    }
    const k = currentMonthKey(new Date(t.occurred_at), startDay);
    monthSet.add(`${k.year}-${k.month}`);
    byCat.set(t.category_slug, (byCat.get(t.category_slug) ?? 0) + t.amount);
  }

  const count = rows.length;
  const months = Math.max(1, monthSet.size);

  const sortedCats = Array.from(byCat, ([slug, tot]) => ({ slug, total: tot })).sort(
    (a, b) => b.total - a.total,
  );

  const highest = !categorySlug && sortedCats.length > 0 ? sortedCats[0] : null;
  const lowest =
    !categorySlug && sortedCats.length > 1 ? sortedCats[sortedCats.length - 1] : null;

  return {
    total,
    count,
    avgPerTxn: count > 0 ? total / count : 0,
    biggest,
    months,
    avgPerMonth: total / months,
    highest,
    lowest,
    categoryCount: sortedCats.length,
  };
}
