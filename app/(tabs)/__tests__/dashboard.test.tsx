import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import Dashboard from '../index';
import type { Transaction } from '../../../src/types';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (cb: () => void) => { useEffect(() => { cb(); }, []); },
    useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }),
  };
});

// The PieChart depends on react-native-svg internals that aren't transformed in
// jest (not in transformIgnorePatterns). Stub it so the dashboard renders.
jest.mock('react-native-gifted-charts', () => ({ PieChart: () => null }));

// moti ships untransformed ESM (not in transformIgnorePatterns); stub MotiView
// to a plain View so the staggered reveal wrappers render children directly.
jest.mock('moti', () => {
  const { View } = require('react-native');
  return { MotiView: View };
});

// --- mock data hooks/session so the screen renders deterministically ---
jest.mock('../../../src/features/dashboard/useMonthSummary', () => ({
  useMonthSummary: jest.fn(),
}));
jest.mock('../../../src/features/accounts/useAccountBalances', () => ({
  useAccountBalances: jest.fn(),
}));
jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

import { useMonthSummary } from '../../../src/features/dashboard/useMonthSummary';
import { useAccountBalances } from '../../../src/features/accounts/useAccountBalances';
import { useSession } from '../../../src/features/auth/SessionProvider';

const mockSummary = useMonthSummary as jest.Mock;
const mockAccounts = useAccountBalances as jest.Mock;
const mockSession = useSession as jest.Mock;

const acctBal = (over: Record<string, unknown>) => ({
  id: 'a', user_id: 'u1', name: 'Main', opening_balance: 0,
  is_default: true, currency: 'EGP', created_at: '', balance: 0, ...over,
});

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
  mockSession.mockReturnValue({
    session: { user: { id: 'u1' } },
    user: { id: 'u1' },
    profile: { id: 'u1', locale: 'en', display_name: 'Test', currency: 'EGP' },
    loading: false,
  });
  mockAccounts.mockReturnValue({
    accounts: [],
    total: 0,
    loading: false,
    error: null,
    refresh: jest.fn(),
  });
  mockSummary.mockReturnValue({
    monthKey: { year: 2026, month: 5 },
    summary: {
      income: 1000,
      expense: 250,
      net: 750,
      expenseByCategory: [{ slug: 'food', total: 250 }],
      incomeByCategory: [{ slug: 'salary', total: 1000 }],
    },
    transactions: [
      tx({ id: 'a', type: 'income', amount: 1000, category_slug: 'salary', note: 'June pay' }),
      tx({ id: 'b', type: 'expense', amount: 250, category_slug: 'food', note: 'lunch' }),
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
    prevMonth: jest.fn(),
    nextMonth: jest.fn(),
  });
});

describe('Dashboard', () => {
  it('defaults to the expense view: spent total + expense-only breakdown', () => {
    render(<Dashboard />);
    // Hero now shows expenses, not net. (Net is gone entirely.)
    expect(screen.getByText('Spent this month')).toBeTruthy();
    expect(screen.queryByText('Net this month')).toBeNull();
    expect(screen.queryByText('Income this month')).toBeNull();
    // Hero integer = the expense total (250), split by the Hero component.
    expect(screen.getByText('250')).toBeTruthy();
    // By-category shows the expense category only; income (Salary) is not listed.
    expect(screen.getByText('Food & Drink')).toBeTruthy();
    expect(screen.queryByText('Salary')).toBeNull();
    // Recent still lists every transaction regardless of the view.
    expect(screen.getByText('lunch')).toBeTruthy();
    expect(screen.getByText('June pay')).toBeTruthy();
  });

  it('toggles to the income view (income total + income breakdown)', () => {
    render(<Dashboard />);
    fireEvent.press(screen.getByTestId('view-toggle-income'));
    expect(screen.getByText('Income this month')).toBeTruthy();
    // Hero integer = the income total (1,000).
    expect(screen.getByText('1,000')).toBeTruthy();
    // The income breakdown now lists Salary.
    expect(screen.getByText('Salary')).toBeTruthy();
  });

  it('renders the accounts card with each balance and a total', () => {
    mockAccounts.mockReturnValue({
      accounts: [
        acctBal({ id: 'a', name: 'Main', is_default: true, balance: 100000 }),
        acctBal({ id: 'b', name: 'Cash', is_default: false, balance: 250 }),
      ],
      total: 100250,
      loading: false,
      error: null,
      refresh: jest.fn(),
    });
    render(<Dashboard />);
    expect(screen.getByTestId('account-card-a')).toBeTruthy();
    expect(screen.getByTestId('account-card-b')).toBeTruthy();
    expect(screen.getByTestId('accounts-total')).toBeTruthy();
  });

  it('renders Arabic category labels when locale = ar', () => {
    mockSession.mockReturnValue({
      session: { user: { id: 'u1' } },
      user: { id: 'u1' },
      profile: { id: 'u1', locale: 'ar', display_name: 'Test', currency: 'EGP' },
      loading: false,
    });
    render(<Dashboard />);
    expect(screen.getByText('طعام وشراب')).toBeTruthy();
  });

  it('shows the empty state when there are no transactions', () => {
    mockSummary.mockReturnValue({
      monthKey: { year: 2026, month: 5 },
      summary: { income: 0, expense: 0, net: 0, expenseByCategory: [], incomeByCategory: [] },
      transactions: [],
      loading: false,
      error: null,
      refresh: jest.fn(),
      prevMonth: jest.fn(),
      nextMonth: jest.fn(),
    });
    render(<Dashboard />);
    // Redesigned empty state copy.
    expect(screen.getByText('No spending yet this month')).toBeTruthy();
  });

  it('calls refresh again on focus', () => {
    const refresh = jest.fn();
    mockSummary.mockReturnValue({
      monthKey: { year: 2026, month: 5 },
      summary: { income: 0, expense: 0, net: 0, expenseByCategory: [], incomeByCategory: [] },
      transactions: [],
      loading: false,
      error: null,
      refresh,
      prevMonth: jest.fn(),
      nextMonth: jest.fn(),
    });
    render(<Dashboard />);
    // useFocusEffect mock immediately invokes the callback, so refresh should
    // have been called at least once by the focus handler.
    expect(refresh).toHaveBeenCalled();
  });
});
