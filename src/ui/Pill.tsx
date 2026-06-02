import React from 'react';
import { Pressable, Text, type PressableProps } from 'react-native';
import { FONT } from '@/src/lib/font';

export interface PillProps {
  label: string;
  active?: boolean;
  onPress?: PressableProps['onPress'];
}

/**
 * Pill / Chip — rounded-full selectable filter chip.
 * Active: accentSoft background + accent text.
 * Inactive: surface background + ink2 text.
 */
export function Pill({ label, active = false, onPress }: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active
          ? 'rgba(43,217,142,0.16)' // accentSoft
          : '#14191A',              // surface
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: FONT.jakartaMd,
          fontSize: 14,
          color: active ? '#2BD98E' : '#A8B2AF',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
