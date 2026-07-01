/**
 * useNotifications — side-effect hook mounted in RootNavigator.
 *
 * Responsibilities:
 *  1. Register the device's Expo push token with Supabase when the user is
 *     signed in (runs once per user id).
 *  2. Deep-link to `/(tabs)/pending` when a notification is tapped while the
 *     app is open (foreground response listener).
 *  3. Handle cold-start taps: if the app was launched via a notification tap,
 *     navigate to the embedded `data.url` on first mount.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useSession } from '@/src/features/auth/SessionProvider';
import { registerForPushNotificationsAsync } from './notifications';
import { ensureIngestToken } from '@/src/features/ingest/api';
import { updateTransaction, deleteTransaction } from '@/src/features/transactions/api';
import { useDataSync } from '@/src/features/sync/dataSync';
import { t } from '@/src/lib/i18n';
import type { Locale } from '@/src/types';

/** Category id set on the SMS-pending push (see ingest-sms). Long-pressing such
 *  a notification surfaces Confirm / Edit / Reject action buttons. */
export const SMS_PENDING_CATEGORY = 'sms_pending';

export function useNotifications(): void {
  const router = useRouter();
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const { notifyTxnsChanged } = useDataSync();

  // Drop the app-icon badge by one, LOCALLY (no network). A notification action
  // runs in a very short iOS background window; a network round-trip (fetching
  // the true count) often doesn't finish before the app is suspended, so the
  // badge never updates. Decrementing is instant, so it commits in time. Any
  // drift is reconciled by usePendingBadge from the true count on next open.
  const decrementBadge = useCallback(async () => {
    try {
      const current = await Notifications.getBadgeCountAsync();
      await Notifications.setBadgeCountAsync(Math.max(0, current - 1));
    } catch {
      /* best-effort */
    }
  }, []);

  // Handle a notification response: an action-button tap (Confirm/Edit/Reject)
  // or a plain body tap. Confirm/Reject act on the transaction in the background
  // (no app open); Edit and plain taps deep-link into the app.
  const handleResponse = useCallback(
    async (response: Notifications.NotificationResponse) => {
      const data = (response.notification.request.content.data ?? {}) as {
        url?: string;
        txnId?: string;
      };
      const action = response.actionIdentifier;
      const txnId = typeof data.txnId === 'string' ? data.txnId : null;

      if (action === 'confirm' && txnId) {
        // Drop the badge first (instant, local) so it commits before iOS
        // suspends the app, then do the DB write.
        await decrementBadge();
        try {
          await updateTransaction(txnId, { status: 'confirmed' });
          notifyTxnsChanged();
        } catch {
          /* best-effort */
        }
        return;
      }
      if (action === 'reject' && txnId) {
        await decrementBadge();
        try {
          await deleteTransaction(txnId);
          notifyTxnsChanged();
        } catch {
          /* best-effort */
        }
        return;
      }
      // 'edit' action or a plain tap → open the app at the deep link.
      if (typeof data.url === 'string') {
        router.push(data.url as never);
      }
    },
    [router, notifyTxnsChanged, decrementBadge],
  );

  // Re-apply the LAST notification response on cold start and on every
  // foreground. iOS does not reliably run background action handlers
  // (Confirm/Reject use opensAppToForeground:false), so the action often doesn't
  // execute until the app is opened — this makes it take effect then. Deduped by
  // notification id + action so we never re-run (re-navigate / re-reject) the
  // same response twice.
  const handledResponseKeyRef = useRef<string | null>(null);
  const responseKey = (r: Notifications.NotificationResponse) =>
    `${r.notification.request.identifier}|${r.actionIdentifier}`;
  const processLastResponse = useCallback(async () => {
    const r = await Notifications.getLastNotificationResponseAsync();
    if (!r) return;
    const key = responseKey(r);
    if (handledResponseKeyRef.current === key) return;
    handledResponseKeyRef.current = key;
    await handleResponse(r);
  }, [handleResponse]);
  // The root navigator is mounted only once this has a `key`. Navigating before
  // then — which is exactly what a cold-start notification tap did, while the
  // loading screen is up and the <Stack> isn't mounted yet — leaves the router
  // stuck and hangs the app on an infinite spinner.
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;
  const { user, loading } = useSession();
  // Track which user id we've already registered so we don't repeat on re-renders.
  const registeredUserIdRef = useRef<string | null>(null);

  // ------------------------------------------------------------------
  // Register the SMS-pending action category (Confirm / Edit / Reject) shown on
  // long-press. Pure JS via expo-notifications → OTA-able. Re-registered when
  // the locale changes so the button titles are localized.
  // ------------------------------------------------------------------
  useEffect(() => {
    void Notifications.setNotificationCategoryAsync(SMS_PENDING_CATEGORY, [
      // Confirm/Reject act in the BACKGROUND (no app open); Edit opens the app.
      {
        identifier: 'confirm',
        buttonTitle: t('confirm', locale),
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'edit',
        buttonTitle: t('edit', locale),
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'reject',
        buttonTitle: t('reject', locale),
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]).catch(() => {
      /* best-effort */
    });
  }, [locale]);

  // ------------------------------------------------------------------
  // Taps / action buttons while the app is RUNNING (foreground / background):
  // the navigator is already mounted, so act immediately.
  // ------------------------------------------------------------------
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        // Mark handled so the foreground re-check below doesn't run it again.
        handledResponseKeyRef.current = responseKey(response);
        void handleResponse(response);
      },
    );
    return () => {
      subscription.remove();
    };
  }, [handleResponse]);

  // ------------------------------------------------------------------
  // COLD START + FOREGROUND: apply the last notification action once the
  // navigator is mounted and the session is resolved (so the DB write is
  // authenticated), and re-check every time the app returns to the foreground.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!navReady || loading) return;
    void processLastResponse();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void processLastResponse();
    });
    return () => sub.remove();
  }, [navReady, loading, processLastResponse]);

  // ------------------------------------------------------------------
  // Token registration — once per signed-in user
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    if (registeredUserIdRef.current === user.id) return;

    registeredUserIdRef.current = user.id;
    void registerForPushNotificationsAsync(user.id);
    // Provision the SMS-ingest token into the Keychain for the App Intent.
    void ensureIngestToken();
  }, [user]);
}
