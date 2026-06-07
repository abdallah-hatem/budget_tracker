import { useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { useTransactions } from '../transactions/useTransactions';
import { useRefetchOnTxnChange } from '../sync/dataSync';
import { summarize } from '../dashboard/summary';
import { monthRange, currentMonthKey } from '../dashboard/monthRange';
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

  // Always the current calendar month — recomputed on mount.
  const filter = useMemo(() => {
    const { from, to } = monthRange(currentMonthKey());
    return { from, to, status: 'confirmed' as const };
  }, []);

  const { data, refresh } = useTransactions(filter);
  useRefetchOnTxnChange(useCallback(() => void refresh(), [refresh]));

  useEffect(() => {
    if (!user) return;
    writeWidgetSnapshot(
      buildWidgetSnapshot({ summary: summarize(data), transactions: data, locale, now: new Date() }),
    );
  }, [data, locale, user]);

  // Blank the widget when the authenticated area unmounts (sign-out / delete).
  useEffect(() => () => clearWidgetSnapshot(), []);
}
