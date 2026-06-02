import React from 'react';
import { Text, View } from 'react-native';
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
export function Hero({ label, amount, delta }: HeroProps) {
  const { symbol, integer, decimals } = splitMoney(amount);

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

      {/* Big split number */}
      <View className="flex-row items-end">
        {/* E£ symbol — smaller, ink2 */}
        <Text
          style={{
            fontFamily: FONT.sora,
            fontSize: 28,
            color: '#A8B2AF',
            lineHeight: 52,
            fontVariant: ['tabular-nums', 'lining-nums'],
            marginRight: 2,
          }}
        >
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
          }}
        >
          {integer}
        </Text>

        {/* Decimal part — smaller, ink2 */}
        <Text
          style={{
            fontFamily: FONT.sora,
            fontSize: 28,
            color: '#A8B2AF',
            lineHeight: 52,
            fontVariant: ['tabular-nums', 'lining-nums'],
            marginLeft: 1,
          }}
        >
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
