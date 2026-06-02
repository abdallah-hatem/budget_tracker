import { categoryBySlug } from '../../lib/categories';
import type { Locale } from '../../types';

/**
 * Bilingual label for a category slug. Unknown slugs (e.g. a category we removed)
 * degrade gracefully to the raw slug so the row is still readable.
 */
export function categoryLabel(slug: string, locale: Locale): string {
  const cat = categoryBySlug(slug);
  if (!cat) return slug;
  return locale === 'ar' ? cat.name_ar : cat.name_en;
}

/** EGP amount formatted to two decimals with a locale-appropriate currency token. */
export function formatAmount(amount: number, locale: Locale): string {
  const token = locale === 'ar' ? 'ج.م' : 'EGP';
  return `${amount.toFixed(2)} ${token}`;
}
