import React from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { formatMoney, type MoneySign } from '@/src/lib/money';
import { FONT } from '@/src/lib/font';
import { useAmountsHidden } from '@/src/features/privacy/useAmountsHidden';
import { MaskDots } from './MaskDots';

export type MoneyTone = 'ink' | 'accent' | 'ink2' | 'auto';

export interface MoneyProps {
  amount: number;
  /**
   * Color tone:
   * - 'ink'    → #F4F7F5 (primary text)
   * - 'accent' → #2BD98E (emerald)
   * - 'ink2'   → #A8B2AF (secondary)
   * - 'auto'   → accent if amount > 0, ink otherwise
   */
  tone?: MoneyTone;
  sign?: MoneySign;
  /** Font size in points (default 16) */
  size?: number;
  className?: string;
  style?: TextStyle;
  testID?: string;
  /** Clamp the amount to N lines (e.g. 1 to prevent wrapping in narrow cards). */
  numberOfLines?: number;
  /** Shrink the font to fit `numberOfLines` instead of wrapping/truncating. */
  adjustsFontSizeToFit?: boolean;
}

const TONE_COLORS: Record<Exclude<MoneyTone, 'auto'>, string> = {
  ink: '#F4F7F5',
  accent: '#2BD98E',
  ink2: '#A8B2AF',
};

/**
 * Money — renders a formatted EGP amount with Sora tabular numerals.
 */
export function Money({
  amount,
  tone = 'auto',
  sign = 'auto',
  size = 16,
  className = '',
  style,
  testID,
  numberOfLines,
  adjustsFontSizeToFit,
}: MoneyProps) {
  const resolvedTone: Exclude<MoneyTone, 'auto'> =
    tone === 'auto' ? (amount > 0 ? 'accent' : 'ink') : tone;

  const hidden = useAmountsHidden();
  const color = TONE_COLORS[resolvedTone];

  // Masked: keep the "E£" symbol so the row still reads as money, then a row of
  // dots (drawn, not a glyph) in place of the digits.
  if (hidden) {
    return (
      <View
        testID={testID}
        className={className}
        style={[{ flexDirection: 'row', alignItems: 'center', direction: 'ltr' }, style as unknown as ViewStyle]}
      >
        <Text
          style={{
            fontFamily: FONT.soraSb,
            fontSize: size,
            color,
            writingDirection: 'ltr',
            marginRight: Math.round(size * 0.34),
          }}
        >
          E£
        </Text>
        <MaskDots size={size} color={color} />
      </View>
    );
  }

  const formatted = formatMoney(amount, { sign });

  return (
    <Text
      testID={testID}
      className={className}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={adjustsFontSizeToFit ? 0.6 : undefined}
      style={[
        {
          fontFamily: FONT.soraSb,
          fontSize: size,
          color,
          fontVariant: ['tabular-nums', 'lining-nums'],
          // Prevent bidi reordering — sign+symbol+digits must always read L→R
          writingDirection: 'ltr',
        },
        style,
      ]}
    >
      {formatted}
    </Text>
  );
}
