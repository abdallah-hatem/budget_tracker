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
// Controllable per test (must be `mock`-prefixed to be referenced in jest.mock).
let mockNavState: { key?: string } | undefined;
let mockSession: { user: { id: string } | null; loading: boolean };

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRootNavigationState: () => mockNavState,
}));

// Mock SessionProvider
jest.mock('@/src/features/auth/SessionProvider', () => ({
  useSession: () => mockSession,
}));

// Mock the registration function so tests are isolated from Supabase / device checks
jest.mock('../notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(async () => 'ExponentPushToken[test]'),
}));

// Mock the transactions api so Confirm/Reject actions don't hit Supabase.
const mockUpdateTransaction = jest.fn((..._args: unknown[]) => Promise.resolve({}));
const mockDeleteTransaction = jest.fn((..._args: unknown[]) => Promise.resolve(undefined));
jest.mock('@/src/features/transactions/api', () => ({
  updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
  deleteTransaction: (...args: unknown[]) => mockDeleteTransaction(...args),
}));

function makeActionResponse(actionIdentifier: string, txnId: string, identifier = 'n1') {
  return {
    actionIdentifier,
    notification: { request: { identifier, content: { data: { txnId, url: '/(tabs)/pending' } } } },
  };
}

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
    // Default: navigator mounted + session resolved (the normal steady state).
    mockNavState = { key: 'root' };
    mockSession = { user: { id: 'user-123' }, loading: false };
    // Default: no cold-start response
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);
    // The hook registers a notification category on mount — resolve it.
    (Notifications.setNotificationCategoryAsync as jest.Mock).mockResolvedValue(undefined);
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

  it('Reject action deletes the transaction and opens Pending', async () => {
    let cb: ((r: unknown) => void) | null = null;
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      (f: (r: unknown) => void) => { cb = f; return { remove: jest.fn() }; },
    );
    renderHook(() => useNotifications());
    await act(async () => { cb?.(makeActionResponse('reject', 't9')); });
    await waitFor(() => expect(mockDeleteTransaction).toHaveBeenCalledWith('t9'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/pending'));
  });

  it('Confirm action sets status:confirmed and opens Pending', async () => {
    let cb: ((r: unknown) => void) | null = null;
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      (f: (r: unknown) => void) => { cb = f; return { remove: jest.fn() }; },
    );
    renderHook(() => useNotifications());
    await act(async () => { cb?.(makeActionResponse('confirm', 't5')); });
    await waitFor(() =>
      expect(mockUpdateTransaction).toHaveBeenCalledWith('t5', { status: 'confirmed' }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/pending'));
  });

  it('re-applies a background action on cold-start (getLastNotificationResponseAsync)', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(
      makeActionResponse('reject', 't7'),
    );
    renderHook(() => useNotifications());
    await waitFor(() => expect(mockDeleteTransaction).toHaveBeenCalledWith('t7'));
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

  it('does NOT navigate on cold-start until the navigator is mounted (the hang fix)', async () => {
    // Navigator not ready yet (loading screen up) + a pending cold-start tap.
    mockNavState = undefined;
    mockSession = { user: { id: 'user-123' }, loading: true };
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(
      makeNotificationResponse('/(tabs)/pending'),
    );

    const { rerender } = renderHook(() => useNotifications());
    await act(async () => {
      await Promise.resolve();
    });
    // Must NOT push while the navigator isn't mounted (that's what hung the app).
    expect(mockPush).not.toHaveBeenCalled();

    // Once the session resolves and the navigator mounts, it navigates.
    mockNavState = { key: 'root' };
    mockSession = { user: { id: 'user-123' }, loading: false };
    rerender({});
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
