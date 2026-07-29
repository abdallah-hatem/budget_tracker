import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getHiddenCategories,
  setCategoryHidden,
  resetHiddenCategoriesCache,
  filterVisibleCategories,
} from '../hiddenCategories';
import { expenseCategories } from '../../../lib/categories';

describe('hidden categories store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetHiddenCategoriesCache();
  });

  it('defaults to NOTHING hidden when nothing is stored', async () => {
    expect(await getHiddenCategories()).toEqual(new Set());
  });

  it('hiding then un-hiding round-trips through storage', async () => {
    await setCategoryHidden('sports', true);
    resetHiddenCategoriesCache(); // force a re-read from storage
    expect(await getHiddenCategories()).toEqual(new Set(['sports']));

    await setCategoryHidden('sports', false);
    resetHiddenCategoriesCache();
    expect(await getHiddenCategories()).toEqual(new Set());
  });

  it('supports hiding multiple slugs independently', async () => {
    await setCategoryHidden('sports', true);
    await setCategoryHidden('travel', true);
    resetHiddenCategoriesCache();
    expect(await getHiddenCategories()).toEqual(new Set(['sports', 'travel']));

    await setCategoryHidden('sports', false);
    resetHiddenCategoriesCache();
    expect(await getHiddenCategories()).toEqual(new Set(['travel']));
  });

  it('falls back to nothing hidden when storage throws', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    resetHiddenCategoriesCache();
    expect(await getHiddenCategories()).toEqual(new Set());
    spy.mockRestore();
  });

  it('setCategoryHidden never throws even when storage write fails', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(setCategoryHidden('sports', true)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  describe('filterVisibleCategories (pure filter behind useVisibleCategories)', () => {
    const cats = expenseCategories();

    it('excludes hidden slugs', () => {
      const hidden = new Set(['sports', 'travel']);
      const visible = filterVisibleCategories(cats, hidden);
      expect(visible.some((c) => c.slug === 'sports')).toBe(false);
      expect(visible.some((c) => c.slug === 'travel')).toBe(false);
      expect(visible.some((c) => c.slug === 'food')).toBe(true);
    });

    it('keeps keepSlug even when it is hidden (edit-picker regression)', () => {
      const hidden = new Set(['sports']);
      const visible = filterVisibleCategories(cats, hidden, 'sports');
      expect(visible.some((c) => c.slug === 'sports')).toBe(true);
    });

    it('keepSlug has no effect on slugs that are not hidden', () => {
      const hidden = new Set<string>();
      const visible = filterVisibleCategories(cats, hidden, 'food');
      expect(visible).toHaveLength(cats.length);
    });

    it('returns everything when nothing is hidden', () => {
      const visible = filterVisibleCategories(cats, new Set());
      expect(visible).toHaveLength(cats.length);
    });

    it('does not mutate the input list', () => {
      const before = [...cats];
      filterVisibleCategories(cats, new Set(['sports']), null);
      expect(cats).toEqual(before);
    });
  });
});
