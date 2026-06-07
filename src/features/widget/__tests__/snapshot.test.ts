import { buildWidgetSnapshot, WIDGET_SNAPSHOT_VERSION } from '../snapshot';
import { summarize } from '../../dashboard/summary';
import type { Transaction } from '../../../types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'x',
  user_id: 'u1',
  type: 'expense',
  amount: 0,
  currency: 'EGP',
  category_slug: 'food',
  note: null,
  raw_text: null,
  source: 'text',
  status: 'confirmed',
  confidence: 1,
  occurred_at: '2026-06-07T10:00:00.000Z',
  account_id: null,
  created_at: '2026-06-07T10:00:00.000Z',
  ...over,
});

const NOW = new Date('2026-06-07T12:00:00.000Z');

const TXNS: Transaction[] = [
  tx({ id: 't1', category_slug: 'food', amount: 200, occurred_at: '2026-06-07T08:00:00.000Z' }), // today
  tx({ id: 't2', category_slug: 'food', amount: 100, occurred_at: '2026-06-03T08:00:00.000Z' }), // earlier
  tx({ id: 't3', category_slug: 'transport', amount: 100, occurred_at: '2026-06-07T09:00:00.000Z' }), // today
  tx({ id: 't4', type: 'income', category_slug: 'salary', amount: 5000, occurred_at: '2026-06-01T08:00:00.000Z' }),
];

it('sums the month into the spent figure (expense only, formatted)', () => {
  const snap = buildWidgetSnapshot({ summary: summarize(TXNS), transactions: TXNS, locale: 'en', now: NOW });
  expect(snap.spent).toBe('E£ 400'); // 200 + 100 + 100, income excluded
  expect(snap.v).toBe(WIDGET_SNAPSHOT_VERSION);
  expect(snap.updatedAt).toBe(NOW.getTime());
});

it("sums only today's expenses into the today figure", () => {
  const snap = buildWidgetSnapshot({ summary: summarize(TXNS), transactions: TXNS, locale: 'en', now: NOW });
  expect(snap.today).toBe('E£ 300'); // food 200 + transport 100, both 2026-06-07
});

it('builds the top categories with bar fractions relative to the largest', () => {
  const snap = buildWidgetSnapshot({ summary: summarize(TXNS), transactions: TXNS, locale: 'en', now: NOW });
  expect(snap.categories).toHaveLength(2); // food (300), transport (100)
  expect(snap.categories[0].amount).toBe('E£ 300');
  expect(snap.categories[0].fraction).toBe(1);
  expect(snap.categories[1].fraction).toBeCloseTo(1 / 3, 5);
  expect(snap.categories[0].color).toMatch(/^#/);
  expect(snap.categories[0].label.length).toBeGreaterThan(0);
});

it('caps at three categories', () => {
  const many: Transaction[] = [
    tx({ id: 'a', category_slug: 'food', amount: 50 }),
    tx({ id: 'b', category_slug: 'transport', amount: 40 }),
    tx({ id: 'c', category_slug: 'shopping', amount: 30 }),
    tx({ id: 'd', category_slug: 'bills', amount: 20 }),
  ];
  const snap = buildWidgetSnapshot({ summary: summarize(many), transactions: many, locale: 'en', now: NOW });
  expect(snap.categories).toHaveLength(3);
});

it('handles an empty month', () => {
  const snap = buildWidgetSnapshot({ summary: summarize([]), transactions: [], locale: 'en', now: NOW });
  expect(snap.spent).toBe('E£ 0');
  expect(snap.today).toBe('E£ 0');
  expect(snap.categories).toHaveLength(0);
});

it('localizes labels + direction for Arabic', () => {
  const snap = buildWidgetSnapshot({ summary: summarize(TXNS), transactions: TXNS, locale: 'ar', now: NOW });
  expect(snap.rtl).toBe(true);
  expect(snap.spentLabel).toBe('مصروفات هذا الشهر');
  expect(snap.todayLabel).toBe('اليوم');
  // Money stays Western-digit "E£" by app convention, even in Arabic.
  expect(snap.spent).toBe('E£ 400');
});
