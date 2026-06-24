import { useCallback, useEffect, useState } from 'react';
import {
  listGoldHoldings,
  createGoldHolding,
  updateGoldHolding,
  deleteGoldHolding,
  fetchGoldPrice,
  type NewGoldHolding,
} from './api';
import { goldTotalValue, goldTotalGrams, type GoldHolding, type GoldPrices } from './value';

export interface UseGoldResult {
  holdings: GoldHolding[];
  prices: GoldPrices;
  /** ISO timestamp the price was fetched (for "as of …"), or null. */
  fetchedAt: string | null;
  /** True when the price is last-known (scrape failed) — value may be outdated. */
  stale: boolean;
  /** Total EGP value of all holdings (0 if no price yet). */
  goldValue: number;
  totalGrams: number;
  loading: boolean;
  /** True only when there are holdings but no usable price. */
  priceUnavailable: boolean;
  refresh: () => Promise<void>;
  add: (input: NewGoldHolding) => Promise<void>;
  update: (id: string, patch: { karat?: number; grams?: number; label?: string | null }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Loads gold holdings + the live price, and exposes CRUD + computed totals. */
export function useGold(): UseGoldResult {
  const [holdings, setHoldings] = useState<GoldHolding[]>([]);
  const [prices, setPrices] = useState<GoldPrices>({});
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadHoldings = useCallback(async () => {
    try {
      setHoldings(await listGoldHoldings());
    } catch {
      /* leave previous */
    }
  }, []);

  const loadPrice = useCallback(async () => {
    try {
      const p = await fetchGoldPrice();
      setPrices(p.prices);
      setFetchedAt(p.fetchedAt);
      setStale(p.stale);
    } catch {
      // Price unavailable — holdings still usable, just no value.
      setStale(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadHoldings(), loadPrice()]);
    setLoading(false);
  }, [loadHoldings, loadPrice]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(async (input: NewGoldHolding) => {
    await createGoldHolding(input);
    await loadHoldings();
  }, [loadHoldings]);

  const update = useCallback(async (id: string, patch: { karat?: number; grams?: number; label?: string | null }) => {
    await updateGoldHolding(id, patch);
    await loadHoldings();
  }, [loadHoldings]);

  const remove = useCallback(async (id: string) => {
    await deleteGoldHolding(id);
    await loadHoldings();
  }, [loadHoldings]);

  const goldValue = goldTotalValue(holdings, prices);
  const hasPrice = Object.keys(prices).length > 0;

  return {
    holdings,
    prices,
    fetchedAt,
    stale,
    goldValue,
    totalGrams: goldTotalGrams(holdings),
    loading,
    priceUnavailable: holdings.length > 0 && !hasPrice,
    refresh,
    add,
    update,
    remove,
  };
}
