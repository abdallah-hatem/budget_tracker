/**
 * money.ts — formatting utilities for EGP amounts.
 *
 * Rules:
 * - Always "E£" prefix (not Arabic "ج.م")
 * - Western digits even for ar locale
 * - Always 2 decimal places with comma grouping
 * - Real Unicode minus sign (U+2212) for negatives, not hyphen-minus
 * - fontVariant: ['tabular-nums','lining-nums'] must be applied at render time
 */

export type MoneyLocale = 'en' | 'ar';
export type MoneySign = 'auto' | 'always' | 'none';

export interface FormatMoneyOptions {
  locale?: MoneyLocale;
  sign?: MoneySign;
}

export interface SplitMoneyResult {
  /** true when amount < 0 */
  negative: boolean;
  symbol: string;
  integer: string;
  decimals: string;
}

// Real Unicode minus (U+2212) — different from ASCII hyphen-minus (U+002D)
const UNICODE_MINUS = '−';

/**
 * Format an EGP amount as a display string.
 * Always produces Western digits, "E£" prefix, 2 decimal places.
 *
 * @param amount - The amount (positive = income, negative = expense)
 * @param opts.locale - 'en' (default) or 'ar'
 * @param opts.sign - 'auto' (negative shows −, positive no sign) |
 *                    'always' (both signs shown) | 'none' (no sign)
 */
export function formatMoney(
  amount: number,
  opts: FormatMoneyOptions = {},
): string {
  const { sign = 'auto' } = opts;

  // Always use en-US for Western digits + grouping; we replace the symbol ourselves
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  const abs = Math.abs(amount);
  const formatted = formatter.format(abs); // e.g. "1,250.00"

  let prefix = '';
  if (sign === 'always') {
    prefix = amount < 0 ? UNICODE_MINUS : '+';
  } else if (sign === 'auto') {
    prefix = amount < 0 ? UNICODE_MINUS : '';
  }
  // sign === 'none' → no prefix

  return `${prefix}E£ ${formatted}`;
}

/**
 * Format an EGP amount compactly for tight, glanceable spots (e.g. the donut
 * center). Drops cents and collapses large magnitudes to M/B so the string
 * stays short regardless of size:
 *   932        → "E£ 932"
 *   1,332      → "E£ 1,332"
 *   123,456    → "E£ 123,456"
 *   1,332,000  → "E£ 1.3M"
 *   2,400,000,000 → "E£ 2.4B"
 */
export function formatMoneyCompact(
  amount: number,
  opts: { sign?: MoneySign } = {},
): string {
  const { sign = 'none' } = opts;
  const abs = Math.abs(amount);

  let body: string;
  if (abs >= 1_000_000_000) {
    body = `${compactDecimal(abs / 1_000_000_000)}B`;
  } else if (abs >= 1_000_000) {
    body = `${compactDecimal(abs / 1_000_000)}M`;
  } else {
    body = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(Math.round(abs));
  }

  let prefix = '';
  if (sign === 'always') {
    prefix = amount < 0 ? UNICODE_MINUS : '+';
  } else if (sign === 'auto') {
    prefix = amount < 0 ? UNICODE_MINUS : '';
  }

  return `${prefix}E£ ${body}`;
}

// One decimal place, with a trailing ".0" trimmed (1.0 → "1", 1.3 → "1.3").
function compactDecimal(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${r}` : r.toFixed(1);
}

/**
 * Split an amount into sign flag, symbol, integer, and decimal parts for hero display.
 * Uses absolute value for the numeric parts; callers use `negative` to render
 * a leading Unicode minus (−) in the appropriate style.
 */
export function splitMoney(amount: number): SplitMoneyResult {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  const formatted = formatter.format(abs); // e.g. "1,250.00"
  const dotIndex = formatted.lastIndexOf('.');
  const integer = formatted.slice(0, dotIndex);   // "1,250"
  const decimals = formatted.slice(dotIndex + 1); // "00"

  return {
    negative,
    symbol: 'E£',
    integer,
    decimals,
  };
}
