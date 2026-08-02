import { useCallback, useEffect, useMemo, useState } from 'react';
import { listBudgets } from './api';
import { computeProgress } from './progress';
import { monthlyCycleStart, weeklyCycleStart } from './cycles';
import type { Budget, BudgetProgress } from './types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { useMonthStart } from '@/src/features/dashboard/MonthStartProvider';

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

  // State (not a one-shot memo) so refresh() can re-evaluate the cycle
  // windows instead of freezing them at first mount.
  const [now, setNow] = useState(() => new Date());
  const from = useMemo(() => {
    // Fetch from the earlier of the two cycle starts so both are covered.
    const m = monthlyCycleStart(now, startDay);
    const w = weeklyCycleStart(now);
    return (m < w ? m : w).toISOString();
  }, [now, startDay]);

  // No upper bound: the per-budget loop below already excludes transactions
  // before each budget's own cycle start, and a future-dated transaction
  // should still count toward the current cycle.
  const filter = useMemo(() => ({ from, status: 'confirmed' as const }), [from]);
  const { data: txns, refresh: refreshTxns } = useTransactions(filter);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNow(new Date());
    try {
      const [budgetRows] = await Promise.all([listBudgets(), refreshTxns()]);
      setBudgets(budgetRows);
    } catch {
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, [refreshTxns]);

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
        if (t.type !== 'expense' || t.status !== 'confirmed' || t.is_internal_transfer) continue;
        if (new Date(t.occurred_at) < since) continue;
        if (b.scope === 'category' && t.category_slug !== b.category_slug) continue;
        spent += t.amount;
      }
      return computeProgress(b, spent);
    });
  }, [budgets, txns, now, startDay]);

  return { progress, loading, refresh };
}
