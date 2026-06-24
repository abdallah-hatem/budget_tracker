import { sanitizeNumericInput, formatNumericInput } from '../numberInput';

describe('sanitizeNumericInput', () => {
  it('strips grouping commas and non-numeric chars', () => {
    expect(sanitizeNumericInput('1,234')).toBe('1234');
    expect(sanitizeNumericInput('1,234.50 EGP')).toBe('1234.50');
  });
  it('keeps a single decimal point', () => {
    expect(sanitizeNumericInput('12.3.4')).toBe('12.34');
  });
  it('drops the dot entirely when decimal=false', () => {
    expect(sanitizeNumericInput('1,234.5', false)).toBe('12345');
  });
});

describe('formatNumericInput', () => {
  it('groups the integer part with commas', () => {
    expect(formatNumericInput('1234')).toBe('1,234');
    expect(formatNumericInput('1234567')).toBe('1,234,567');
  });
  it('preserves the decimal part (and a trailing dot mid-typing)', () => {
    expect(formatNumericInput('1234.5')).toBe('1,234.5');
    expect(formatNumericInput('1234.')).toBe('1,234.');
  });
  it('handles empty and small values', () => {
    expect(formatNumericInput('')).toBe('');
    expect(formatNumericInput('50')).toBe('50');
  });

  it('round-trips: format(sanitize(x)) is parseFloat-safe', () => {
    const raw = sanitizeNumericInput('1,234,567.89');
    expect(parseFloat(raw)).toBe(1234567.89);
    expect(formatNumericInput(raw)).toBe('1,234,567.89');
  });
});
