import React from 'react';
import { Text, type PressableProps } from 'react-native';
import { FONT } from '@/src/lib/font';
import { PressableScale } from './PressableScale';

export interface PillProps {
  label: string;
  active?: boolean;
  onPress?: PressableProps['onPress'];
  testID?: string;
  /** Optional leading emoji/glyph shown before the label (kept as a separate node). */
  emoji?: string;
}

/**
 * Pill / Chip — rounded-full selectable filter chip.
 * Active: accentSoft background + accent text.
 * Inactive: surface background + ink2 text.
 */
export function Pill({ label, active = false, onPress, testID, emoji }: PillProps) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active
          ? 'rgba(43,217,142,0.16)' // accentSoft
          : '#14191A',              // surface
      }}
    >
      {emoji ? <Text style={{ fontSize: 13 }}>{emoji}</Text> : null}
      <Text
        style={{
          fontFamily: FONT.jakartaMd,
          fontSize: 14,
          color: active ? '#2BD98E' : '#A8B2AF',
        }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
