import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FONT } from '@/src/lib/font';

export interface EmptyStateProps {
  /** Emoji or short string to display in the soft accent circle */
  emoji?: string;
  title: string;
  subtitle?: string;
  /** Optional CTA button */
  cta?: {
    label: string;
    onPress: () => void;
  };
}

/**
 * EmptyState — centered empty content placeholder.
 * Soft accent circle with emoji/icon, headline, optional subtitle + CTA.
 */
export function EmptyState({ emoji = '🌿', title, subtitle, cta }: EmptyStateProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
      }}
    >
      {/* Soft accent circle */}
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: 'rgba(43,217,142,0.16)', // accentSoft
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Text style={{ fontSize: 36 }}>{emoji}</Text>
      </View>

      {/* Title */}
      <Text
        style={{
          fontFamily: FONT.jakartaSb,
          fontSize: 18,
          color: '#F4F7F5',
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        {title}
      </Text>

      {/* Optional subtitle */}
      {subtitle !== undefined && (
        <Text
          style={{
            fontFamily: FONT.jakarta,
            fontSize: 14,
            color: '#A8B2AF',
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 24,
          }}
        >
          {subtitle}
        </Text>
      )}

      {/* Optional CTA */}
      {cta !== undefined && (
        <Pressable
          onPress={cta.onPress}
          style={({ pressed }) => ({
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: pressed ? '#1FB877' : '#2BD98E',
          })}
        >
          <Text
            style={{
              fontFamily: FONT.jakartaSb,
              fontSize: 15,
              color: '#06251A',
            }}
          >
            {cta.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
