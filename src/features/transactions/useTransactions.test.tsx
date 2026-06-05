import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useTransactions, type UseTransactionsResult } from './useTransactions';
import type { Transaction } from '../../types';

// Mock the M5 api module: useTransactions must call listTransactions only.
jest.mock('./api', () => ({
  listTransactions: jest.fn(),
}));
import { listTransactions } from './api';
const mockList = listTransactions as jest.MockedFunction<typeof listTransactions>;

function tx(id: string): Transaction {
  return {
    id,
    user_id: 'u1',
    type: 'expense',
    amount: 10,
    currency: 'EGP',
    category_slug: 'food',
    note: null,
    raw_text: null,
    source: 'text',
    status: 'confirmed',
    confidence: null,
    occurred_at: '2026-06-01T10:00:00.000Z',
    account_id: null,
    created_at: '2026-06-01T10:00:00.000Z',
  };
}

describe('useTransactions', () => {
  beforeEach(() => mockList.mockReset());

  it('starts loading, then resolves with data', async () => {
    mockList.mockResolvedValueOnce([tx('a'), tx('b')]);
    const filter = { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' };

    const { result } = renderHook(() => useTransactions(filter));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.map((t) => t.id)).toEqual(['a', 'b']);
    expect(mockList).toHaveBeenCalledWith(filter);
  });

  it('refetches when the filter changes', async () => {
    mockList.mockResolvedValue([tx('a')]);
    const { result, rerender } = renderHook<UseTransactionsResult, { f: { category_slug: string } }>(
      ({ f }) => useTransactions(f),
      { initialProps: { f: { category_slug: 'food' } } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(1);

    rerender({ f: { category_slug: 'transport' } as const });
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList).toHaveBeenLastCalledWith({ category_slug: 'transport' });
  });

  it('refresh() re-invokes listTransactions', async () => {
    mockList.mockResolvedValue([tx('a')]);
    const { result } = renderHook(() => useTransactions({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
