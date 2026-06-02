import React from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { splitMoney } from '@/src/lib/money';
import { FONT } from '@/src/lib/font';

export interface HeroProps {
  /** Small uppercase label above the number */
  label: string;
  /** The monetary amount to display */
  amount: number;
  /**
   * Optional delta as a percentage (e.g. 12.5 = +12.5%).
   * Positive → accent color with ▲, negative → danger with ▼.
   */
  delta?: number;
}

/**
 * Hero — the big balance display block.
 * Layout: tiny uppercase label → large split number (Sora 52 + E£ symbol + decimals at 28) → delta pill.
 */

// Real Unicode minus (U+2212)
const UNICODE_MINUS = '−';

// Muted style shared by the sign prefix and the currency symbol.
// Defined as a const with explicit TextStyle type so spread doesn't hit readonly issues.
const MUTED_STYLE: TextStyle = {
  fontFamily: FONT.sora,
  fontSize: 28,
  color: '#A8B2AF', // ink2
  lineHeight: 52,
  fontVariant: ['tabular-nums', 'lining-nums'],
  // Prevent bidi reordering on each muted glyph
  writingDirection: 'ltr',
};

export function Hero({ label, amount, delta }: HeroProps) {
  const { negative, symbol, integer, decimals } = splitMoney(amount);

  const deltaColor = delta !== undefined && delta >= 0 ? '#2BD98E' : '#FF5C6C';
  const deltaArrow = delta !== undefined && delta >= 0 ? '▲' : '▼';
  const deltaLabel =
    delta !== undefined ? `${deltaArrow} ${Math.abs(delta).toFixed(1)}%` : null;

  return (
    <View className="items-center">
      {/* Tiny uppercase label */}
      <Text
        style={{
          fontFamily: FONT.jakartaMd,
          fontSize: 12,
          color: '#6B7672',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </Text>

      {/* Big split number — flex-row, each Text guards its own bidi */}
      <View className="flex-row items-end">
        {/* Unicode minus prefix when net is negative — same muted ink2 treatment */}
        {negative && (
          <Text style={[MUTED_STYLE, { marginRight: 1 }]}>
            {UNICODE_MINUS}
          </Text>
        )}

        {/* E£ symbol — smaller, ink2 */}
        <Text style={[MUTED_STYLE, { marginRight: 2 }]}>
          {symbol}
        </Text>

        {/* Integer part — large, ink */}
        <Text
          style={{
            fontFamily: FONT.sora,
            fontSize: 52,
            color: '#F4F7F5',
            lineHeight: 60,
            fontVariant: ['tabular-nums', 'lining-nums'],
            writingDirection: 'ltr',
          }}
        >
          {integer}
        </Text>

        {/* Decimal part — smaller, ink2 */}
        <Text style={[MUTED_STYLE, { marginLeft: 1 }]}>
          .{decimals}
        </Text>
      </View>

      {/* Delta pill */}
      {deltaLabel !== null && (
        <View
          style={{
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: delta !== undefined && delta >= 0
              ? 'rgba(43,217,142,0.16)'
              : 'rgba(255,92,108,0.16)',
          }}
        >
          <Text
            style={{
              fontFamily: FONT.jakartaMd,
              fontSize: 13,
              color: deltaColor,
              fontVariant: ['tabular-nums', 'lining-nums'],
            }}
          >
            {deltaLabel}
          </Text>
        </View>
      )}
    </View>
  );
}
