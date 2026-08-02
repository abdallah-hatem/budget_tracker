import { computeRange, monthlyBuckets, monthAbbr } from '../statsRanges';
import type { Transaction, TxnType } from '../../../types';

// Mid-month, midday UTC → the local financial month is unambiguous in any tz.
function tx(
  occurred_at: string,
  amount: number,
  type: TxnType = 'expense',
  status: Transaction['status'] = 'confirmed',
  is_internal_transfer = false,
): Transaction {
  return {
    id: occurred_at + amount,
    user_id: 'u',
    type,
    amount,
    currency: 'EGP',
    category_slug: 'food',
    note: null,
    raw_text: null,
    source: 'sms',
    status,
    confidence: null,
    account_id: null,
    is_internal_transfer,
    occurred_at,
    created_at: occurred_at,
  };
}

describe('computeRange', () => {
  const now = new Date('2026-07-15T12:00:00Z');

  it('"all" returns no bounds', () => {
    expect(computeRange('all', 1, now)).toEqual({});
  });

  it('bounded presets return from < to', () => {
    const r = computeRange('1m', 1, now);
    expect(r.from).toBeTruthy();
    expect(r.to).toBeTruthy();
    expect(new Date(r.from!).getTime()).toBeLessThan(new Date(r.to!).getTime());
  });

  it('longer windows reach further back (same end)', () => {
    const m1 = computeRange('1m', 1, now);
    const m3 = computeRange('3m', 1, now);
    const m6 = computeRange('6m', 1, now);
    const y1 = computeRange('1y', 1, now);
    // Same upper bound (current financial month end).
    expect(m3.to).toBe(m1.to);
    expect(y1.to).toBe(m1.to);
    // Each longer window starts earlier.
    expect(new Date(m3.from!).getTime()).toBeLessThan(new Date(m1.from!).getTime());
    expect(new Date(m6.from!).getTime()).toBeLessThan(new Date(m3.from!).getTime());
    expect(new Date(y1.from!).getTime()).toBeLessThan(new Date(m6.from!).getTime());
  });
});

describe('monthlyBuckets', () => {
  it('buckets by month and zero-fills the gap', () => {
    const txns = [
      tx('2026-05-15T12:00:00Z', 100),
      tx('2026-05-20T12:00:00Z', 50),
      tx('2026-07-15T12:00:00Z', 300),
    ];
    const b = monthlyBuckets(txns, 1, 'expense');
    // May, Jun (zero-filled), Jul
    expect(b.length).toBe(3);
    expect(b[0].total).toBe(150);
    expect(b[1].total).toBe(0);
    expect(b[2].total).toBe(300);
    expect(b[0].key.month).toBe(4); // May (0-indexed)
    expect(b[2].key.month).toBe(6); // July
  });

  it('ignores the other type and non-confirmed rows', () => {
    const txns = [
      tx('2026-07-15T12:00:00Z', 300, 'expense'),
      tx('2026-07-16T12:00:00Z', 999, 'income'),
      tx('2026-07-17T12:00:00Z', 40, 'expense', 'pending'),
    ];
    const b = monthlyBuckets(txns, 1, 'expense');
    expect(b.length).toBe(1);
    expect(b[0].total).toBe(300);
  });

  it('ignores internal transfer rows', () => {
    const b = monthlyBuckets([
      tx('2026-07-15T12:00:00Z', 2202, 'expense', 'confirmed', true),
      tx('2026-07-16T12:00:00Z', 80),
    ], 1, 'expense');
    expect(b).toHaveLength(1);
    expect(b[0].total).toBe(80);
  });

  it('returns empty when nothing matches', () => {
    expect(monthlyBuckets([], 1, 'expense')).toEqual([]);
  });

  it('caps to the most recent N buckets', () => {
    const txns = Array.from({ length: 18 }, (_, i) => {
      const month = (i % 12) + 1;
      const year = 2025 + Math.floor(i / 12);
      const mm = String(month).padStart(2, '0');
      return tx(`${year}-${mm}-15T12:00:00Z`, 10);
    });
    const b = monthlyBuckets(txns, 1, 'expense', 12);
    expect(b.length).toBe(12);
  });
});

describe('monthAbbr', () => {
  it('maps 0-indexed months to short names', () => {
    expect(monthAbbr({ year: 2026, month: 0 })).toBe('Jan');
    expect(monthAbbr({ year: 2026, month: 6 })).toBe('Jul');
    expect(monthAbbr({ year: 2026, month: 11 })).toBe('Dec');
  });
});
