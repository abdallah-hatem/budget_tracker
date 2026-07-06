import { computeStats } from '../statsCompute';
import type { Transaction, TxnType } from '../../../types';

function tx(
  occurred_at: string,
  amount: number,
  category_slug: string,
  type: TxnType = 'expense',
  status: Transaction['status'] = 'confirmed',
): Transaction {
  return {
    id: occurred_at + amount + category_slug,
    user_id: 'u',
    type,
    amount,
    currency: 'EGP',
    category_slug,
    note: null,
    raw_text: null,
    source: 'sms',
    status,
    confidence: null,
    account_id: null,
    occurred_at,
    created_at: occurred_at,
  };
}

describe('computeStats', () => {
  const txns = [
    tx('2026-05-15T12:00:00Z', 100, 'food'),
    tx('2026-05-20T12:00:00Z', 300, 'food'),
    tx('2026-06-15T12:00:00Z', 50, 'transport'),
    tx('2026-07-15T12:00:00Z', 250, 'food'),
    tx('2026-07-16T12:00:00Z', 9999, 'salary', 'income'),
    tx('2026-07-17T12:00:00Z', 40, 'food', 'expense', 'pending'), // ignored
  ];

  it('aggregates the expense type across all categories', () => {
    const s = computeStats(txns, 'expense', 1);
    expect(s.total).toBe(700); // 100+300+50+250 (pending 40 ignored, income ignored)
    expect(s.count).toBe(4);
    expect(s.avgPerTxn).toBe(175);
    expect(s.biggest?.amount).toBe(300);
    expect(s.biggest?.slug).toBe('food');
    expect(s.months).toBe(3); // May, Jun, Jul
    expect(s.avgPerMonth).toBeCloseTo(700 / 3);
    expect(s.categoryCount).toBe(2); // food, transport
    expect(s.highest).toEqual({ slug: 'food', total: 650 });
    expect(s.lowest).toEqual({ slug: 'transport', total: 50 });
  });

  it('scopes to a single category (no highest/lowest)', () => {
    const s = computeStats(txns, 'expense', 1, 'food');
    expect(s.total).toBe(650);
    expect(s.count).toBe(3);
    expect(s.highest).toBeNull();
    expect(s.lowest).toBeNull();
    expect(s.biggest?.amount).toBe(300);
  });

  it('handles the income type', () => {
    const s = computeStats(txns, 'income', 1);
    expect(s.total).toBe(9999);
    expect(s.count).toBe(1);
    expect(s.highest).toEqual({ slug: 'salary', total: 9999 });
    expect(s.lowest).toBeNull(); // only one category
  });

  it('returns zeros for an empty set', () => {
    const s = computeStats([], 'expense', 1);
    expect(s.total).toBe(0);
    expect(s.count).toBe(0);
    expect(s.avgPerTxn).toBe(0);
    expect(s.biggest).toBeNull();
    expect(s.avgPerMonth).toBe(0);
  });
});
