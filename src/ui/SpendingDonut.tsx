import React from 'react';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { Money } from './Money';
import { categoryStyle } from '@/src/lib/categoryStyle';
import { FONT } from '@/src/lib/font';
import type { Locale } from '@/src/types';
import { Text } from 'react-native';

export interface SpendingDonutDatum {
  slug: string;
  total: number;
}

export interface SpendingDonutProps {
  data: SpendingDonutDatum[];
  /** Total spent (shown in the center). */
  total: number;
  locale: Locale;
}

const RADIUS = 96;
const INNER_RADIUS = 70; // ≈73% — thin ring
const SURFACE = '#14191A';
const OTHER_COLOR = '#64748B'; // muted slate for rolled-up "Other"
const GHOST = '#1C2322'; // overlay step for the empty ghost ring

/**
 * SpendingDonut — a thin emerald-system donut chart of category spend.
 *
 * Takes the top 5 categories by total and rolls the remainder into a single
 * muted "Other" slice (≤6 slices). Each slice is tinted with its
 * `categoryStyle(slug).color`. The center shows the total spent (Sora,
 * tabular) with a tiny uppercase "SPENT" label beneath it.
 *
 * With no data it renders a faint ghost ring and a muted hint instead.
 */
export function SpendingDonut({ data, total, locale }: SpendingDonutProps) {
  const slices = buildSlices(data);
  const hasData = slices.length > 0 && total > 0;

  const spentLabel = locale === 'ar' ? 'المصروف' : 'SPENT';
  const emptyHint = locale === 'ar' ? 'لا مصروفات' : 'No spend';

  if (!hasData) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <PieChart
          data={[{ value: 1, color: GHOST }]}
          donut
          radius={RADIUS}
          innerRadius={INNER_RADIUS}
          innerCircleColor={SURFACE}
          strokeColor={SURFACE}
          strokeWidth={2}
          centerLabelComponent={() => (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 26 }}>📊</Text>
              <Text
                style={{
                  fontFamily: FONT.jakartaMd,
                  fontSize: 11,
                  color: '#6B7672',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginTop: 4,
                }}
              >
                {emptyHint}
              </Text>
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <PieChart
        data={slices}
        donut
        radius={RADIUS}
        innerRadius={INNER_RADIUS}
        innerCircleColor={SURFACE}
        strokeColor={SURFACE}
        strokeWidth={2}
        centerLabelComponent={() => (
          <View style={{ alignItems: 'center' }}>
            <Money amount={total} tone="ink" sign="none" size={26} />
            <Text
              style={{
                fontFamily: FONT.jakartaMd,
                fontSize: 11,
                color: '#6B7672',
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {spentLabel}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

/**
 * Build ≤6 pie slices: top 5 categories by total + a rolled-up "Other".
 */
function buildSlices(
  data: SpendingDonutDatum[],
): { value: number; color: string }[] {
  const positive = data.filter((d) => d.total > 0);
  const sorted = [...positive].sort((a, b) => b.total - a.total);

  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  const slices = top.map((d) => ({
    value: d.total,
    color: categoryStyle(d.slug).color,
  }));

  const otherTotal = rest.reduce((sum, d) => sum + d.total, 0);
  if (otherTotal > 0) {
    slices.push({ value: otherTotal, color: OTHER_COLOR });
  }

  return slices;
}
