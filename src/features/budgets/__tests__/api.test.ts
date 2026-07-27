const mockFrom = jest.fn();
const mockGetUser = jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }));
jest.mock('@/src/lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a), auth: { getUser: () => mockGetUser() } },
}));

import { listBudgets, createBudget, updateBudget, deleteBudget } from '../api';

describe('budgets api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists budgets', async () => {
    const order = jest.fn(() => Promise.resolve({ data: [{ id: 'b1' }], error: null }));
    mockFrom.mockReturnValue({ select: jest.fn(() => ({ order })) });
    await expect(listBudgets()).resolves.toEqual([{ id: 'b1' }]);
    expect(mockFrom).toHaveBeenCalledWith('budgets');
  });

  it('throws the supabase error on failure', async () => {
    const order = jest.fn(() => Promise.resolve({ data: null, error: { message: 'nope' } }));
    mockFrom.mockReturnValue({ select: jest.fn(() => ({ order })) });
    await expect(listBudgets()).rejects.toThrow('nope');
  });

  it('creates a budget and returns the row', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    const single = jest.fn(() => Promise.resolve({ data: { id: 'new' }, error: null }));
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn((_row: unknown) => ({ select }));
    mockFrom.mockReturnValue({ insert });
    const out = await createBudget({
      scope: 'category', category_slug: 'food', period: 'monthly', amount: 500, warn_pct: 80,
    });
    expect(out).toEqual({ id: 'new' });
    expect(insert).toHaveBeenCalled();
    expect(insert.mock.calls[0][0]).toMatchObject({
      scope: 'category', category_slug: 'food', period: 'monthly', amount: 500, warn_pct: 80, user_id: 'u1',
    });
  });

  it('updates a budget and returns the row', async () => {
    const single = jest.fn(() => Promise.resolve({ data: { id: 'b1', amount: 700 }, error: null }));
    const select = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select }));
    const update = jest.fn((_patch: unknown) => ({ eq }));
    mockFrom.mockReturnValue({ update });
    const out = await updateBudget('b1', { amount: 700 });
    expect(out).toEqual({ id: 'b1', amount: 700 });
    expect(mockFrom).toHaveBeenCalledWith('budgets');
    expect(update.mock.calls[0][0]).toMatchObject({ amount: 700 });
    expect(eq).toHaveBeenCalledWith('id', 'b1');
  });

  it('throws the supabase error on update failure', async () => {
    const single = jest.fn(() => Promise.resolve({ data: null, error: { message: 'update nope' } }));
    const select = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ update: jest.fn(() => ({ eq })) });
    await expect(updateBudget('b1', { amount: 700 })).rejects.toThrow('update nope');
  });

  it('deletes by id', async () => {
    const eq = jest.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockReturnValue({ delete: jest.fn(() => ({ eq })) });
    await deleteBudget('b1');
    expect(eq).toHaveBeenCalledWith('id', 'b1');
  });
});
