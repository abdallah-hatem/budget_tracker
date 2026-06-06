import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';

// The raw ingest token is mirrored into the Keychain so the native "Log SMS to
// Masareef" App Intent can read it (no manual paste). The App Intent's Swift
// read is coupled to these exact values — keep them in sync (it queries service
// "<KEYCHAIN_SERVICE>:no-auth", account = bytes of TOKEN_KEY; see
// plugins/MasareefSmsIntent.swift).
const TOKEN_KEY = 'ingestToken';
const KEYCHAIN_SERVICE = 'masareef';
const SECURE_OPTS = { keychainService: KEYCHAIN_SERVICE };

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

// --- Keychain mirror for the App Intent -----------------------------------

/** Save the raw token to the Keychain (readable in the background after first unlock). */
export async function storeIngestToken(raw: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, raw, {
    ...SECURE_OPTS,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

/** Remove the locally-stored token (e.g. on revoke). */
export async function clearStoredIngestToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_OPTS);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Ensure a token exists locally so the App Intent can post SMS without the user
 * generating/pasting anything. Creates one ONLY if none is stored on this device
 * (create_ingest_token revokes prior tokens, so we must not call it every launch).
 * Best-effort — never throws.
 */
export async function ensureIngestToken(): Promise<void> {
  try {
    const existing = await SecureStore.getItemAsync(TOKEN_KEY, SECURE_OPTS);
    if (existing) return;
    const raw = await createIngestToken();
    await storeIngestToken(raw);
  } catch {
    /* offline / not signed in — try again next launch */
  }
}
