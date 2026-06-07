import type { Summary } from '../dashboard/summary';
import { categoryLabel } from '../transactions/display';
import { categoryStyle } from '../../lib/categoryStyle';
import { formatMoneyCompact } from '../../lib/money';
import { isRTL } from '../../lib/i18n';
import type { Locale, Transaction } from '../../types';

/** One category bar in the widget. */
export interface WidgetCategory {
  /** Localized category name. */
  label: string;
  /** Compact formatted total, e.g. "E£ 1,234". */
  amount: string;
  /** Hex color (the category's accent), e.g. "#FF8A5C". */
  color: string;
  /** 0..1 bar width relative to the largest of the shown categories. */
  fraction: number;
}

/**
 * The exact, render-ready payload the iOS widget reads from the shared App Group.
 * Everything is pre-formatted + pre-localized so the SwiftUI side stays dumb
 * (no number/locale formatting, no Supabase) and matches the app pixel-for-word.
 */
export interface WidgetSnapshot {
  /** Schema version, so the widget can ignore payloads it doesn't understand. */
  v: number;
  rtl: boolean;
  spentLabel: string; // "Spent this month"
  spent: string; // "E£ 1,234"
  todayLabel: string; // "Today"
  today: string; // "E£ 56"
  emptyText: string; // shown when the month has no spending
  categories: WidgetCategory[]; // top 3 expense categories, desc
  updatedAt: number; // epoch ms (for staleness / debugging)
}

export const WIDGET_SNAPSHOT_VERSION = 1;
/** UserDefaults key the app writes and the widget reads inside the App Group. */
export const WIDGET_SNAPSHOT_KEY = 'snapshot';

const MAX_CATEGORIES = 3;

/** Local helpers, kept out of the public shape. */
function dayKey(d: Date): string {
  // Matches the transactions list, which buckets by the stored ISO date prefix.
  return d.toISOString().slice(0, 10);
}

/**
 * Fold the current month's summary + transactions into the widget payload.
 * Pure (takes `now` explicitly) so it unit-tests without a clock.
 */
export function buildWidgetSnapshot(args: {
  summary: Summary;
  transactions: Transaction[];
  locale: Locale;
  now: Date;
}): WidgetSnapshot {
  const { summary, transactions, locale, now } = args;
  const ar = locale === 'ar';
  const todayKey = dayKey(now);

  const todayTotal = transactions
    .filter(
      (t) =>
        t.status === 'confirmed' &&
        t.type === 'expense' &&
        t.occurred_at.slice(0, 10) === todayKey,
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const top = summary.expenseByCategory.slice(0, MAX_CATEGORIES);
  const max = top.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const categories: WidgetCategory[] = top.map((r) => ({
    label: categoryLabel(r.slug, locale),
    amount: formatMoneyCompact(r.total),
    color: categoryStyle(r.slug).color,
    fraction: r.total / max,
  }));

  return {
    v: WIDGET_SNAPSHOT_VERSION,
    rtl: isRTL(locale),
    spentLabel: ar ? 'مصروفات هذا الشهر' : 'Spent this month',
    spent: formatMoneyCompact(summary.expense),
    todayLabel: ar ? 'اليوم' : 'Today',
    today: formatMoneyCompact(todayTotal),
    emptyText: ar ? 'لا مصروفات هذا الشهر' : 'No spending yet',
    categories,
    updatedAt: now.getTime(),
  };
}
