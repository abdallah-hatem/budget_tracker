import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { listTransactions } from './api';
import type { Transaction } from '../../types';

export interface UsePendingResult {
  data: Transaction[];
  count: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Loads all transactions with status='pending', ordered newest first (the
 * default ordering of listTransactions). Fetches on mount and whenever
 * refresh() is called.
 */
export function usePending(): UsePendingResult {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTransactions({ status: 'pending' });
      setData(rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Re-fetch when the app returns to the foreground, so the pending count (and
    // the app-icon badge driven by it) updates after an SMS-captured item arrives
    // while the app was backgrounded — without needing to open the Pending tab.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { data, count: data.length, loading, error, refresh };
}
