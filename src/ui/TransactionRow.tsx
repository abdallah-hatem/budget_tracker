import React from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CategoryAvatar } from './CategoryAvatar';
import { Money } from './Money';
import { categoryLabel } from '@/src/features/transactions/display';
import { uiFont, uiFontSemiBold } from '@/src/lib/font';
import { isRTL } from '@/src/lib/i18n';
import type { Locale, Transaction } from '@/src/types';

export interface TransactionRowProps {
  txn: Transaction;
  locale: Locale;
  onPress?: PressableProps['onPress'];
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * TransactionRow — a single transaction line.
 * Layout: CategoryAvatar + (note-or-category title 16/semibold ink,
 * "category · time" 13 ink2) + right Money (income → accent with leading +,
 * expense → neutral ink, no sign).
 *
 * Row ~64pt, pressable with a 0.98 spring scale + selection haptic on press.
 */
export function TransactionRow({ txn, locale, onPress }: TransactionRowProps) {
  const rtl = isRTL(locale);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }

  async function handlePress(
    event: Parameters<NonNullable<PressableProps['onPress']>>[0],
  ) {
    await Haptics.selectionAsync();
    onPress?.(event);
  }

  const label = categoryLabel(txn.category_slug, locale);
  const title = txn.note && txn.note.trim().length > 0 ? txn.note : label;
  const time = formatTime(txn.occurred_at, locale);
  const meta = title === label ? time : `${label} · ${time}`;

  const isIncome = txn.type === 'income';

  return (
    <AnimatedPressable
      testID={`txn-row-${txn.id}`}
      onPress={onPress ? handlePress : undefined}
      onPressIn={onPress ? handlePressIn : undefined}
      onPressOut={onPress ? handlePressOut : undefined}
      disabled={!onPress}
      style={[
        animatedStyle,
        {
          flexDirection: rtl ? 'row-reverse' : 'row',
          alignItems: 'center',
          minHeight: 64,
          paddingVertical: 8,
        },
      ]}
    >
      <CategoryAvatar slug={txn.category_slug} />

      {/* Middle: title + meta */}
      <View
        style={{
          flex: 1,
          marginHorizontal: 12,
          alignItems: rtl ? 'flex-end' : 'flex-start',
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: uiFontSemiBold(locale),
            fontSize: 16,
            color: '#F4F7F5',
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: uiFont(locale),
            fontSize: 13,
            color: '#A8B2AF',
            marginTop: 2,
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {meta}
        </Text>
      </View>

      {/* Right: amount */}
      <Money
        amount={txn.amount}
        tone={isIncome ? 'accent' : 'ink'}
        sign={isIncome ? 'always' : 'none'}
        size={16}
      />
    </AnimatedPressable>
  );
}

/**
 * Render a short HH:MM time for the row meta. Always Western digits.
 */
function formatTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
      numberingSystem: 'latn',
    }).format(d);
  } catch {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
