import type { Transaction, TxnType } from '../../types';
import { addMonth, currentMonthKey, monthRange, type MonthKey } from '../dashboard/monthRange';

/**
 * Pure helpers for the Statistics screen: turn a time-range preset into a
 * {from,to} query window, and bucket transactions into financial-month totals
 * for the trend chart. Kept free of React/UI so they're trivially unit-tested.
 */

export type RangeKey = '1m' | '3m' | '6m' | '1y' | 'all';

export interface RangePreset {
  key: RangeKey;
  /** Number of financial months the window spans, or null for "all time". */
  months: number | null;
}

export const RANGE_PRESETS: RangePreset[] = [
  { key: '1m', months: 1 },
  { key: '3m', months: 3 },
  { key: '6m', months: 6 },
  { key: '1y', months: 12 },
  { key: 'all', months: null },
];

/**
 * The {from,to} window (ISO-8601 UTC) for a preset, ending at the CURRENT
 * financial month and reaching back `months - 1` months. "all" → no bounds
 * (empty object), i.e. fetch everything.
 */
export function computeRange(
  preset: RangeKey,
  startDay: number,
  now: Date = new Date(),
): { from?: string; to?: string } {
  const p = RANGE_PRESETS.find((r) => r.key === preset) ?? RANGE_PRESETS[1];
  if (p.months == null) return {};
  const current = currentMonthKey(now, startDay);
  const start = addMonth(current, -(p.months - 1));
  return { from: monthRange(start, startDay).from, to: monthRange(current, startDay).to };
}

const keyStr = (k: MonthKey): string => `${k.year}-${k.month}`;

export interface MonthBucket {
  key: MonthKey;
  total: number;
}

/**
 * Sum CONFIRMED transactions of `type` into their financial month (per
 * `startDay`), returned oldest→newest with gaps zero-filled so the trend line
 * is continuous. Capped to the most recent `maxMonths` buckets for readability.
 */
export function monthlyBuckets(
  txns: Transaction[],
  startDay: number,
  type: TxnType,
  maxMonths = 12,
): MonthBucket[] {
  const totals = new Map<string, number>();
  const keys = new Map<string, MonthKey>();
  for (const tx of txns) {
    if (tx.status !== 'confirmed' || tx.type !== type) continue;
    const k = currentMonthKey(new Date(tx.occurred_at), startDay);
    const s = keyStr(k);
    keys.set(s, k);
    totals.set(s, (totals.get(s) ?? 0) + tx.amount);
  }
  if (totals.size === 0) return [];

  // Span from the earliest to the latest month present, zero-filling gaps.
  const present = Array.from(keys.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );
  const first = present[0];
  const last = present[present.length - 1];

  const out: MonthBucket[] = [];
  let cursor = first;
  // Guard against runaway loops on absurd data (e.g. 100+ years).
  for (let i = 0; i < 600; i++) {
    const s = keyStr(cursor);
    out.push({ key: cursor, total: totals.get(s) ?? 0 });
    if (cursor.year === last.year && cursor.month === last.month) break;
    cursor = addMonth(cursor, 1);
  }
  return out.slice(-maxMonths);
}

// Short month labels for the chart x-axis. Western/EN in both locales — the app
// already renders all digits/dates Western, and Arabic month names overflow a
// dense axis; category labels and titles stay fully localized elsewhere.
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function monthAbbr(key: MonthKey): string {
  return MONTH_ABBR[key.month] ?? '';
}
