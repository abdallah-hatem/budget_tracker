import { summarize } from './summary';
import type { Transaction } from '../../types';

// Minimal factory so tests stay readable. Only fields summarize() reads matter,
// the rest satisfy the Transaction type.
function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 'id-1',
    user_id: 'u1',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 0,
    currency: 'EGP',
    category_slug: overrides.category_slug ?? 'food',
    note: overrides.note ?? null,
    raw_text: null,
    source: 'text',
    status: overrides.status ?? 'confirmed',
    confidence: null,
    occurred_at: overrides.occurred_at ?? '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:00.000Z',
  };
}

describe('summarize', () => {
  it('returns zeros and empty breakdown for no transactions', () => {
    expect(summarize([])).toEqual({
      income: 0,
      expense: 0,
      net: 0,
      byCategory: [],
    });
  });

  it('sums a single confirmed expense', () => {
    const result = summarize([txn({ type: 'expense', amount: 50, category_slug: 'food' })]);
    expect(result.expense).toBe(50);
    expect(result.income).toBe(0);
    expect(result.net).toBe(-50);
    expect(result.byCategory).toEqual([{ slug: 'food', total: 50 }]);
  });

  it('sums a single confirmed income', () => {
    const result = summarize([txn({ type: 'income', amount: 1000, category_slug: 'salary' })]);
    expect(result.income).toBe(1000);
    expect(result.expense).toBe(0);
    expect(result.net).toBe(1000);
    expect(result.byCategory).toEqual([{ slug: 'salary', total: 1000 }]);
  });

  it('mixes income and expense; net = income - expense', () => {
    const result = summarize([
      txn({ id: 'a', type: 'income', amount: 1000, category_slug: 'salary' }),
      txn({ id: 'b', type: 'expense', amount: 200, category_slug: 'food' }),
      txn({ id: 'c', type: 'expense', amount: 50, category_slug: 'transport' }),
    ]);
    expect(result.income).toBe(1000);
    expect(result.expense).toBe(250);
    expect(result.net).toBe(750);
  });

  it('excludes pending transactions from every total and the breakdown', () => {
    const result = summarize([
      txn({ id: 'a', type: 'expense', amount: 100, category_slug: 'food', status: 'confirmed' }),
      txn({ id: 'b', type: 'expense', amount: 999, category_slug: 'food', status: 'pending' }),
      txn({ id: 'c', type: 'income', amount: 500, category_slug: 'salary', status: 'pending' }),
    ]);
    expect(result.expense).toBe(100);
    expect(result.income).toBe(0);
    expect(result.net).toBe(-100);
    expect(result.byCategory).toEqual([{ slug: 'food', total: 100 }]);
  });

  it('aggregates multiple transactions in the same category', () => {
    const result = summarize([
      txn({ id: 'a', type: 'expense', amount: 30, category_slug: 'food' }),
      txn({ id: 'b', type: 'expense', amount: 20, category_slug: 'food' }),
    ]);
    expect(result.byCategory).toEqual([{ slug: 'food', total: 50 }]);
  });

  it('sorts byCategory descending by total', () => {
    const result = summarize([
      txn({ id: 'a', type: 'expense', amount: 10, category_slug: 'transport' }),
      txn({ id: 'b', type: 'expense', amount: 90, category_slug: 'food' }),
      txn({ id: 'c', type: 'income', amount: 50, category_slug: 'salary' }),
    ]);
    expect(result.byCategory).toEqual([
      { slug: 'food', total: 90 },
      { slug: 'salary', total: 50 },
      { slug: 'transport', total: 10 },
    ]);
  });
});
