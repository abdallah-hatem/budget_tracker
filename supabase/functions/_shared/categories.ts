// Edge-Function copy of the category slugs.
// SOURCE OF TRUTH: this list MUST stay byte-for-byte identical (same slugs, same
// grouping) to BOTH:
//   - src/lib/categories.ts        (CATEGORIES[].slug, owned by M2)
//   - supabase/seed.sql            (categories rows, owned by M2)
// If you add/rename/remove a category, update all three in the same commit.

/** Expense category slugs (13). */
export const EXPENSE_SLUGS = [
  "food",
  "groceries",
  "transport",
  "clothes",
  "bills",
  "health",
  "entertainment",
  "sports",
  "education",
  "home",
  "travel",
  "shopping",
  "other_expense",
] as const;

/** Income category slugs (5). */
export const INCOME_SLUGS = [
  "salary",
  "transfer_in",
  "gift",
  "refund",
  "other_income",
] as const;

/** All 18 valid category slugs, used as the strict-tool `category_slug` enum. */
export const CATEGORY_SLUGS: string[] = [...EXPENSE_SLUGS, ...INCOME_SLUGS];

/** Fallback slug for an unrecognised / missing expense category. */
export const FALLBACK_EXPENSE_SLUG = "other_expense";

/** Fallback slug for an unrecognised / missing income category. */
export const FALLBACK_INCOME_SLUG = "other_income";
