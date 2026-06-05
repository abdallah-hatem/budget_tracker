import React from 'react';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { formatMoneyCompact } from '@/src/lib/money';
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
// Usable width inside the inner circle (diameter − padding) the center number
// must fit within. adjustsFontSizeToFit shrinks the number to this on overflow.
const CENTER_WIDTH = INNER_RADIUS * 2 - 24;
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
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: CENTER_WIDTH,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={{
                fontFamily: FONT.soraSb,
                fontSize: 26,
                lineHeight: 30,
                color: '#F4F7F5',
                fontVariant: ['tabular-nums', 'lining-nums'],
                writingDirection: 'ltr',
                textAlign: 'center',
              }}
            >
              {formatMoneyCompact(total, { sign: 'none' })}
            </Text>
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
