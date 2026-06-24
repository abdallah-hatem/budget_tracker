import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { useTransactions } from '../transactions/useTransactions';
import { useRefetchOnTxnChange } from '../sync/dataSync';
import { summarize } from '../dashboard/summary';
import { monthRange, currentMonthKey } from '../dashboard/monthRange';
import { useMonthStart } from '../dashboard/MonthStartProvider';
import { useHiddenCategories } from '../categories/HiddenCategoriesProvider';
import { buildWidgetSnapshot, WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from './snapshot';
import type { Locale } from '../../types';

/** Shared App Group container id — must match app.json + the widget target. */
export const APP_GROUP = 'group.com.abdallah.masareef';

// @bacons/apple-targets ships a NATIVE module (ExtensionStorage). It only exists
// in a dev/standalone build — load it defensively so Expo Go, web, and jest just
// no-op instead of crashing (same pattern as the speech-recognition module).
let ExtensionStorage: { new (group: string): { set: (k: string, v: string) => void }; reloadWidget: () => void } | null =
  null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExtensionStorage = require('@bacons/apple-targets').ExtensionStorage ?? null;
} catch {
  ExtensionStorage = null;
}

/** Write the snapshot into the App Group and nudge the widget to reload. */
export function writeWidgetSnapshot(snapshot: WidgetSnapshot): void {
  if (Platform.OS !== 'ios' || !ExtensionStorage) return;
  try {
    const storage = new ExtensionStorage(APP_GROUP);
    storage.set(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
    ExtensionStorage.reloadWidget();
  } catch {
    // The widget is best-effort; never let it break the app.
  }
}

/** Blank the widget (e.g. on sign-out) so it never shows another user's data. */
export function clearWidgetSnapshot(): void {
  writeWidgetSnapshot(
    buildWidgetSnapshot({
      summary: summarize([]),
      transactions: [],
      locale: 'en',
      now: new Date(),
    }),
  );
}

/**
 * Mount once in the authenticated area. Keeps the iOS home-screen widget in sync
 * with the CURRENT month (independent of whatever month the dashboard is showing),
 * re-writing whenever a transaction changes anywhere, and blanking it on sign-out.
 */
export function useWidgetSync(): void {
  const { user, profile } = useSession();
  const locale: Locale = (profile?.locale as Locale) ?? 'en';
  const { startDay } = useMonthStart();
  const { hidden } = useHiddenCategories();

  // Always the CURRENT financial month (honouring the user's start-of-month day).
  const filter = useMemo(() => {
    const { from, to } = monthRange(currentMonthKey(new Date(), startDay), startDay);
    return { from, to, status: 'confirmed' as const };
  }, [startDay]);

  const { data, loading, error, refresh } = useTransactions(filter);
  useRefetchOnTxnChange(useCallback(() => void refresh(), [refresh]));

  // Write ONLY on a settled, successful load — never mid-fetch or on error — so
  // the transient empty `[]` during the initial fetch can't blank the widget to
  // zero. A genuinely empty month still writes zero (correct).
  useEffect(() => {
    if (!user || loading || error) return;
    writeWidgetSnapshot(
      buildWidgetSnapshot({ summary: summarize(data, hidden), transactions: data, locale, now: new Date(), hidden }),
    );
  }, [data, loading, error, locale, user, hidden]);

  // Keep it fresh: refetch the current month whenever the app comes to the
  // foreground, so the widget reflects new spend even if nothing changed in-app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Blank the widget ONLY on a real sign-out (user → null), NOT on every unmount —
  // navigation transitions would otherwise zero it.
  const prevUserId = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    const id = user?.id ?? null;
    if (prevUserId.current && !id) clearWidgetSnapshot();
    prevUserId.current = id;
  }, [user]);
}
