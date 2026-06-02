/**
 * useNotifications – unit tests
 *
 * Verifies that:
 *  1. router.push is called with the data.url when a notification response
 *     arrives via the foreground tap listener.
 *  2. router.push is called with the data.url on cold-start (getLastNotificationResponseAsync).
 *  3. registerForPushNotificationsAsync is called with the user's id once.
 *  4. The listener is removed on unmount.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { useNotifications } from '../useNotifications';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock SessionProvider
jest.mock('@/src/features/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'user-123' } }),
}));

// Mock the registration function so tests are isolated from Supabase / device checks
jest.mock('../notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(async () => 'ExponentPushToken[test]'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotificationResponse(url: string) {
  return {
    notification: {
      request: {
        content: {
          data: { url },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no cold-start response
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);
  });

  it('navigates to data.url when a notification response is received (foreground tap)', async () => {
    // Capture the listener callback so we can invoke it manually
    let capturedListener: ((response: unknown) => void) | null = null;
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      (cb: (response: unknown) => void) => {
        capturedListener = cb;
        return { remove: jest.fn() };
      },
    );

    renderHook(() => useNotifications());

    // Simulate a tap on a notification
    act(() => {
      capturedListener?.(makeNotificationResponse('/(tabs)/pending'));
    });

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/pending');
  });

  it('navigates to data.url on cold-start (getLastNotificationResponseAsync)', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(
      makeNotificationResponse('/(tabs)/pending'),
    );

    renderHook(() => useNotifications());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/pending');
    });
  });

  it('does NOT navigate if cold-start response has no data.url', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue({
      notification: { request: { content: { data: {} } } },
    });

    renderHook(() => useNotifications());

    // Give async effects time to settle
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const removeMock = jest.fn();
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({
      remove: removeMock,
    });

    const { unmount } = renderHook(() => useNotifications());
    unmount();

    expect(removeMock).toHaveBeenCalled();
  });

  it('calls registerForPushNotificationsAsync with the user id', async () => {
    const { registerForPushNotificationsAsync } = jest.requireMock('../notifications');

    renderHook(() => useNotifications());

    await waitFor(() => {
      expect(registerForPushNotificationsAsync).toHaveBeenCalledWith('user-123');
    });
  });
});
