import { formatMoney, splitMoney } from '../money';

// Real Unicode minus (U+2212)
const MINUS = '−';

describe('formatMoney', () => {
  describe('positive amounts', () => {
    it('formats a positive amount with E£ prefix and grouping', () => {
      expect(formatMoney(1250)).toBe('E£ 1,250.00');
    });

    it('formats zero correctly', () => {
      expect(formatMoney(0)).toBe('E£ 0.00');
    });

    it('always shows 2 decimal places', () => {
      expect(formatMoney(100)).toBe('E£ 100.00');
      expect(formatMoney(99.9)).toBe('E£ 99.90');
      expect(formatMoney(1.23)).toBe('E£ 1.23');
    });

    it('uses comma grouping for large amounts', () => {
      expect(formatMoney(1000000)).toBe('E£ 1,000,000.00');
    });
  });

  describe('negative amounts', () => {
    it('uses real Unicode minus (U+2212) not hyphen-minus', () => {
      const result = formatMoney(-500);
      expect(result).toBe(`${MINUS}E£ 500.00`);
      // Confirm it is NOT the ASCII hyphen-minus
      expect(result.charCodeAt(0)).toBe(0x2212);
    });

    it('shows minus sign for negative with sign=auto (default)', () => {
      expect(formatMoney(-1250)).toBe(`${MINUS}E£ 1,250.00`);
    });
  });

  describe('sign options', () => {
    it('sign=none hides sign for negative', () => {
      expect(formatMoney(-500, { sign: 'none' })).toBe('E£ 500.00');
    });

    it('sign=none hides sign for positive', () => {
      expect(formatMoney(500, { sign: 'none' })).toBe('E£ 500.00');
    });

    it('sign=always shows + for positive', () => {
      expect(formatMoney(500, { sign: 'always' })).toBe('+E£ 500.00');
    });

    it('sign=always shows Unicode minus for negative', () => {
      expect(formatMoney(-500, { sign: 'always' })).toBe(`${MINUS}E£ 500.00`);
    });

    it('sign=auto (default) shows no prefix for positive', () => {
      expect(formatMoney(500)).toBe('E£ 500.00');
    });
  });

  describe('locale option', () => {
    it('always produces Western digits even with ar locale', () => {
      const result = formatMoney(1250, { locale: 'ar' });
      // Should not contain Arabic-Indic digits (U+0660–U+0669)
      expect(result).toMatch(/^[^٠-٩]+$/);
      expect(result).toBe('E£ 1,250.00');
    });
  });
});

describe('splitMoney', () => {
  it('splits a simple amount correctly', () => {
    const result = splitMoney(1250);
    expect(result).toEqual({
      negative: false,
      symbol: 'E£',
      integer: '1,250',
      decimals: '00',
    });
  });

  it('splits zero correctly', () => {
    expect(splitMoney(0)).toEqual({
      negative: false,
      symbol: 'E£',
      integer: '0',
      decimals: '00',
    });
  });

  it('splits a decimal amount correctly', () => {
    expect(splitMoney(99.9)).toEqual({
      negative: false,
      symbol: 'E£',
      integer: '99',
      decimals: '90',
    });
  });

  it('sets negative=true and uses absolute value for negative amounts', () => {
    expect(splitMoney(-1500)).toEqual({
      negative: true,
      symbol: 'E£',
      integer: '1,500',
      decimals: '00',
    });
  });

  it('handles large amounts with grouping', () => {
    expect(splitMoney(1234567.89)).toEqual({
      negative: false,
      symbol: 'E£',
      integer: '1,234,567',
      decimals: '89',
    });
  });
});
