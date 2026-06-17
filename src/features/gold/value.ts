// Pure gold valuation — no I/O, fully testable. Prices are EGP per gram by karat
// (string keys "24"/"21"/"18", from the gold-price edge function).

export const GOLD_KARATS = [24, 21, 18] as const;
export type Karat = (typeof GOLD_KARATS)[number];

export interface GoldHolding {
  id: string;
  karat: number;
  grams: number;
  label: string | null;
}

export type GoldPrices = Record<string, number>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** EGP value of one holding (0 if its karat has no price). */
export function holdingValue(h: { grams: number; karat: number }, prices: GoldPrices): number {
  const p = prices[String(h.karat)];
  if (typeof p !== 'number' || !Number.isFinite(p)) return 0;
  return round2(h.grams * p);
}

/** Total EGP value across all holdings. */
export function goldTotalValue(holdings: { grams: number; karat: number }[], prices: GoldPrices): number {
  return round2(holdings.reduce((sum, h) => sum + holdingValue(h, prices), 0));
}

/** Total grams across all holdings (regardless of karat). */
export function goldTotalGrams(holdings: { grams: number }[]): number {
  return Math.round(holdings.reduce((sum, h) => sum + h.grams, 0) * 1000) / 1000;
}

/** Net worth = cash accounts total + gold total. */
export function netWorth(accountsTotal: number, goldTotal: number): number {
  return round2(accountsTotal + goldTotal);
}
