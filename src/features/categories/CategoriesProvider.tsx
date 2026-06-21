import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Per-user disk cache of custom categories. Hydrated into the runtime registry
// at startup (before the slower network fetch) so a cold open resolves custom
// slugs immediately instead of falling back to the default icon/color until a
// manual refresh.
const cacheKey = (userId: string) => `custom_categories_v1_${userId}`;

async function readCache(userId: string): Promise<Category[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Category[]) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, list: Category[]): void {
  AsyncStorage.setItem(cacheKey(userId), JSON.stringify(list)).catch(() => {});
}

/**
 * Loads the user's custom categories on sign-in and pushes them into the
 * runtime registry (src/lib/categories) so every slug-based lookup resolves
 * them. Built-ins keep working when the user has none / on load failure.
 *
 * On sign-in we first hydrate from a per-user AsyncStorage cache (fast, local)
 * so the UI is correct on a cold open, then refresh from the DB and update both
 * the registry and the cache.
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
      writeCache(userId, list);
    } catch {
      // Keep last-known (cache/registry); built-ins still resolve regardless.
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
    let cancelled = false;
    // 1) Warm the registry from the local cache (fast) so the first paint after
    //    a cold open already resolves custom categories. 2) Then refresh from DB.
    void (async () => {
      const cached = await readCache(userId);
      if (!cancelled && cached && cached.length) {
        setCustom(cached);
        setCustomCategories(cached);
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
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
