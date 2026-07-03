import { supabase } from '../../lib/supabase';
import { fingerprintFromDigits } from './smsDetect';

// Client API for auto-detected Cards (see migration 0018). RLS scopes every
// query to the signed-in user, so no explicit user_id filter is needed.

export interface DetectedCard {
  id: string;
  fingerprint: string;
  label: string | null;
  enabled: boolean;
  last_seen_at: string | null;
  txn_count: number;
  created_at: string;
}

/** List the user's detected cards, most-recently-seen first. */
export async function listDetectedCards(): Promise<DetectedCard[]> {
  const { data, error } = await supabase
    .from('detected_cards')
    .select('id, fingerprint, label, enabled, last_seen_at, txn_count, created_at')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DetectedCard[];
}

/** Enable or disable a card. Disabled → its future messages are discarded. */
export async function setCardEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('detected_cards')
    .update({ enabled })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Rename a card's display label. */
export async function renameCard(id: string, label: string): Promise<void> {
  const { error } = await supabase
    .from('detected_cards')
    .update({ label })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Delete a card. Its past transactions keep their history (card_id → null). */
export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('detected_cards').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Manually add a card by its last-4 digits, so its messages capture immediately
 * (or so you can pre-disable a card you don't want). The fingerprint comes from
 * the SAME `fingerprintFromDigits` the message parser uses, so a typed card and
 * its future bank messages resolve to one row. Upserts on (user_id, fingerprint):
 * re-adding an existing card just refreshes its label (never a duplicate, and it
 * leaves the card's enabled state untouched).
 *
 * `digits` may be entered with spaces/dashes; only the last 4 digits are used.
 * Throws if fewer than 4 digits are supplied.
 */
export async function addManualCard(digits: string, label?: string): Promise<void> {
  const clean = digits.replace(/\D/g, '');
  if (clean.length < 4) throw new Error('need at least 4 digits');
  const { fingerprint, last4 } = fingerprintFromDigits(clean);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error('not signed in');

  const { error } = await supabase.from('detected_cards').upsert(
    { user_id: userId, fingerprint, label: label?.trim() || `•••• ${last4}` },
    { onConflict: 'user_id,fingerprint' },
  );
  if (error) throw new Error(error.message);
}
