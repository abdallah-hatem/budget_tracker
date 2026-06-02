import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import PendingScreen from '../pending';
import type { Transaction } from '../../../src/types';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (cb: () => void) => { useEffect(() => { cb(); }, []); },
  };
});

// Mock usePendingContext so we can control the data in tests without a real provider
jest.mock('../../../src/features/transactions/PendingProvider', () => ({
  usePendingContext: jest.fn(),
}));

// Mock api layer (used directly by the screen for confirm/reject and by EditTransactionSheet)
jest.mock('../../../src/features/transactions/api', () => ({
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
  listTransactions: jest.fn(),
}));

jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

import { usePendingContext } from '../../../src/features/transactions/PendingProvider';
import { updateTransaction, deleteTransaction } from '../../../src/features/transactions/api';
import { useSession } from '../../../src/features/auth/SessionProvider';

const mockUsePendingContext = usePendingContext as jest.MockedFunction<typeof usePendingContext>;
const mockUpdate = updateTransaction as jest.Mock;
const mockDelete = deleteTransaction as jest.Mock;
const mockSession = useSession as jest.Mock;

function pendingTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: over.id ?? 'p1',
    user_id: 'u1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 120,
    currency: 'EGP',
    category_slug: over.category_slug ?? 'food',
    note: over.note ?? 'grocery run',
    raw_text: over.raw_text ?? 'Bank: deducted EGP 120 for POS purchase',
    source: 'sms',
    status: 'pending',
    confidence: 0.9,
    occurred_at: '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:01.000Z',
  };
}

const noopRefresh = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  mockUpdate.mockReset();
  mockDelete.mockReset();
  noopRefresh.mockReset().mockResolvedValue(undefined);
  mockSession.mockReturnValue({
    session: { user: { id: 'u1' } },
    user: { id: 'u1' },
    profile: { id: 'u1', locale: 'en', display_name: 'Test', currency: 'EGP' },
    loading: false,
  });
});

describe('PendingScreen', () => {
  it('renders pending rows with category label and signed amount', async () => {
    mockUsePendingContext.mockReturnValue({
      data: [
        pendingTx({ id: 'p1', category_slug: 'food', amount: 120, type: 'expense' }),
        pendingTx({ id: 'p2', category_slug: 'salary', amount: 5000, type: 'income' }),
      ],
      count: 2,
      loading: false,
      error: null,
      refresh: noopRefresh,
    });

    render(<PendingScreen />);

    expect(screen.getByTestId('pending-row-p1')).toBeTruthy();
    expect(screen.getByTestId('pending-row-p2')).toBeTruthy();
    expect(screen.getByText('Food & Drink')).toBeTruthy();
    expect(screen.getByText('Salary')).toBeTruthy();
    // expense is negative
    expect(screen.getByText('-120.00 EGP')).toBeTruthy();
    // income is positive
    expect(screen.getByText('+5000.00 EGP')).toBeTruthy();
  });

  it('shows the empty state when there are no pending transactions', async () => {
    mockUsePendingContext.mockReturnValue({
      data: [],
      count: 0,
      loading: false,
      error: null,
      refresh: noopRefresh,
    });

    render(<PendingScreen />);

    expect(screen.getByText('No pending transactions')).toBeTruthy();
  });

  it('Confirm calls updateTransaction with { status: "confirmed" } then refresh', async () => {
    mockUpdate.mockResolvedValue({ ...pendingTx(), status: 'confirmed' });
    const refreshFn = jest.fn().mockResolvedValue(undefined);

    mockUsePendingContext.mockReturnValue({
      data: [pendingTx({ id: 'p1' })],
      count: 1,
      loading: false,
      error: null,
      refresh: refreshFn,
    });

    render(<PendingScreen />);

    fireEvent.press(screen.getByTestId('pending-confirm-p1'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('p1', { status: 'confirmed' }),
    );
    await waitFor(() => expect(refreshFn).toHaveBeenCalled());
  });

  it('Reject calls deleteTransaction then refresh', async () => {
    mockDelete.mockResolvedValue(undefined);
    const refreshFn = jest.fn().mockResolvedValue(undefined);

    mockUsePendingContext.mockReturnValue({
      data: [pendingTx({ id: 'p1' })],
      count: 1,
      loading: false,
      error: null,
      refresh: refreshFn,
    });

    render(<PendingScreen />);

    fireEvent.press(screen.getByTestId('pending-reject-p1'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(refreshFn).toHaveBeenCalled());
  });

  it('Edit opens the EditTransactionSheet for the selected row', async () => {
    mockUsePendingContext.mockReturnValue({
      data: [pendingTx({ id: 'p1', note: 'grocery run' })],
      count: 1,
      loading: false,
      error: null,
      refresh: noopRefresh,
    });

    render(<PendingScreen />);

    fireEvent.press(screen.getByTestId('pending-edit-p1'));

    // EditTransactionSheet renders the note in the note input
    await waitFor(() => expect(screen.getByTestId('edit-note')).toBeTruthy());
  });

  it('shows the raw SMS text and via SMS tag', async () => {
    mockUsePendingContext.mockReturnValue({
      data: [pendingTx({ id: 'p1', raw_text: 'Bank: deducted EGP 120' })],
      count: 1,
      loading: false,
      error: null,
      refresh: noopRefresh,
    });

    render(<PendingScreen />);

    expect(screen.getByText('Bank: deducted EGP 120')).toBeTruthy();
    expect(screen.getByText('via SMS')).toBeTruthy();
  });
});
