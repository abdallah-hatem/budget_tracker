import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { FloatingTabBar } from '@/src/ui/FloatingTabBar';
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

beforeEach(() => {
  jest.clearAllMocks();
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

it('tapping the center FAB starts voice capture', async () => {
  const api = renderBar();
  fireEvent.press(api.getByTestId('capture-fab'));
  await waitFor(() => expect(startVoice).toHaveBeenCalledTimes(1));
  expect(openManual).not.toHaveBeenCalled();
  expect(openType).not.toHaveBeenCalled();
});

it('holding the FAB opens the manual/type menu', async () => {
  const api = renderBar();
  expect(api.queryByTestId('capture-menu-backdrop')).toBeNull();

  fireEvent(api.getByTestId('capture-fab'), 'longPress');

  await waitFor(() => expect(api.queryByTestId('capture-menu-backdrop')).toBeTruthy());
  // Voice is NOT triggered by a hold.
  expect(startVoice).not.toHaveBeenCalled();
  // Both options are present.
  expect(api.getByLabelText('Manual')).toBeTruthy();
  expect(api.getByLabelText('Type')).toBeTruthy();
});

it('picking "Manual" from the menu opens the manual sheet and closes the menu', async () => {
  const api = renderBar();
  fireEvent(api.getByTestId('capture-fab'), 'longPress');
  await waitFor(() => expect(api.queryByTestId('capture-menu-backdrop')).toBeTruthy());

  fireEvent.press(api.getByLabelText('Manual'));

  expect(openManual).toHaveBeenCalledTimes(1);
  expect(openType).not.toHaveBeenCalled();
  // Menu closes after a pick.
  await waitFor(() => expect(api.queryByTestId('capture-menu-backdrop')).toBeNull());
});

it('picking "Type" from the menu opens the type sheet', async () => {
  const api = renderBar();
  fireEvent(api.getByTestId('capture-fab'), 'longPress');
  await waitFor(() => expect(api.queryByTestId('capture-menu-backdrop')).toBeTruthy());

  fireEvent.press(api.getByLabelText('Type'));

  expect(openType).toHaveBeenCalledTimes(1);
  expect(openManual).not.toHaveBeenCalled();
});

it('tapping the backdrop closes the menu without picking anything', async () => {
  const api = renderBar();
  fireEvent(api.getByTestId('capture-fab'), 'longPress');
  await waitFor(() => expect(api.queryByTestId('capture-menu-backdrop')).toBeTruthy());

  fireEvent.press(api.getByTestId('capture-menu-backdrop'));

  await waitFor(() => expect(api.queryByTestId('capture-menu-backdrop')).toBeNull());
  expect(openManual).not.toHaveBeenCalled();
  expect(openType).not.toHaveBeenCalled();
  expect(startVoice).not.toHaveBeenCalled();
});
