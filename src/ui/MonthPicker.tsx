import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';
import { FONT } from '../lib/font';
import { currentMonthKey, type MonthKey } from '../features/dashboard/monthRange';
import type { Locale } from '../types';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const SURFACE = '#14191A';
const SHEET = '#1C2322';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const ACCENT = '#2BD98E';
const ON_ACCENT = '#06251A';

/**
 * Bottom-sheet month picker: jump straight to any month/year instead of stepping
 * one at a time. Year stepper + a 12-month grid + a "This month" shortcut. The
 * layout is LTR-stable (months read Jan→Dec) regardless of locale; only the
 * labels are localized.
 */
export function MonthPicker({
  visible,
  value,
  onSelect,
  onClose,
  locale,
}: {
  visible: boolean;
  value: MonthKey;
  onSelect: (m: MonthKey) => void;
  onClose: () => void;
  locale: Locale;
}) {
  const insets = useSafeAreaInsets();
  const months = locale === 'ar' ? MONTHS_AR : MONTHS_EN;
  const labelFont = locale === 'ar' ? FONT.readexMd : FONT.jakartaMd;
  const [year, setYear] = useState(value.year);

  // Show the selected month's year whenever the sheet opens.
  useEffect(() => {
    if (visible) setYear(value.year);
  }, [visible, value.year]);

  const now = currentMonthKey();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: SHEET,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: 20 + insets.bottom,
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A3331' }} />
          </View>

          {/* Year stepper — ‹ previous · next › (stable LTR) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
            <PressableScale
              testID="month-picker-prev-year"
              accessibilityRole="button"
              accessibilityLabel="Previous year"
              onPress={() => setYear((y) => y - 1)}
              hitSlop={8}
              style={yearBtn}
            >
              <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 20, color: INK2 }}>‹</Text>
            </PressableScale>
            <Text style={{ fontFamily: FONT.soraSb, fontSize: 18, color: INK, minWidth: 72, textAlign: 'center' }}>
              {year}
            </Text>
            <PressableScale
              testID="month-picker-next-year"
              accessibilityRole="button"
              accessibilityLabel="Next year"
              onPress={() => setYear((y) => y + 1)}
              hitSlop={8}
              style={yearBtn}
            >
              <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 20, color: INK2 }}>›</Text>
            </PressableScale>
          </View>

          {/* 12-month grid (3 per row) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
            {months.map((m, i) => {
              const selected = year === value.year && i === value.month;
              const isNow = year === now.year && i === now.month;
              return (
                <PressableScale
                  key={i}
                  testID={`month-picker-${year}-${i}`}
                  onPress={() => onSelect({ year, month: i })}
                  style={{
                    width: '31%',
                    paddingVertical: 12,
                    borderRadius: 14,
                    alignItems: 'center',
                    backgroundColor: selected ? ACCENT : SURFACE,
                    borderWidth: 1,
                    borderColor: selected ? ACCENT : isNow ? 'rgba(43,217,142,0.45)' : 'transparent',
                  }}
                >
                  <Text style={{ fontFamily: labelFont, fontSize: 14, color: selected ? ON_ACCENT : INK }}>
                    {m}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* Jump to the current month */}
          <PressableScale
            testID="month-picker-today"
            onPress={() => onSelect(now)}
            style={{ marginTop: 18, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(43,217,142,0.12)' }}
          >
            <Text style={{ fontFamily: locale === 'ar' ? FONT.readexSb : FONT.jakartaSb, fontSize: 14, color: ACCENT }}>
              {locale === 'ar' ? 'هذا الشهر' : 'This month'}
            </Text>
          </PressableScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const yearBtn = {
  width: 36,
  height: 36,
  borderRadius: 999,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: SURFACE,
};
