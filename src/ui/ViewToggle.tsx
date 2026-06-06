import React from 'react';
import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from './PressableScale';
import { t, isRTL } from '../lib/i18n';
import { uiFontSemiBold } from '../lib/font';
import type { Locale, TxnType } from '../types';

export interface ViewToggleProps {
  value: TxnType;
  onChange: (v: TxnType) => void;
  locale: Locale;
}

/**
 * A small segmented pill that flips a screen between Expenses and Income.
 * Used on the dashboard and the transactions list (both default to expenses).
 */
export function ViewToggle({ value, onChange, locale }: ViewToggleProps) {
  const rtl = isRTL(locale);
  const segments: { key: TxnType; label: string }[] = [
    { key: 'expense', label: t('expense', locale) },
    { key: 'income', label: t('income', locale) },
  ];
  return (
    <View
      style={{
        flexDirection: rtl ? 'row-reverse' : 'row',
        alignSelf: 'center',
        backgroundColor: '#14191A',
        borderRadius: 999,
        padding: 4,
      }}
    >
      {segments.map((s) => {
        const active = s.key === value;
        return (
          <PressableScale
            key={s.key}
            testID={`view-toggle-${s.key}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(s.key);
            }}
            style={{
              paddingHorizontal: 22,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? 'rgba(43,217,142,0.16)' : 'transparent',
            }}
          >
            <Text
              style={{
                fontFamily: uiFontSemiBold(locale),
                fontSize: 14,
                color: active ? '#2BD98E' : '#A8B2AF',
              }}
            >
              {s.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
