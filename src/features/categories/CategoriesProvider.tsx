import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Category } from '../../types';
import { setCustomCategories, clearCustomCategories } from '../../lib/categories';
import { useSession } from '../auth/SessionProvider';
import { listCustomCategories } from './api';

interface CategoriesContextValue {
  /** The signed-in user's custom categories (for the manage UI). */
  custom: Category[];
  loading: boolean;
  /** Re-fetch from the DB and re-register in the runtime registry. */
  refresh: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue>({
  custom: [],
  loading: false,
  refresh: async () => {},
});

/**
 * Loads the user's custom categories on sign-in and pushes them into the
 * runtime registry (src/lib/categories) so every slug-based lookup resolves
 * them. Built-ins keep working when the user has none / on load failure.
 */
export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const [custom, setCustom] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await listCustomCategories();
      setCustom(list);
      setCustomCategories(list);
    } catch {
      // Keep last-known; built-ins still resolve regardless.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCustom([]);
      clearCustomCategories();
      return;
    }
    void refresh();
  }, [userId, refresh]);

  return (
    <CategoriesContext.Provider value={{ custom, loading, refresh }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCustomCategories(): CategoriesContextValue {
  return useContext(CategoriesContext);
}
