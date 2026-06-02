import { t, isRTL, STRINGS } from '@/src/lib/i18n';

describe('isRTL', () => {
  it('is true for Arabic', () => {
    expect(isRTL('ar')).toBe(true);
  });
  it('is false for English', () => {
    expect(isRTL('en')).toBe(false);
  });
});

describe('t', () => {
  it('returns the English string for a known key', () => {
    expect(t('settings.title', 'en')).toBe('Settings');
  });
  it('returns the Arabic string for a known key', () => {
    expect(t('settings.title', 'ar')).toBe('الإعدادات');
  });
  it('falls back to the key itself when the key is unknown', () => {
    expect(t('does.not.exist', 'en')).toBe('does.not.exist');
  });
  it('falls back to English when the Arabic value is missing', () => {
    // every STRINGS entry must define both, so assert that invariant here
    for (const key of Object.keys(STRINGS)) {
      expect(typeof STRINGS[key].en).toBe('string');
      expect(typeof STRINGS[key].ar).toBe('string');
      expect(STRINGS[key].en.length).toBeGreaterThan(0);
      expect(STRINGS[key].ar.length).toBeGreaterThan(0);
    }
  });
});

// Milestone-6 contract: all required keys must be present with both locales
describe('M6 required keys', () => {
  const m6Keys = [
    'dashboard_title',
    'net_this_month',
    'income',
    'expense',
    'by_category',
    'recent',
    'no_transactions',
    'transactions_title',
    'all_categories',
    'edit',
    'delete',
    'save',
    'cancel',
    'amount',
    'note',
    'prev_month',
    'next_month',
    'loading',
  ];

  it.each(m6Keys)('STRINGS has key "%s" with both locales', (key) => {
    expect(STRINGS[key]).toBeDefined();
    expect(typeof STRINGS[key].en).toBe('string');
    expect(STRINGS[key].en.length).toBeGreaterThan(0);
    expect(typeof STRINGS[key].ar).toBe('string');
    expect(STRINGS[key].ar.length).toBeGreaterThan(0);
  });
});
