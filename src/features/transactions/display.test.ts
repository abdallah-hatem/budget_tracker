import { categoryLabel, formatAmount } from './display';

describe('categoryLabel', () => {
  it('returns the English name for a known slug in en', () => {
    expect(categoryLabel('food', 'en')).toBe('Food & Drink');
  });

  it('returns the Arabic name for a known slug in ar', () => {
    expect(categoryLabel('food', 'ar')).toBe('طعام وشراب');
  });

  it('falls back to the slug for an unknown category', () => {
    expect(categoryLabel('nonexistent_slug', 'en')).toBe('nonexistent_slug');
  });
});

describe('formatAmount', () => {
  it('formats a whole number with two decimals and EGP', () => {
    expect(formatAmount(50, 'en')).toBe('50.00 EGP');
  });

  it('formats with the Arabic currency token in ar', () => {
    expect(formatAmount(50, 'ar')).toBe('50.00 ج.م');
  });
});
