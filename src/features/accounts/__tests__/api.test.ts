import {
  listAccountBalances,
  createAccount,
  updateAccount,
  setDefaultAccount,
  deleteAccount,
} from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn(), auth: { getUser: jest.fn() } },
}));
const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;
const mockFrom = supabase.from as unknown as jest.Mock;
const mockGetUser = supabase.auth.getUser as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('listAccountBalances', () => {
  it('selects from account_balances ordered default-first then created_at', async () => {
    const order2 = jest.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    const select = jest.fn().mockReturnValue({ order: order1 });
    mockFrom.mockReturnValue({ select });

    const res = await listAccountBalances();

    expect(mockFrom).toHaveBeenCalledWith('account_balances');
    expect(order1).toHaveBeenCalledWith('is_default', { ascending: false });
    expect(order2).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(res).toEqual([{ id: 'a' }]);
  });

  it('throws on error', async () => {
    const order2 = jest.fn().mockResolvedValue({ data: null, error: { message: 'rls' } });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    const select = jest.fn().mockReturnValue({ order: order1 });
    mockFrom.mockReturnValue({ select });

    await expect(listAccountBalances()).rejects.toThrow('rls');
  });
});

describe('createAccount', () => {
  function mockInsertReturning(row: unknown) {
    const single = jest.fn().mockResolvedValue({ data: row, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockFrom.mockReturnValue({ insert });
    return insert;
  }

  it('inserts is_default false and does NOT flip when make-default is off', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const insert = mockInsertReturning({ id: 'new' });

    const res = await createAccount({ name: 'Bank', opening_balance: 100000, is_default: false });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'u1',
      name: 'Bank',
      opening_balance: 100000,
      is_default: false,
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 'new' });
  });

  it('flips default via RPC when make-default is on', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const insert = mockInsertReturning({ id: 'new' });
    mockRpc.mockResolvedValue({ data: null, error: null } as any);

    await createAccount({ name: 'Bank', opening_balance: 0, is_default: true });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_default: false }));
    expect(mockRpc).toHaveBeenCalledWith('set_default_account', { target: 'new' });
  });

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(
      createAccount({ name: 'X', opening_balance: 0, is_default: false }),
    ).rejects.toThrow('Not authenticated');
  });
});

describe('setDefaultAccount', () => {
  it('calls the set_default_account RPC with target', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any);
    await setDefaultAccount('acc-9');
    expect(mockRpc).toHaveBeenCalledWith('set_default_account', { target: 'acc-9' });
  });

  it('throws on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'denied' } } as any);
    await expect(setDefaultAccount('acc-9')).rejects.toThrow('denied');
  });
});

describe('updateAccount', () => {
  it('updates the row by id and returns it', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'a', name: 'New' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ update });

    const res = await updateAccount('a', { name: 'New' });

    expect(update).toHaveBeenCalledWith({ name: 'New' });
    expect(eq).toHaveBeenCalledWith('id', 'a');
    expect(res).toEqual({ id: 'a', name: 'New' });
  });
});

describe('deleteAccount', () => {
  it('deletes by id', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ delete: del });

    await deleteAccount('a');

    expect(mockFrom).toHaveBeenCalledWith('accounts');
    expect(eq).toHaveBeenCalledWith('id', 'a');
  });

  it('throws on error', async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: 'fk' } });
    const del = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ delete: del });

    await expect(deleteAccount('a')).rejects.toThrow('fk');
  });
});
