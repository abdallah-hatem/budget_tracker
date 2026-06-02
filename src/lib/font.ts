/**
 * font.ts — font family helpers for Midnight Emerald design system.
 *
 * Numbers always use Sora (Western digits even in Arabic locale).
 * English UI text → Plus Jakarta Sans
 * Arabic UI text → Readex Pro
 */

export type Locale = 'en' | 'ar';

/** All loaded font family name constants (must match useFonts keys in _layout.tsx) */
export const FONT = {
  // Numbers / balances / display
  sora: 'Sora_700Bold',
  soraSb: 'Sora_600SemiBold',

  // English UI
  jakarta: 'PlusJakartaSans_400Regular',
  jakartaMd: 'PlusJakartaSans_500Medium',
  jakartaSb: 'PlusJakartaSans_600SemiBold',
  jakartaB: 'PlusJakartaSans_700Bold',

  // Arabic UI
  readex: 'ReadexPro_400Regular',
  readexMd: 'ReadexPro_500Medium',
  readexSb: 'ReadexPro_600SemiBold',
} as const;

export type FontKey = keyof typeof FONT;

/**
 * Returns the base UI font family name for the given locale.
 * Use for inline `fontFamily` style props.
 * Numbers should always use FONT.sora regardless of locale.
 */
export function uiFont(locale: Locale): string {
  return locale === 'ar' ? FONT.readex : FONT.jakarta;
}

/**
 * Returns the medium-weight UI font family name for the given locale.
 */
export function uiFontMedium(locale: Locale): string {
  return locale === 'ar' ? FONT.readexMd : FONT.jakartaMd;
}

/**
 * Returns the semi-bold UI font family name for the given locale.
 */
export function uiFontSemiBold(locale: Locale): string {
  return locale === 'ar' ? FONT.readexSb : FONT.jakartaSb;
}
