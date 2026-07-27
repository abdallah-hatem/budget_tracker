const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockEq = jest.fn(() => Promise.resolve({ error: null }));
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ update: mockUpdate })),
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })) },
  },
}));

import { syncMonthStartDay } from '../MonthStartProvider';

describe('syncMonthStartDay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the day to the profile row', async () => {
    await syncMonthStartDay(15);
    expect(mockUpdate).toHaveBeenCalledWith({ month_start_day: 15 });
    expect(mockEq).toHaveBeenCalledWith('id', 'u1');
  });

  it('never throws when the write fails', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'offline' } } as never);
    await expect(syncMonthStartDay(3)).resolves.toBeUndefined();
  });

  it('never throws when the underlying call rejects', async () => {
    const { supabase } = jest.requireMock('@/src/lib/supabase') as {
      supabase: { auth: { getUser: jest.Mock } };
    };
    supabase.auth.getUser.mockRejectedValueOnce(new Error('network down'));
    await expect(syncMonthStartDay(5)).resolves.toBeUndefined();
  });
});
