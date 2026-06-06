// src/lib/__tests__/categories.test.ts
import {
  CATEGORIES,
  categoryBySlug,
  expenseCategories,
  incomeCategories,
  categorySlugs,
} from '../categories';

// The contract's slug sets (source of truth).
const EXPENSE_SLUGS = [
  'food', 'groceries', 'transport', 'clothes', 'bills', 'health',
  'entertainment', 'sports', 'education', 'home', 'travel', 'shopping', 'other_expense',
];
const INCOME_SLUGS = [
  'salary', 'transfer_in', 'gift', 'refund', 'other_income',
];

describe('categories source of truth', () => {
  it('has exactly the contract expense slugs', () => {
    expect(new Set(expenseCategories().map((c) => c.slug))).toEqual(
      new Set(EXPENSE_SLUGS),
    );
  });

  it('has exactly the contract income slugs', () => {
    expect(new Set(incomeCategories().map((c) => c.slug))).toEqual(
      new Set(INCOME_SLUGS),
    );
  });

  it('categorySlugs() returns all 18 slugs', () => {
    const slugs = categorySlugs();
    expect(slugs).toHaveLength(18);
    expect(new Set(slugs)).toEqual(
      new Set([...EXPENSE_SLUGS, ...INCOME_SLUGS]),
    );
  });

  it('every expense category has kind "expense"', () => {
    expenseCategories().forEach((c) => expect(c.kind).toBe('expense'));
  });

  it('every income category has kind "income"', () => {
    incomeCategories().forEach((c) => expect(c.kind).toBe('income'));
  });

  it('CATEGORIES has no duplicate slugs', () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every category has a non-empty Arabic and English name', () => {
    CATEGORIES.forEach((c) => {
      expect(c.name_en.length).toBeGreaterThan(0);
      expect(c.name_ar.length).toBeGreaterThan(0);
    });
  });

  it('categoryBySlug returns the matching category', () => {
    const c = categoryBySlug('food');
    expect(c).toBeDefined();
    expect(c?.name_en).toBe('Food & Drink');
    expect(c?.kind).toBe('expense');
  });

  it('categoryBySlug returns undefined for an unknown slug', () => {
    expect(categoryBySlug('not_a_real_slug')).toBeUndefined();
  });
});
