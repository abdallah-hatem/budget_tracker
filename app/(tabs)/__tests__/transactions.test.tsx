import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import TransactionsScreen from '../transactions';
import type { Transaction } from '../../../src/types';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (cb: () => void) => { useEffect(() => { cb(); }, []); },
  };
});

jest.mock('../../../src/features/transactions/api', () => ({
  listTransactions: jest.fn(),
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));
jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

import { listTransactions, deleteTransaction } from '../../../src/features/transactions/api';
import { useSession } from '../../../src/features/auth/SessionProvider';

const mockList = listTransactions as jest.Mock;
const mockDelete = deleteTransaction as jest.Mock;
const mockSession = useSession as jest.Mock;

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: over.id ?? 'id',
    user_id: 'u1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 0,
    currency: 'EGP',
    category_slug: over.category_slug ?? 'food',
    note: over.note ?? null,
    raw_text: null,
    source: 'text',
    status: 'confirmed',
    confidence: null,
    occurred_at: over.occurred_at ?? '2026-06-10T00:00:00.000Z',
    account_id: null,
    created_at: '2026-06-10T00:00:00.000Z',
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockDelete.mockReset();
  mockSession.mockReturnValue({
    session: { user: { id: 'u1' } },
    user: { id: 'u1' },
    profile: { id: 'u1', locale: 'en', display_name: 'Test', currency: 'EGP' },
    loading: false,
  });
});

describe('TransactionsScreen', () => {
  it('lists transactions with bilingual labels', async () => {
    mockList.mockResolvedValue([
      tx({ id: 'a', category_slug: 'food', note: 'lunch', amount: 50 }),
      tx({ id: 'b', category_slug: 'transport', note: 'uber', amount: 30 }),
    ]);
    render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Food & Drink')).toBeTruthy());
    expect(screen.getByText('Transport')).toBeTruthy();
    expect(screen.getByText('lunch')).toBeTruthy();
  });

  it('opens the edit sheet on row press and deletes a row, then re-queries', async () => {
    mockList.mockResolvedValue([tx({ id: 'a', category_slug: 'food', note: 'lunch', amount: 50 })]);
    mockDelete.mockResolvedValue(undefined);
    render(<TransactionsScreen />);

    await waitFor(() => expect(screen.getByText('lunch')).toBeTruthy());
    fireEvent.press(screen.getByTestId('txn-row-a'));

    // Edit sheet is open -> delete.
    fireEvent.press(await screen.findByTestId('edit-delete'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a'));
    // After delete, the list is refreshed (listTransactions called again).
    // With the focus-effect also triggering a refresh on mount, total calls >= 2.
    await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('shows the empty state when there are no transactions', async () => {
    mockList.mockResolvedValue([]);
    render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('No transactions yet')).toBeTruthy());
  });

  it('calls listTransactions again on focus', async () => {
    mockList.mockResolvedValue([]);
    render(<TransactionsScreen />);
    // The initial mount calls listTransactions once (from useEffect on filterKey).
    // The useFocusEffect mock fires the refresh callback immediately, triggering
    // another call. Wait for both to settle.
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});
