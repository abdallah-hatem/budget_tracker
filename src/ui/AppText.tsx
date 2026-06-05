import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useSession } from '@/src/features/auth/SessionProvider';
import { uiFont, uiFontMedium, uiFontSemiBold } from '@/src/lib/font';

export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface AppTextProps extends TextProps {
  children: React.ReactNode;
  /** Font weight variant (default 'regular') */
  weight?: TextWeight;
  className?: string;
}

// Detects whether a className already specifies a text COLOR (not a size/align
// like text-base/text-center) from our theme palette.
const HAS_TEXT_COLOR =
  /\btext-(ink2|ink3|ink|accent(Press)?|income|expense|danger|warning|white|black|transparent|gray-\d+|red-\d+|green-\d+|emerald-\d+|blue-\d+|amber-\d+)\b/;

/**
 * AppText — locale-aware text wrapper.
 * Selects Jakarta (en) or Readex (ar) from the session locale, and DEFAULTS the
 * color to `ink` so text is never invisible-black on the dark canvas. Pass a
 * `text-*` color in className (or `color` in style) to override.
 */
export function AppText({
  children,
  weight = 'regular',
  className = '',
  style,
  ...rest
}: AppTextProps) {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';

  let fontFamily: string;
  switch (weight) {
    case 'bold':
      fontFamily = locale === 'ar' ? 'ReadexPro_600SemiBold' : 'PlusJakartaSans_700Bold';
      break;
    case 'semibold':
      fontFamily = uiFontSemiBold(locale);
      break;
    case 'medium':
      fontFamily = uiFontMedium(locale);
      break;
    default:
      fontFamily = uiFont(locale);
  }

  // Default to ink unless an explicit color class is present. (An explicit
  // `color` in the `style` prop still wins via style precedence.)
  const hasColor = HAS_TEXT_COLOR.test(className) || /\btext-\[/.test(className);
  const finalClassName = hasColor ? className : `text-ink ${className}`.trim();

  return (
    <Text
      className={finalClassName}
      style={[{ fontFamily }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
