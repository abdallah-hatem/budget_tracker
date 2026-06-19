import {
  setCustomCategories,
  clearCustomCategories,
  categoryBySlug,
  isCustomSlug,
  expenseCategories,
  incomeCategories,
  categorySlugs,
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

  it('places income custom categories in incomeCategories()', () => {
    setCustomCategories([{ ...padel, slug: 'c_freelance', kind: 'income' }]);
    expect(incomeCategories().some((c) => c.slug === 'c_freelance')).toBe(true);
    expect(expenseCategories().some((c) => c.slug === 'c_freelance')).toBe(false);
  });

  it('clear() removes custom categories', () => {
    setCustomCategories([padel]);
    clearCustomCategories();
    expect(categoryBySlug('c_padel')).toBeUndefined();
    expect(isCustomSlug('c_padel')).toBe(false);
    expect(categorySlugs()).not.toContain('c_padel');
  });
});
