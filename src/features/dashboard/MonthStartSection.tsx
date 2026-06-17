import React from 'react';
import { View, Pressable } from 'react-native';
import { CollapsibleCard, AppText } from '../../ui';
import { t, isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale } from '../../types';
import { useMonthStart } from './MonthStartProvider';

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1); // 1–28 (valid in every month)

/** Settings → Start of month: pick the day the budget month begins (e.g. salary day). */
export function MonthStartSection({ locale }: { locale: Locale }) {
  const rtl = isRTL(locale);
  const { startDay, setStartDay } = useMonthStart();

  return (
    <CollapsibleCard title={t('settings.month_start', locale)} rtl={rtl} testID="section-month-start">
      <AppText
        className="text-ink2"
        style={{ fontSize: 13, lineHeight: 19, marginBottom: 14, textAlign: rtl ? 'right' : 'left' }}
      >
        {t('settings.month_start_hint', locale)}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {DAYS.map((d) => {
          const active = d === startDay;
          return (
            <Pressable
              key={d}
              testID={`month-start-${d}`}
              onPress={() => setStartDay(d)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? '#2BD98E' : '#14191A',
              }}
            >
              <AppText
                weight={active ? 'semibold' : 'regular'}
                style={{ fontFamily: FONT.sora, fontSize: 14, color: active ? '#06251A' : '#A8B2AF' }}
              >
                {d}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </CollapsibleCard>
  );
}
