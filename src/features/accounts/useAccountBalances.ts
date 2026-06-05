import { useCallback, useEffect, useRef, useState } from 'react';
import { listAccountBalances } from './api';
import { totalBalance } from './balances';
import type { AccountBalance } from '../../types';

export interface UseAccountBalancesResult {
  accounts: AccountBalance[];
  total: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/** Loads the user's accounts + balances; exposes the in-app total. */
export function useAccountBalances(): UseAccountBalancesResult {
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await listAccountBalances();
      if (myReq !== reqIdRef.current) return;
      setAccounts(rows);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { accounts, total: totalBalance(accounts), loading, error, refresh };
}
