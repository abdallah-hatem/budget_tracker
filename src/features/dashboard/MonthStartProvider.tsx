import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';
import { DEFAULT_MONTH_START_DAY } from './monthRange';

// Device-level "start of month" day (e.g. salary day), applied app-wide to every
// "this month" calculation (dashboard, transactions, widget). Stored in
// AsyncStorage — no server migration, ships via OTA. Default = 1 (calendar month),
// so behaviour is unchanged until the user picks a different day.
const KEY = 'month_start_day';

interface MonthStartCtx {
  startDay: number;
  setStartDay: (d: number) => void;
  /** True once the stored value has been read (avoids a persistent flash). */
  ready: boolean;
}

const Ctx = createContext<MonthStartCtx>({
  startDay: DEFAULT_MONTH_START_DAY,
  setStartDay: () => {},
  ready: false,
});

/**
 * Mirror the device-local month-start day onto the user's profile row. The
 * daily budget-check job runs server-side and cannot read AsyncStorage, so it
 * reads profiles.month_start_day instead. Best-effort: never throws, so a
 * failed write can't break the settings UI.
 */
export async function syncMonthStartDay(day: number): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    await supabase.from('profiles').update({ month_start_day: day }).eq('id', uid);
  } catch {
    /* best-effort */
  }
}

export function MonthStartProvider({ children }: { children: React.ReactNode }) {
  const [startDay, setDay] = useState(DEFAULT_MONTH_START_DAY);
  const [ready, setReady] = useState(false);
  const didBackfill = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        const n = parseInt(v ?? '', 10);
        if (n >= 1 && n <= 31) setDay(n);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Backfill exactly once, the first time the stored value has been read, so
  // existing users get their real day synced onto the profile without having
  // to touch the setting. setStartDay is the sole writer for later changes.
  useEffect(() => {
    if (!ready || didBackfill.current) return;
    didBackfill.current = true;
    void syncMonthStartDay(startDay);
  }, [ready, startDay]);

  const setStartDay = useCallback((d: number) => {
    const n = Math.min(31, Math.max(1, Math.round(d)));
    setDay(n);
    AsyncStorage.setItem(KEY, String(n)).catch(() => {});
    void syncMonthStartDay(n);
  }, []);

  const value = useMemo(() => ({ startDay, setStartDay, ready }), [startDay, setStartDay, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMonthStart(): MonthStartCtx {
  return useContext(Ctx);
}
