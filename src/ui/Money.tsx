import React from 'react';
import { Text, type TextStyle } from 'react-native';
import { formatMoney, type MoneySign } from '@/src/lib/money';
import { FONT } from '@/src/lib/font';

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
}: MoneyProps) {
  const resolvedTone: Exclude<MoneyTone, 'auto'> =
    tone === 'auto' ? (amount > 0 ? 'accent' : 'ink') : tone;

  const color = TONE_COLORS[resolvedTone];
  const formatted = formatMoney(amount, { sign });

  return (
    <Text
      className={className}
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
