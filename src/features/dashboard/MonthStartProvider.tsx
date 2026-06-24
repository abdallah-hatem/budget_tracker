import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export function MonthStartProvider({ children }: { children: React.ReactNode }) {
  const [startDay, setDay] = useState(DEFAULT_MONTH_START_DAY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        const n = parseInt(v ?? '', 10);
        if (n >= 1 && n <= 31) setDay(n);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setStartDay = useCallback((d: number) => {
    const n = Math.min(31, Math.max(1, Math.round(d)));
    setDay(n);
    AsyncStorage.setItem(KEY, String(n)).catch(() => {});
  }, []);

  const value = useMemo(() => ({ startDay, setStartDay, ready }), [startDay, setStartDay, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMonthStart(): MonthStartCtx {
  return useContext(Ctx);
}
