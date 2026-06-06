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

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useSession } from '@/src/features/auth/SessionProvider';
import { registerForPushNotificationsAsync } from './notifications';

export function useNotifications(): void {
  const router = useRouter();
  // The root navigator is mounted only once this has a `key`. Navigating before
  // then — which is exactly what a cold-start notification tap did, while the
  // loading screen is up and the <Stack> isn't mounted yet — leaves the router
  // stuck and hangs the app on an infinite spinner.
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;
  const { user, loading } = useSession();
  // Track which user id we've already registered so we don't repeat on re-renders.
  const registeredUserIdRef = useRef<string | null>(null);
  // Cold-start navigation must run at most once.
  const coldStartHandledRef = useRef(false);

  // ------------------------------------------------------------------
  // Taps while the app is RUNNING (foreground / background): the navigator is
  // already mounted, so navigate immediately.
  // ------------------------------------------------------------------
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === 'string') {
          router.push(url as never);
        }
      },
    );
    return () => {
      subscription.remove();
    };
  }, [router]);

  // ------------------------------------------------------------------
  // COLD START: the app was launched by tapping a notification. Wait until the
  // navigator is mounted AND the session has resolved before navigating.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (coldStartHandledRef.current) return;
    if (!navReady || loading) return;
    coldStartHandledRef.current = true;
    void (async () => {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const url = lastResponse?.notification.request.content.data?.url;
      if (typeof url === 'string') {
        router.push(url as never);
      }
    })();
  }, [navReady, loading, router]);

  // ------------------------------------------------------------------
  // Token registration — once per signed-in user
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    if (registeredUserIdRef.current === user.id) return;

    registeredUserIdRef.current = user.id;
    void registerForPushNotificationsAsync(user.id);
  }, [user]);
}
