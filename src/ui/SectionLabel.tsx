import React from 'react';
import { Text } from 'react-native';
import { FONT } from '@/src/lib/font';

export interface SectionLabelProps {
  children: React.ReactNode;
}

/**
 * SectionLabel — 12px uppercase tracked tertiary label.
 * Used for section headers (e.g. "BY CATEGORY", "RECENT").
 */
export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <Text
      style={{
        fontFamily: FONT.jakartaMd,
        fontSize: 12,
        color: '#6B7672',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}
