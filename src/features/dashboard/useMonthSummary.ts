import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTransactions } from '../transactions/useTransactions';
import { summarize, type Summary } from './summary';
import { monthRange, addMonth, currentMonthKey, type MonthKey } from './monthRange';
import { useMonthStart } from './MonthStartProvider';
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
  const { startDay } = useMonthStart();
  const [monthKey, setMonthKey] = useState<MonthKey>(
    () => initialMonth ?? currentMonthKey(new Date(), startDay)
  );

  // When the start-of-month day changes (e.g. loaded from storage, or the user
  // edits it), snap to the current financial month — but only if the user hasn't
  // navigated to a specific month and no explicit initialMonth was given.
  const userNavigated = useRef(false);
  useEffect(() => {
    if (!initialMonth && !userNavigated.current) {
      setMonthKey(currentMonthKey(new Date(), startDay));
    }
  }, [startDay, initialMonth]);

  const filter = useMemo(() => {
    const { from, to } = monthRange(monthKey, startDay);
    return { from, to, status: 'confirmed' as const };
  }, [monthKey, startDay]);

  const { data, loading, error, refresh } = useTransactions(filter);

  const summary = useMemo(() => summarize(data), [data]);

  const prevMonth = useCallback(() => { userNavigated.current = true; setMonthKey((k) => addMonth(k, -1)); }, []);
  const nextMonth = useCallback(() => { userNavigated.current = true; setMonthKey((k) => addMonth(k, 1)); }, []);
  const goToMonth = useCallback((m: MonthKey) => { userNavigated.current = true; setMonthKey(m); }, []);

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
