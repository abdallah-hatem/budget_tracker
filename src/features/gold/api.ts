import { supabase } from '../../lib/supabase';
import type { GoldHolding, GoldPrices } from './value';

export interface NewGoldHolding {
  karat: number;
  grams: number;
  label?: string | null;
}

/** All of the current user's gold holdings, newest first. */
export async function listGoldHoldings(): Promise<GoldHolding[]> {
  const { data, error } = await supabase
    .from('gold_holdings')
    .select('id, karat, grams, label')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoldHolding[];
}

export async function createGoldHolding(input: NewGoldHolding): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { error } = await supabase.from('gold_holdings').insert({
    user_id: userId,
    karat: input.karat,
    grams: input.grams,
    label: input.label ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateGoldHolding(
  id: string,
  patch: { karat?: number; grams?: number; label?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('gold_holdings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGoldHolding(id: string): Promise<void> {
  const { error } = await supabase.from('gold_holdings').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface GoldPriceResult {
  prices: GoldPrices;
  fetchedAt: string | null;
  stale: boolean;
}

/** Fetch the live local gold price via the cached `gold-price` edge function. */
export async function fetchGoldPrice(): Promise<GoldPriceResult> {
  const { data, error } = await supabase.functions.invoke('gold-price', { body: {} });
  if (error) throw new Error(error.message);
  const d = data as { prices?: GoldPrices; fetched_at?: string; stale?: boolean };
  return {
    prices: d.prices ?? {},
    fetchedAt: d.fetched_at ?? null,
    stale: Boolean(d.stale),
  };
}
