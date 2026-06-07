import React from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { FONT } from '../lib/font';
import { isRTL } from '../lib/i18n';
import type { Locale } from '../types';

const SURFACE = '#14191A';
const INK = '#F4F7F5';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';

function fieldLabelStyle(rtl: boolean) {
  return {
    fontFamily: FONT.jakartaMd,
    fontSize: 12,
    color: INK3,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    textAlign: (rtl ? 'right' : 'left') as 'right' | 'left',
  };
}

/** Human label like "Tue, 7 Jun 2026, 2:30 PM" (used for the Android trigger). */
export function formatWhen(date: Date, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      numberingSystem: 'latn',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Labeled date + time field. On iOS it's the native compact inline picker (dark,
 * accent-tinted); on Android it taps through the date then time dialogs. The
 * value is a Date; the caller serializes (e.g. `.toISOString()`).
 */
export function DateTimeField({
  label,
  value,
  onChange,
  locale,
  testID = 'when-field',
  maximumDate,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  locale: Locale;
  testID?: string;
  maximumDate?: Date;
}) {
  const rtl = isRTL(locale);

  if (Platform.OS === 'ios') {
    return (
      <View style={{ gap: 6 }}>
        <Text style={fieldLabelStyle(rtl)}>{label}</Text>
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            backgroundColor: SURFACE,
            borderRadius: 14,
            paddingHorizontal: 10,
            paddingVertical: 8,
            minHeight: 52,
          }}
        >
          <DateTimePicker
            testID={testID}
            value={value}
            mode="datetime"
            display="compact"
            themeVariant="dark"
            accentColor={ACCENT}
            locale={locale === 'ar' ? 'ar-EG' : 'en-US'}
            maximumDate={maximumDate}
            onChange={(_e: DateTimePickerEvent, d?: Date) => {
              if (d) onChange(d);
            }}
          />
        </View>
      </View>
    );
  }

  // Android — open the date dialog, then the time dialog.
  function openAndroid() {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      maximumDate,
      onChange: (_e, picked) => {
        if (!picked) return;
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          onChange: (_e2, withTime) => onChange(withTime ?? picked),
        });
      },
    });
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={fieldLabelStyle(rtl)}>{label}</Text>
      <Pressable
        testID={testID}
        onPress={openAndroid}
        style={{ backgroundColor: SURFACE, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 15, color: INK, textAlign: rtl ? 'right' : 'left' }}>
          {formatWhen(value, locale)}
        </Text>
      </Pressable>
    </View>
  );
}
