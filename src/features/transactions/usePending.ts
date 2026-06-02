import { useCallback, useEffect, useState } from 'react';
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
  }, [refresh]);

  return { data, count: data.length, loading, error, refresh };
}
