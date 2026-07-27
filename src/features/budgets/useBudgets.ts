import { useCallback, useEffect, useMemo, useState } from 'react';
import { listBudgets } from './api';
import { computeProgress } from './progress';
import type { Budget, BudgetProgress } from './types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { useMonthStart } from '@/src/features/dashboard/MonthStartProvider';

/** Start of the current monthly cycle, honoring the custom month-start day. */
export function monthlyCycleStart(now: Date, startDay: number): Date {
  const day = Math.min(28, Math.max(1, startDay || 1));
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  if (now.getDate() < day) d.setMonth(d.getMonth() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start of the current week (Saturday). */
export function weeklyCycleStart(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Loads budgets and pairs each with its cycle-to-date spend. Spend counts only
 * CONFIRMED expenses, matching summarize() and the Statistics screen.
 */
export function useBudgets(): {
  progress: BudgetProgress[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { startDay } = useMonthStart();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const from = useMemo(() => {
    // Fetch from the earlier of the two cycle starts so both are covered.
    const m = monthlyCycleStart(now, startDay);
    const w = weeklyCycleStart(now);
    return (m < w ? m : w).toISOString();
  }, [now, startDay]);

  const filter = useMemo(
    () => ({ from, to: now.toISOString(), status: 'confirmed' as const }),
    [from, now],
  );
  const { data: txns } = useTransactions(filter);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBudgets(await listBudgets());
    } catch {
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const progress = useMemo(() => {
    const monthStart = monthlyCycleStart(now, startDay);
    const weekStart = weeklyCycleStart(now);
    return budgets.map((b) => {
      const since = b.period === 'weekly' ? weekStart : monthStart;
      let spent = 0;
      for (const t of txns ?? []) {
        if (t.type !== 'expense' || t.status !== 'confirmed') continue;
        if (new Date(t.occurred_at) < since) continue;
        if (b.scope === 'category' && t.category_slug !== b.category_slug) continue;
        spent += t.amount;
      }
      return computeProgress(b, spent);
    });
  }, [budgets, txns, now, startDay]);

  return { progress, loading, refresh };
}
