import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

import { useMonthSummary } from '../../../src/features/dashboard/useMonthSummary';
import { useSession } from '../../../src/features/auth/SessionProvider';

const mockSummary = useMonthSummary as jest.Mock;
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
  mockSummary.mockReturnValue({
    monthKey: { year: 2026, month: 5 },
    summary: {
      income: 1000,
      expense: 250,
      net: 750,
      byCategory: [
        { slug: 'salary', total: 1000 },
        { slug: 'food', total: 250 },
      ],
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
  it('renders the net amount, totals, and bilingual category breakdown (en)', () => {
    render(<Dashboard />);
    // Net big number in the Hero. The label is uppercased via CSS only, so the
    // text node still reads "Net this month". The Hero splits the amount into
    // symbol / integer / decimals, so we assert on the integer + decimals parts.
    expect(screen.getByText('Net this month')).toBeTruthy();
    expect(screen.getByText('750')).toBeTruthy();
    expect(screen.getByText('.00')).toBeTruthy();
    // Income & expense totals, rendered via the Money component (E£ + grouping).
    // Each also appears in the by-category list, so use getAllByText.
    expect(screen.getAllByText('E£ 1,000.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('E£ 250.00').length).toBeGreaterThan(0);
    // By-category breakdown uses English labels (locale = en).
    expect(screen.getByText('Food & Drink')).toBeTruthy();
    expect(screen.getByText('Salary')).toBeTruthy();
    // Recent transactions show notes.
    expect(screen.getByText('lunch')).toBeTruthy();
    expect(screen.getByText('June pay')).toBeTruthy();
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
      summary: { income: 0, expense: 0, net: 0, byCategory: [] },
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
      summary: { income: 0, expense: 0, net: 0, byCategory: [] },
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
