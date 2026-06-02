import { supabase } from '../../lib/supabase';

/**
 * Calls the `create_ingest_token` RPC which revokes all existing tokens for the
 * current user, generates a fresh 32-byte random token, stores its sha256 hash,
 * and returns the raw token (shown to the user exactly once).
 */
export async function createIngestToken(): Promise<string> {
  const { data, error } = await supabase.rpc('create_ingest_token');
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Revokes all active ingest tokens for the current user.
 */
export async function revokeIngestTokens(): Promise<void> {
  const { error } = await supabase.rpc('revoke_ingest_tokens');
  if (error) throw new Error(error.message);
}

/**
 * Returns true if the current user has at least one active (non-revoked)
 * ingest token. RLS scopes the query to the signed-in user.
 */
export async function hasActiveIngestToken(): Promise<boolean> {
  const { data, error } = await supabase
    .from('ingest_tokens')
    .select('id')
    .eq('revoked', false)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
