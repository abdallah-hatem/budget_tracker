import { renderHook, waitFor, act } from '@testing-library/react-native';
import { usePending } from './usePending';
import type { Transaction } from '../../types';

jest.mock('./api', () => ({
  listTransactions: jest.fn(),
}));
import { listTransactions } from './api';
const mockList = listTransactions as jest.MockedFunction<typeof listTransactions>;

function pendingTx(id: string): Transaction {
  return {
    id,
    user_id: 'u1',
    type: 'expense',
    amount: 100,
    currency: 'EGP',
    category_slug: 'food',
    note: 'lunch',
    raw_text: 'Bank: deducted EGP 100',
    source: 'sms',
    status: 'pending',
    confidence: 0.9,
    occurred_at: '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:01.000Z',
  };
}

describe('usePending', () => {
  beforeEach(() => mockList.mockReset());

  it('calls listTransactions with { status: "pending" }', async () => {
    mockList.mockResolvedValueOnce([pendingTx('p1'), pendingTx('p2')]);

    const { result } = renderHook(() => usePending());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockList).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('exposes count equal to data.length', async () => {
    mockList.mockResolvedValueOnce([pendingTx('p1'), pendingTx('p2'), pendingTx('p3')]);

    const { result } = renderHook(() => usePending());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toHaveLength(3);
    expect(result.current.count).toBe(3);
  });

  it('count is 0 when no pending transactions', async () => {
    mockList.mockResolvedValueOnce([]);

    const { result } = renderHook(() => usePending());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(0);
  });

  it('refresh() re-fetches pending transactions', async () => {
    mockList.mockResolvedValue([pendingTx('p1')]);

    const { result } = renderHook(() => usePending());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList).toHaveBeenLastCalledWith({ status: 'pending' });
  });

  it('sets error and empty data when listTransactions rejects', async () => {
    mockList.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => usePending());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error?.message).toBe('network error');
    expect(result.current.data).toHaveLength(0);
    expect(result.current.count).toBe(0);
  });
});
