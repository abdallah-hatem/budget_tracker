import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { FloatingTabBar, hoveredMenuIndex } from '@/src/ui/FloatingTabBar';
import { useCapture } from '@/src/features/capture/CaptureProvider';
import { usePendingContext } from '@/src/features/transactions/PendingProvider';

jest.mock('@/src/features/capture/CaptureProvider', () => ({ useCapture: jest.fn() }));
jest.mock('@/src/features/transactions/PendingProvider', () => ({
  usePendingContext: jest.fn(),
}));

const mockedCapture = useCapture as unknown as jest.Mock;
const mockedPending = usePendingContext as unknown as jest.Mock;

const startVoice = jest.fn();
const openType = jest.fn();
const openManual = jest.fn();

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Mic press origin used by the gesture helpers below.
const OX = 200;
const OY = 800;

function makeProps() {
  const routes = ['index', 'transactions', 'pending', 'settings'].map((name) => ({
    name,
    key: `${name}-key`,
  }));
  const descriptors = Object.fromEntries(
    routes.map((r) => [r.key, { options: { title: r.name } }]),
  );
  return {
    state: { index: 0, routes },
    descriptors,
    navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
  } as unknown as BottomTabBarProps;
}

function renderBar() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <FloatingTabBar {...makeProps()} />
    </SafeAreaProvider>,
  );
}

// ── Gesture helpers (drive the RN responder lifecycle directly) ──────────────
function grant(api: ReturnType<typeof renderBar>, x = OX, y = OY) {
  fireEvent(api.getByTestId('capture-fab'), 'responderGrant', {
    nativeEvent: { pageX: x, pageY: y },
  });
}
function move(api: ReturnType<typeof renderBar>, x: number, y: number) {
  fireEvent(api.getByTestId('capture-fab'), 'responderMove', {
    nativeEvent: { pageX: x, pageY: y },
  });
}
function release(api: ReturnType<typeof renderBar>) {
  fireEvent(api.getByTestId('capture-fab'), 'responderRelease', { nativeEvent: {} });
}
function holdUntilMenuOpens() {
  act(() => {
    jest.advanceTimersByTime(260); // > HOLD_MS
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockedCapture.mockReturnValue({
    startVoice,
    openType,
    openManual,
    isListening: false,
    loading: false,
    supported: true,
  });
  mockedPending.mockReturnValue({ count: 0 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('hoveredMenuIndex', () => {
  it('returns -1 until the finger has moved up toward the options', () => {
    expect(hoveredMenuIndex(0, 0)).toBe(-1);
    expect(hoveredMenuIndex(-80, -10)).toBe(-1); // sideways but not up
  });
  it('maps up-left to Manual (0) and up-right to Type (1)', () => {
    expect(hoveredMenuIndex(-70, -120)).toBe(0);
    expect(hoveredMenuIndex(70, -120)).toBe(1);
    expect(hoveredMenuIndex(-1, -60)).toBe(0);
    expect(hoveredMenuIndex(1, -60)).toBe(1);
  });
});

it('a quick tap (released before the hold) starts voice capture', () => {
  const api = renderBar();
  grant(api);
  release(api); // released before HOLD_MS elapses
  expect(startVoice).toHaveBeenCalledTimes(1);
  expect(openManual).not.toHaveBeenCalled();
  expect(openType).not.toHaveBeenCalled();
  // The pending hold timer must not fire a late menu-open.
  act(() => jest.advanceTimersByTime(500));
  expect(api.queryByTestId('capture-menu-backdrop')).toBeNull();
});

it('pressing and holding opens the menu', () => {
  const api = renderBar();
  expect(api.queryByTestId('capture-menu-backdrop')).toBeNull();
  grant(api);
  holdUntilMenuOpens();
  expect(api.queryByTestId('capture-menu-backdrop')).toBeTruthy();
  expect(startVoice).not.toHaveBeenCalled();
  expect(api.getByLabelText('Manual')).toBeTruthy();
  expect(api.getByLabelText('Type')).toBeTruthy();
});

it('hold → slide up-left → release picks Manual (release-to-click)', () => {
  const api = renderBar();
  grant(api);
  holdUntilMenuOpens();
  move(api, OX - 70, OY - 120); // up-left toward Manual
  release(api);
  expect(openManual).toHaveBeenCalledTimes(1);
  expect(openType).not.toHaveBeenCalled();
  expect(startVoice).not.toHaveBeenCalled();
  // Menu closed after the pick.
  expect(api.queryByTestId('capture-menu-backdrop')).toBeNull();
});

it('hold → slide up-right → release picks Type', () => {
  const api = renderBar();
  grant(api);
  holdUntilMenuOpens();
  move(api, OX + 70, OY - 120); // up-right toward Type
  release(api);
  expect(openType).toHaveBeenCalledTimes(1);
  expect(openManual).not.toHaveBeenCalled();
});

it('hold → release without sliding leaves the menu open to tap', () => {
  const api = renderBar();
  grant(api);
  holdUntilMenuOpens();
  release(api); // released on the mic, no option hovered
  // Menu stays open…
  expect(api.queryByTestId('capture-menu-backdrop')).toBeTruthy();
  expect(openManual).not.toHaveBeenCalled();
  // …and a plain tap on an option still works.
  fireEvent.press(api.getByLabelText('Manual'));
  expect(openManual).toHaveBeenCalledTimes(1);
  expect(api.queryByTestId('capture-menu-backdrop')).toBeNull();
});

it('a quick tap on the mic while the menu is open dismisses it (no voice)', () => {
  const api = renderBar();
  grant(api);
  holdUntilMenuOpens();
  release(api); // leaves the menu open
  expect(api.queryByTestId('capture-menu-backdrop')).toBeTruthy();

  // Tap the mic again (grant + immediate release, no hold) → closes the menu.
  grant(api);
  release(api);
  expect(api.queryByTestId('capture-menu-backdrop')).toBeNull();
  expect(startVoice).not.toHaveBeenCalled();
  expect(openManual).not.toHaveBeenCalled();
  expect(openType).not.toHaveBeenCalled();
});

it('tapping the backdrop closes the open menu without selecting', () => {
  const api = renderBar();
  grant(api);
  holdUntilMenuOpens();
  release(api); // leaves it open
  fireEvent.press(api.getByTestId('capture-menu-backdrop'));
  expect(api.queryByTestId('capture-menu-backdrop')).toBeNull();
  expect(openManual).not.toHaveBeenCalled();
  expect(openType).not.toHaveBeenCalled();
  expect(startVoice).not.toHaveBeenCalled();
});
