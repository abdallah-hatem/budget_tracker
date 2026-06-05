/**
 * notifications.ts
 *
 * Configures the foreground notification handler (module-level side-effect)
 * and exports `registerForPushNotificationsAsync` which:
 *   1. Requests OS permission
 *   2. Fetches the Expo push token (requires a physical device + EAS projectId)
 *   3. Upserts the token into public.push_tokens via Supabase
 *
 * Designed to never throw: every failure path returns null so the app
 * stays alive even when running in Expo Go / simulator / no EAS link.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/src/lib/supabase';

// ---------------------------------------------------------------------------
// Foreground handler — set once at module load.
// SDK 54 keys: shouldShowBanner + shouldShowList (replaces legacy shouldShowAlert).
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ---------------------------------------------------------------------------
// registerForPushNotificationsAsync
// ---------------------------------------------------------------------------
export async function registerForPushNotificationsAsync(
  userId: string,
): Promise<string | null> {
  try {
    // Android: create a notification channel so banners are visible.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Request permission if not already granted. (Runs on the simulator too, so
    // local notifications and `xcrun simctl push` can display and be tapped.)
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[Notifications] Notification permission denied.');
      return null;
    }

    // A real Expo PUSH token requires a physical device (+ EAS projectId). On the
    // simulator we stop here: permission is granted so notifications can show,
    // but there is no push token to store.
    if (!Device.isDevice) {
      console.log(
        '[Notifications] Physical device required for a push token; permission granted, token skipped.',
      );
      return null;
    }

    // Resolve EAS projectId — required by getExpoPushTokenAsync in SDK 49+.
    // The user runs `eas init` to populate this; we guard gracefully if missing.
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn(
        '[Notifications] No EAS projectId found in app config. ' +
          'Run `eas init` to link your project. Push token registration skipped.',
      );
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Persist to Supabase push_tokens table (RLS: user can only write their own row).
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform: Platform.OS },
        { onConflict: 'token' },
      );

    if (error) {
      console.warn('[Notifications] Failed to upsert push token:', error.message);
      // Non-fatal — we still return the token so the caller is aware of it.
    }

    return token;
  } catch (err) {
    console.warn('[Notifications] registerForPushNotificationsAsync error:', err);
    return null;
  }
}
