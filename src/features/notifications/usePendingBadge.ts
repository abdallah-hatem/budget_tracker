import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

/**
 * Mirror the pending-transaction count onto the iOS app-icon badge, so the home
 * screen shows how many SMS-captured items are waiting for review. Driven solely
 * by the pending count — push notifications use shouldSetBadge:false, so there's
 * no conflict. setBadgeCountAsync is best-effort (no-op without permission).
 */
export function usePendingBadge(count: number): void {
  useEffect(() => {
    Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => {});
  }, [count]);
}
