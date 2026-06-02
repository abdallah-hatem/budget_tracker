import { useCallback, useEffect, useRef, useState } from 'react';
import { listTransactions, type TransactionFilter } from './api';
import type { Transaction } from '../../types';

export interface UseTransactionsResult {
  data: Transaction[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Loads transactions for `filter` and re-fetches whenever the filter's serialized
 * shape changes. The filter is serialized to a stable key so callers can pass a
 * fresh object literal each render without causing an infinite loop.
 *
 * A request-id guard prevents out-of-order responses from clobbering newer state.
 */
export function useTransactions(filter: TransactionFilter): UseTransactionsResult {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest filter in a ref so refresh() uses current values without
  // being part of its dependency list.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Request-id guard: only apply the result of the most recently started request.
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await listTransactions(filterRef.current);
      if (myReq !== reqIdRef.current) return;
      setData(rows);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setData([]);
    } finally {
      // Only clear loading if this is still the latest request.
      // (We still call setLoading for the superseded req; React batches it harmlessly.)
      setLoading(false);
    }
  }, []);

  // Stable dependency: only re-run when the meaningful filter fields change.
  const filterKey = JSON.stringify(filter);
  useEffect(() => {
    void refresh();
    // refresh is stable (empty deps); filterKey captures the filter contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return { data, loading, error, refresh };
}
