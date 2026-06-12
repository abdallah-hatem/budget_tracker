import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { CollapsibleCard } from '../CollapsibleCard';

it('is collapsed by default and expands/collapses on header tap', () => {
  const api = render(
    <CollapsibleCard title="Accounts" testID="section">
      <Text testID="body">inner</Text>
    </CollapsibleCard>,
  );
  // Header is always shown; body hidden until expanded.
  expect(api.getByText('Accounts')).toBeTruthy();
  expect(api.queryByTestId('body')).toBeNull();

  fireEvent.press(api.getByTestId('section'));
  expect(api.getByTestId('body')).toBeTruthy();

  fireEvent.press(api.getByTestId('section'));
  expect(api.queryByTestId('body')).toBeNull();
});

it('can start expanded', () => {
  const api = render(
    <CollapsibleCard title="Accounts" defaultExpanded>
      <Text testID="body">inner</Text>
    </CollapsibleCard>,
  );
  expect(api.getByTestId('body')).toBeTruthy();
});
