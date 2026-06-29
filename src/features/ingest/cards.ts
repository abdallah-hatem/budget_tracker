import { supabase } from '../../lib/supabase';

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
