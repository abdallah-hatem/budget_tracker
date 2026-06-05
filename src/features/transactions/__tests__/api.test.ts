import { insertTransaction, updateTransaction, deleteTransaction, listTransactions } from '../api';
import { supabase } from '../../../lib/supabase';
import type { NewTransaction, Transaction } from '../../../types';

jest.mock('../../../lib/supabase', () => {
  return { supabase: { from: jest.fn() } };
});

const mockedFrom = supabase.from as unknown as jest.Mock;

const sampleRow: Transaction = {
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
  account_id: null,
  created_at: '2026-06-02T10:00:01.000Z',
};

const newRow: NewTransaction = {
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
};

afterEach(() => jest.clearAllMocks());

describe('insertTransaction', () => {
  it('inserts and returns the created row', async () => {
    const single = jest.fn().mockResolvedValue({ data: sampleRow, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockedFrom.mockReturnValue({ insert });

    const result = await insertTransaction(newRow);

    expect(mockedFrom).toHaveBeenCalledWith('transactions');
    expect(insert).toHaveBeenCalledWith(newRow);
    expect(select).toHaveBeenCalled();
    expect(result).toEqual(sampleRow);
  });

  it('throws when supabase returns an error', async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockedFrom.mockReturnValue({ insert });

    await expect(insertTransaction(newRow)).rejects.toThrow('boom');
  });
});

describe('updateTransaction', () => {
  it('updates by id and returns the row', async () => {
    const single = jest.fn().mockResolvedValue({ data: sampleRow, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    mockedFrom.mockReturnValue({ update });

    const result = await updateTransaction('txn-1', { note: 'tea' });

    expect(update).toHaveBeenCalledWith({ note: 'tea' });
    expect(eq).toHaveBeenCalledWith('id', 'txn-1');
    expect(result).toEqual(sampleRow);
  });

  it('throws on error', async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { message: 'no row' } });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    mockedFrom.mockReturnValue({ update });

    await expect(updateTransaction('txn-1', { note: 'tea' })).rejects.toThrow('no row');
  });
});

describe('deleteTransaction', () => {
  it('deletes by id', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    mockedFrom.mockReturnValue({ delete: del });

    await deleteTransaction('txn-1');

    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'txn-1');
  });

  it('throws on error', async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: 'denied' } });
    const del = jest.fn().mockReturnValue({ eq });
    mockedFrom.mockReturnValue({ delete: del });

    await expect(deleteTransaction('txn-1')).rejects.toThrow('denied');
  });
});

describe('listTransactions', () => {
  it('orders by occurred_at desc with no filter', async () => {
    const order = jest.fn().mockResolvedValue({ data: [sampleRow], error: null });
    const select = jest.fn().mockReturnValue({ order });
    mockedFrom.mockReturnValue({ select });

    const result = await listTransactions({});

    expect(mockedFrom).toHaveBeenCalledWith('transactions');
    expect(select).toHaveBeenCalledWith('*');
    expect(order).toHaveBeenCalledWith('occurred_at', { ascending: false });
    expect(result).toEqual([sampleRow]);
  });

  it('applies category_slug, status, from and to filters in order', async () => {
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const lt = jest.fn().mockReturnValue({ order });
    const gte = jest.fn().mockReturnValue({ lt });
    const eqStatus = jest.fn().mockReturnValue({ gte });
    const eqCat = jest.fn().mockReturnValue({ eq: eqStatus });
    const select = jest.fn().mockReturnValue({ eq: eqCat });
    mockedFrom.mockReturnValue({ select });

    await listTransactions({
      category_slug: 'food',
      status: 'confirmed',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
    });

    expect(eqCat).toHaveBeenCalledWith('category_slug', 'food');
    expect(eqStatus).toHaveBeenCalledWith('status', 'confirmed');
    expect(gte).toHaveBeenCalledWith('occurred_at', '2026-06-01T00:00:00.000Z');
    expect(lt).toHaveBeenCalledWith('occurred_at', '2026-07-01T00:00:00.000Z');
  });

  it('throws on error', async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'rls' } });
    const select = jest.fn().mockReturnValue({ order });
    mockedFrom.mockReturnValue({ select });

    await expect(listTransactions({})).rejects.toThrow('rls');
  });
});
