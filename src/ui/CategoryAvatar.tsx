import React from 'react';
import { Text, View } from 'react-native';
import { categoryStyle } from '@/src/lib/categoryStyle';

export interface CategoryAvatarProps {
  /** Category slug (e.g. 'food', 'transport') */
  slug: string;
  /** Size of the tile in points (default 40) */
  size?: number;
}

/**
 * CategoryAvatar — 40×40 (default) rounded-14 tile.
 * Background is the category color at 14% opacity; emoji is centered.
 */
export function CategoryAvatar({ slug, size = 40 }: CategoryAvatarProps) {
  const { emoji, color } = categoryStyle(slug);

  // Parse hex color and apply 14% opacity
  const bgColor = hexToRgba(color, 0.14);
  const radius = Math.round(size * 0.35); // ~14px at size=40, scales proportionally

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

/**
 * Convert a hex color string to an rgba string with the given opacity.
 */
function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
