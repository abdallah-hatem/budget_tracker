import { createIngestToken, revokeIngestTokens, hasActiveIngestToken } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;
const mockFrom = supabase.from as unknown as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('createIngestToken', () => {
  it('calls rpc create_ingest_token and returns the token string', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'raw-token-abc123', error: null } as any);

    const result = await createIngestToken();

    expect(mockRpc).toHaveBeenCalledWith('create_ingest_token');
    expect(result).toBe('raw-token-abc123');
  });

  it('throws when supabase rpc returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } } as any);

    await expect(createIngestToken()).rejects.toThrow('rpc failed');
  });
});

describe('revokeIngestTokens', () => {
  it('calls rpc revoke_ingest_tokens', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null } as any);

    await revokeIngestTokens();

    expect(mockRpc).toHaveBeenCalledWith('revoke_ingest_tokens');
  });

  it('throws when supabase rpc returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'revoke failed' } } as any);

    await expect(revokeIngestTokens()).rejects.toThrow('revoke failed');
  });
});

describe('hasActiveIngestToken', () => {
  it('returns true when at least one non-revoked token exists', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [{ id: 'tok-1' }], error: null });
    const eq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await hasActiveIngestToken();

    expect(mockFrom).toHaveBeenCalledWith('ingest_tokens');
    expect(select).toHaveBeenCalledWith('id');
    expect(eq).toHaveBeenCalledWith('revoked', false);
    expect(limit).toHaveBeenCalledWith(1);
    expect(result).toBe(true);
  });

  it('returns false when no non-revoked tokens exist', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [], error: null });
    const eq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const result = await hasActiveIngestToken();

    expect(result).toBe(false);
  });

  it('throws when supabase returns an error', async () => {
    const limit = jest.fn().mockResolvedValue({ data: null, error: { message: 'rls denied' } });
    const eq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    await expect(hasActiveIngestToken()).rejects.toThrow('rls denied');
  });
});
