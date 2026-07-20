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

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useSession } from '@/src/features/auth/SessionProvider';
import { registerForPushNotificationsAsync } from './notifications';
import { ensureIngestToken } from '@/src/features/ingest/api';
import { updateTransaction, deleteTransaction } from '@/src/features/transactions/api';
import { useDataSync } from '@/src/features/sync/dataSync';
import { categoryLabel } from '@/src/features/transactions/display';
import {
  getQuickActions,
  subscribeQuickActions,
  peekQuickActions,
  type QuickAction,
} from './quickActions';
import { t } from '@/src/lib/i18n';
import type { Locale } from '@/src/types';

/** Notification action identifier prefix for a user-defined quick action. */
const QUICK_PREFIX = 'quick:';

/** Category id set on the SMS-pending push (see ingest-sms). Long-pressing such
 *  a notification surfaces Confirm / Edit / Reject action buttons. */
export const SMS_PENDING_CATEGORY = 'sms_pending';

export function useNotifications(): void {
  const router = useRouter();
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const { notifyTxnsChanged } = useDataSync();

  // User-defined notification quick actions. Kept in state (drives the category
  // registration) AND in a ref (so the response handler reads the latest without
  // re-subscribing). Loaded once + refreshed on every change from Settings.
  const [quickActions, setQuickActionsState] = useState<QuickAction[]>([]);
  const quickActionsRef = useRef<QuickAction[]>(peekQuickActions());
  useEffect(() => {
    let alive = true;
    const load = () => {
      void getQuickActions().then((list) => {
        if (!alive) return;
        quickActionsRef.current = list;
        setQuickActionsState(list);
      });
    };
    load();
    const unsub = subscribeQuickActions(load);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

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
      // A user-defined quick action → file the txn into the preset's category /
      // type / note and confirm it, in the background (like Confirm).
      if (typeof action === 'string' && action.startsWith(QUICK_PREFIX) && txnId) {
        await decrementBadge();
        try {
          const id = action.slice(QUICK_PREFIX.length);
          const preset = quickActionsRef.current.find((q) => q.id === id);
          if (preset) {
            await updateTransaction(txnId, {
              category_slug: preset.categorySlug,
              type: preset.type,
              note: preset.note,
              status: 'confirmed',
            });
            notifyTxnsChanged();
          }
        } catch {
          /* best-effort */
        }
        return;
      }
      // 'note' text-input action → attach the typed note (if any) and confirm.
      if (action === 'note' && txnId) {
        await decrementBadge();
        try {
          const typed = typeof response.userText === 'string' ? response.userText.trim() : '';
          await updateTransaction(
            txnId,
            typed ? { note: typed, status: 'confirmed' } : { status: 'confirmed' },
          );
          notifyTxnsChanged();
        } catch {
          /* best-effort */
        }
        return;
      }
      // 'edit' action → open the app on the Pending tab AND open the edit sheet
      // for this specific transaction (via the `edit` param the screen reads).
      if (action === 'edit' && txnId) {
        router.push({ pathname: '/(tabs)/pending', params: { edit: txnId } } as never);
        return;
      }
      // A plain body tap → open the app at the deep link (the Pending list).
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
  // Register the SMS-pending action category shown on long-press:
  // Confirm · <user quick actions> · Add note · Edit · Reject. Pure JS via
  // expo-notifications → OTA-able. Re-registered when the locale OR the user's
  // quick-action presets change so the buttons stay current.
  // ------------------------------------------------------------------
  useEffect(() => {
    void Notifications.setNotificationCategoryAsync(SMS_PENDING_CATEGORY, [
      // Confirm / quick actions / note / Reject act in the BACKGROUND (no app
      // open); Edit opens the app.
      {
        identifier: 'confirm',
        buttonTitle: t('confirm', locale),
        options: { opensAppToForeground: false },
      },
      // One button per user preset: files the txn into its category/type/note.
      ...quickActions.map((q) => ({
        identifier: `${QUICK_PREFIX}${q.id}`,
        buttonTitle: q.note.trim().length > 0
          ? `${categoryLabel(q.categorySlug, locale)} · ${q.note.trim()}`
          : categoryLabel(q.categorySlug, locale),
        options: { opensAppToForeground: false },
      })),
      // Type a note right on the notification, then confirm.
      {
        identifier: 'note',
        buttonTitle: t('notifActions.addNote', locale),
        textInput: {
          submitButtonTitle: t('save', locale),
          placeholder: t('notifActions.notePlaceholder', locale),
        },
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
  }, [locale, quickActions]);

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
