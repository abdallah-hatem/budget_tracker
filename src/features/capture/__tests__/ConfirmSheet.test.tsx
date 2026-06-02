import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ConfirmSheet } from '../ConfirmSheet';
import { insertTransaction } from '../../transactions/api';
import type { ParsedTransaction, Transaction } from '../../../types';

jest.mock('../../transactions/api', () => ({
  insertTransaction: jest.fn(),
}));

const mockedInsert = insertTransaction as unknown as jest.Mock;

const parsed: ParsedTransaction = {
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  confidence: 0.9,
};

const savedRow: Transaction = {
  id: 'txn-1',
  user_id: 'user-1',
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  raw_text: 'spent 50 on coffee',
  source: 'text',
  status: 'confirmed',
  confidence: 0.9,
  occurred_at: '2026-06-02T10:00:00.000Z',
  created_at: '2026-06-02T10:00:01.000Z',
};

afterEach(() => jest.clearAllMocks());

it('renders the seeded amount and saves a confirmed row built from edits', async () => {
  mockedInsert.mockResolvedValue(savedRow);
  const onSaved = jest.fn();

  const { getByDisplayValue, getByTestId } = render(
    <ConfirmSheet
      parsed={parsed}
      rawText="spent 50 on coffee"
      userId="user-1"
      source="text"
      locale="en"
      onSaved={onSaved}
      onCancel={jest.fn()}
    />,
  );

  // Seeded amount is shown.
  getByDisplayValue('50');

  // Edit the amount, then save.
  fireEvent.changeText(getByTestId('confirm-amount'), '75.5');
  fireEvent.press(getByTestId('confirm-save'));

  await waitFor(() => expect(mockedInsert).toHaveBeenCalledTimes(1));
  const row = mockedInsert.mock.calls[0][0];
  expect(row).toMatchObject({
    user_id: 'user-1',
    type: 'expense',
    amount: 75.5,
    currency: 'EGP',
    category_slug: 'food',
    raw_text: 'spent 50 on coffee',
    source: 'text',
    status: 'confirmed',
  });
  expect(onSaved).toHaveBeenCalledWith(savedRow);
});

it('blocks save and shows an error when the amount is empty or zero', async () => {
  const { getByTestId, getByText } = render(
    <ConfirmSheet
      parsed={{ ...parsed, amount: 0 }}
      rawText="raw"
      userId="user-1"
      source="voice"
      locale="en"
      onSaved={jest.fn()}
      onCancel={jest.fn()}
    />,
  );

  fireEvent.press(getByTestId('confirm-save'));

  await waitFor(() => getByText('Enter an amount greater than 0'));
  expect(mockedInsert).not.toHaveBeenCalled();
});

it('calls onCancel when cancel is pressed', () => {
  const onCancel = jest.fn();
  const { getByTestId } = render(
    <ConfirmSheet
      parsed={parsed}
      rawText="raw"
      userId="user-1"
      source="text"
      locale="en"
      onSaved={jest.fn()}
      onCancel={onCancel}
    />,
  );
  fireEvent.press(getByTestId('confirm-cancel'));
  expect(onCancel).toHaveBeenCalled();
});
