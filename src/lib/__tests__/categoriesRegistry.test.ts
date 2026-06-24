import {
  setCustomCategories,
  clearCustomCategories,
  categoryBySlug,
  isCustomSlug,
  expenseCategories,
  incomeCategories,
  categorySlugs,
  subscribeCategories,
  getCategoriesVersion,
} from '../categories';
import { categoryStyle } from '../categoryStyle';
import type { Category } from '../../types';

const padel: Category = {
  slug: 'c_padel', name_en: 'Padel', name_ar: 'بادل', kind: 'expense',
  icon: 'tennis', color: '#123456', sort_order: 1000, user_id: 'u1',
};

afterEach(() => clearCustomCategories());

describe('custom category registry', () => {
  it('registers and resolves a custom category alongside built-ins', () => {
    setCustomCategories([padel]);
    expect(categoryBySlug('c_padel')?.name_en).toBe('Padel');
    expect(isCustomSlug('c_padel')).toBe(true);
    expect(isCustomSlug('food')).toBe(false);
    expect(expenseCategories().some((c) => c.slug === 'c_padel')).toBe(true);
    expect(categorySlugs()).toContain('c_padel');
  });

  it('uses the custom row icon + color in categoryStyle', () => {
    setCustomCategories([padel]);
    expect(categoryStyle('c_padel')).toMatchObject({ icon: 'tennis', color: '#123456' });
  });

  it('keeps built-ins resolving unchanged', () => {
    setCustomCategories([padel]);
    expect(categoryBySlug('food')?.name_en).toBe('Food & Drink');
    expect(categoryStyle('food').color).toBe('#F97316');
  });

  it('sorts custom categories before the "Other" catch-all', () => {
    setCustomCategories([padel]);
    const slugs = expenseCategories().map((c) => c.slug);
    expect(slugs.indexOf('c_padel')).toBeLessThan(slugs.indexOf('other_expense'));
    expect(slugs[slugs.length - 1]).toBe('other_expense'); // catch-all stays last
  });

  it('places income custom categories in incomeCategories()', () => {
    setCustomCategories([{ ...padel, slug: 'c_freelance', kind: 'income' }]);
    expect(incomeCategories().some((c) => c.slug === 'c_freelance')).toBe(true);
    expect(expenseCategories().some((c) => c.slug === 'c_freelance')).toBe(false);
  });

  it('notifies subscribers and bumps the version when the registry changes', () => {
    const before = getCategoriesVersion();
    let calls = 0;
    const unsubscribe = subscribeCategories(() => { calls += 1; });

    setCustomCategories([padel]);
    expect(calls).toBe(1);
    expect(getCategoriesVersion()).not.toBe(before);

    clearCustomCategories();
    expect(calls).toBe(2);

    const afterUnsub = getCategoriesVersion();
    unsubscribe();
    setCustomCategories([padel]);
    expect(calls).toBe(2); // no further notifications after unsubscribe
    expect(getCategoriesVersion()).not.toBe(afterUnsub); // version still advances
  });

  it('clear() removes custom categories', () => {
    setCustomCategories([padel]);
    clearCustomCategories();
    expect(categoryBySlug('c_padel')).toBeUndefined();
    expect(isCustomSlug('c_padel')).toBe(false);
    expect(categorySlugs()).not.toContain('c_padel');
  });
});
