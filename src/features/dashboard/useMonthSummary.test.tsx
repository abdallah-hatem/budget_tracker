import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useMonthSummary } from './useMonthSummary';
import type { Transaction } from '../../types';

jest.mock('../transactions/api', () => ({
  listTransactions: jest.fn(),
}));
import { listTransactions } from '../transactions/api';
const mockList = listTransactions as jest.MockedFunction<typeof listTransactions>;

// monthRange bounds are LOCAL midnight as a UTC instant — build expectations the
// same way so the test is timezone-independent.
const localMidnight = (y: number, m: number, d: number) => new Date(y, m, d).toISOString();

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: over.id ?? 'id',
    user_id: 'u1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 0,
    currency: 'EGP',
    category_slug: over.category_slug ?? 'food',
    note: null,
    raw_text: null,
    source: 'text',
    status: 'confirmed',
    confidence: null,
    occurred_at: over.occurred_at ?? '2026-06-10T00:00:00.000Z',
    account_id: null,
    created_at: '2026-06-10T00:00:00.000Z',
  };
}

describe('useMonthSummary', () => {
  beforeEach(() => mockList.mockReset());

  it('summarizes the loaded month and requests a confirmed-only month range', async () => {
    mockList.mockResolvedValueOnce([
      tx({ id: 'a', type: 'income', amount: 1000, category_slug: 'salary' }),
      tx({ id: 'b', type: 'expense', amount: 250, category_slug: 'food' }),
    ]);

    const { result } = renderHook(() =>
      useMonthSummary({ year: 2026, month: 5 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toEqual({
      income: 1000,
      expense: 250,
      net: 750,
      expenseByCategory: [{ slug: 'food', total: 250 }],
      incomeByCategory: [{ slug: 'salary', total: 1000 }],
    });
    // Confirmed-only, June 2026 half-open range at LOCAL midnight.
    expect(mockList).toHaveBeenCalledWith({
      from: localMidnight(2026, 5, 1),
      to: localMidnight(2026, 6, 1),
      status: 'confirmed',
    });
  });

  it('navigates to the previous month and re-queries', async () => {
    mockList.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useMonthSummary({ year: 2026, month: 5 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.prevMonth());

    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        from: localMidnight(2026, 4, 1),
        to: localMidnight(2026, 5, 1),
        status: 'confirmed',
      })
    );
    expect(result.current.monthKey).toEqual({ year: 2026, month: 4 });
  });
});
