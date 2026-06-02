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
import { useRouter } from 'expo-router';
import { useSession } from '@/src/features/auth/SessionProvider';
import { registerForPushNotificationsAsync } from './notifications';

export function useNotifications(): void {
  const router = useRouter();
  const { user } = useSession();
  // Track which user id we've already registered so we don't repeat on re-renders.
  const registeredUserIdRef = useRef<string | null>(null);

  // ------------------------------------------------------------------
  // Foreground tap listener + cold-start tap handler
  // ------------------------------------------------------------------
  useEffect(() => {
    // Handle taps while the app is foregrounded / backgrounded.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === 'string') {
          router.push(url as never);
        }
      },
    );

    // Handle cold-start: app was launched by tapping a notification.
    void (async () => {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse) {
        const url = lastResponse.notification.request.content.data?.url;
        if (typeof url === 'string') {
          router.push(url as never);
        }
      }
    })();

    return () => {
      subscription.remove();
    };
  }, [router]);

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
