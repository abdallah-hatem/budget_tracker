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

/**
 * AppText — locale-aware text wrapper.
 * Automatically selects Jakarta (en) or Readex (ar) based on the session locale.
 * Add color/size via className; this component sets fontFamily only.
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

  return (
    <Text
      className={className}
      style={[{ fontFamily }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
