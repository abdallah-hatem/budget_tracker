import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Category slugs the user has hidden from the HOME dashboard (hero total + donut +
// breakdown). Device-level, stored in AsyncStorage — no server migration, ships via
// OTA. Built-in and custom slugs alike. The full Transactions tab is unaffected.
const KEY = 'hidden_home_categories';

interface HiddenCategoriesCtx {
  hidden: Set<string>;
  isHidden: (slug: string) => boolean;
  toggle: (slug: string) => void;
  ready: boolean;
}

const Ctx = createContext<HiddenCategoriesCtx>({
  hidden: new Set(),
  isHidden: () => false,
  toggle: () => {},
  ready: false,
});

export function HiddenCategoriesProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!v) return;
        const arr = JSON.parse(v);
        if (Array.isArray(arr)) setHidden(new Set(arr.filter((s) => typeof s === 'string')));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: Set<string>) => {
    AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {});
  }, []);

  const toggle = useCallback(
    (slug: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value = useMemo<HiddenCategoriesCtx>(
    () => ({ hidden, isHidden: (slug) => hidden.has(slug), toggle, ready }),
    [hidden, toggle, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHiddenCategories(): HiddenCategoriesCtx {
  return useContext(Ctx);
}
