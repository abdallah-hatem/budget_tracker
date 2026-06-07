import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { DataSyncProvider, useDataSync, useRefetchOnTxnChange } from '../dataSync';

function Subscriber({ onRefetch }: { onRefetch: () => void }) {
  const { notifyTxnsChanged } = useDataSync();
  useRefetchOnTxnChange(onRefetch);
  return (
    <Pressable testID="notify" onPress={notifyTxnsChanged}>
      <Text>notify</Text>
    </Pressable>
  );
}

it('does not refetch on the initial mount', () => {
  const refetch = jest.fn();
  render(
    <DataSyncProvider>
      <Subscriber onRefetch={refetch} />
    </DataSyncProvider>,
  );
  expect(refetch).not.toHaveBeenCalled();
});

it('refetches once per notifyTxnsChanged()', () => {
  const refetch = jest.fn();
  const api = render(
    <DataSyncProvider>
      <Subscriber onRefetch={refetch} />
    </DataSyncProvider>,
  );

  fireEvent.press(api.getByTestId('notify'));
  expect(refetch).toHaveBeenCalledTimes(1);

  fireEvent.press(api.getByTestId('notify'));
  expect(refetch).toHaveBeenCalledTimes(2);
});

it('useDataSync falls back to a no-op without a provider', () => {
  const refetch = jest.fn();
  // No DataSyncProvider — should not throw, and never refetches.
  const api = render(<Subscriber onRefetch={refetch} />);
  fireEvent.press(api.getByTestId('notify'));
  expect(refetch).not.toHaveBeenCalled();
});
