import { useCallback, useMemo, useState } from 'react';
import { useTransactions } from '../transactions/useTransactions';
import { summarize, type Summary } from './summary';
import { monthRange, addMonth, currentMonthKey, type MonthKey } from './monthRange';
import type { Transaction } from '../../types';

export interface UseMonthSummaryResult {
  monthKey: MonthKey;
  summary: Summary;
  transactions: Transaction[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  prevMonth: () => void;
  nextMonth: () => void;
  /** Jump straight to a specific month. */
  goToMonth: (m: MonthKey) => void;
}

/**
 * Loads the given month's confirmed transactions and folds them through
 * summarize(). `initialMonth` defaults to the current calendar month.
 */
export function useMonthSummary(initialMonth?: MonthKey): UseMonthSummaryResult {
  const [monthKey, setMonthKey] = useState<MonthKey>(
    () => initialMonth ?? currentMonthKey()
  );

  const filter = useMemo(() => {
    const { from, to } = monthRange(monthKey);
    return { from, to, status: 'confirmed' as const };
  }, [monthKey]);

  const { data, loading, error, refresh } = useTransactions(filter);

  const summary = useMemo(() => summarize(data), [data]);

  const prevMonth = useCallback(() => setMonthKey((k) => addMonth(k, -1)), []);
  const nextMonth = useCallback(() => setMonthKey((k) => addMonth(k, 1)), []);
  const goToMonth = useCallback((m: MonthKey) => setMonthKey(m), []);

  return {
    monthKey,
    summary,
    transactions: data,
    loading,
    error,
    refresh,
    prevMonth,
    nextMonth,
    goToMonth,
  };
}
