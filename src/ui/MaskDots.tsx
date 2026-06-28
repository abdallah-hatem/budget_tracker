import React from 'react';
import { View, type ViewStyle } from 'react-native';

export interface MaskDotsProps {
  /** Reference font size of the amount being masked — dots scale off this. */
  size: number;
  /** Dot color (matches the text tone it replaces). */
  color: string;
  /** Number of dots (default 4). */
  count?: number;
  style?: ViewStyle;
}

/**
 * MaskDots — a row of small filled circles used to mask a monetary amount when
 * the privacy toggle is on. Drawn as Views rather than a text glyph (•/*) so it
 * renders identically in every font (the Sora number font has no bullet glyph)
 * and stays vertically centered and correctly sized at any scale.
 */
export function MaskDots({ size, color, count = 4, style }: MaskDotsProps) {
  const d = Math.max(3, Math.round(size * 0.3));
  const gap = Math.max(2, Math.round(d * 0.6));
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center' }, style]}
      accessibilityLabel="hidden amount"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: color,
            marginLeft: i === 0 ? 0 : gap,
          }}
        />
      ))}
    </View>
  );
}
