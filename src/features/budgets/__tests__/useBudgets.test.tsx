import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useBudgets } from '../useBudgets';
import type { Budget } from '../types';

// C1 regression coverage:
//  1. the transaction filter useBudgets builds must have NO `to` upper bound
//     (a `to` bound made expenses recorded after mount invisible to the
//     dashboard budget card until a full app restart — see api.ts
//     `listTransactions`, which applies `to` as `.lt('occurred_at', to)`).
//  2. refresh() must also refresh transactions, not just reload budgets —
//     otherwise recording a new expense and returning to the dashboard never
//     updates the budget bar.

jest.mock('../api', () => ({
  listBudgets: jest.fn(),
}));
import { listBudgets } from '../api';
const mockListBudgets = listBudgets as jest.MockedFunction<typeof listBudgets>;

const mockRefreshTxns = jest.fn().mockResolvedValue(undefined);
jest.mock('@/src/features/transactions/useTransactions', () => ({
  useTransactions: jest.fn(),
}));
import { useTransactions } from '@/src/features/transactions/useTransactions';
const mockUseTransactions = useTransactions as jest.Mock;

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: over.id ?? 'b1',
    user_id: 'u1',
    scope: over.scope ?? 'overall',
    category_slug: over.category_slug ?? null,
    period: over.period ?? 'monthly',
    amount: over.amount ?? 1000,
    warn_pct: over.warn_pct ?? 80,
  };
}

beforeEach(() => {
  mockListBudgets.mockReset().mockResolvedValue([budget()]);
  mockRefreshTxns.mockClear().mockResolvedValue(undefined);
  mockUseTransactions.mockReset().mockReturnValue({
    data: [],
    loading: false,
    error: null,
    refresh: mockRefreshTxns,
  });
});

describe('useBudgets', () => {
  it('builds a transaction filter with a `from` bound but NO `to` bound', async () => {
    const { result } = renderHook(() => useBudgets());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockUseTransactions).toHaveBeenCalled();
    const filterArg = mockUseTransactions.mock.calls[0][0];
    expect(filterArg).toHaveProperty('from');
    expect(filterArg).toHaveProperty('status', 'confirmed');
    expect(filterArg).not.toHaveProperty('to');
    expect('to' in filterArg).toBe(false);
  });

  it('refresh() re-fetches transactions (not just budgets)', async () => {
    const { result } = renderHook(() => useBudgets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockListBudgets.mockClear();
    mockRefreshTxns.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockListBudgets).toHaveBeenCalledTimes(1);
    // The critical assertion: refresh() must call the transactions hook's own
    // refresh — a bare re-read of BUDGETS alone would leave `refresh()`
    // calling only listBudgets, which is exactly the bug being fixed.
    expect(mockRefreshTxns).toHaveBeenCalledTimes(1);
  });
});
