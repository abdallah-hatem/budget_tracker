import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { Screen, Card, AppText, Money, SpendingDonut, CategoryAvatar, ViewToggle, EmptyState } from '@/src/ui';
import { useSession } from '@/src/features/auth/SessionProvider';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { useRefetchOnTxnChange } from '@/src/features/sync/dataSync';
import { summarize } from '@/src/features/dashboard/summary';
import { MonthStartProvider, useMonthStart } from '@/src/features/dashboard/MonthStartProvider';
import { useAmountsHidden } from '@/src/features/privacy/useAmountsHidden';
import { categoryStyle } from '@/src/lib/categoryStyle';
import { categoryLabel } from '@/src/features/transactions/display';
import { formatMoneyCompact } from '@/src/lib/money';
import { t, isRTL } from '@/src/lib/i18n';
import { FONT } from '@/src/lib/font';
import type { Locale, TxnType } from '@/src/types';
import {
  RANGE_PRESETS,
  computeRange,
  monthlyBuckets,
  monthAbbr,
  type RangeKey,
} from '@/src/features/stats/statsRanges';

const SURFACE = '#14191A';
const OVERLAY = '#1C2322';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';
const DANGER = '#FF5C6C';

const RANGE_LABEL: Record<RangeKey, string> = {
  '1m': 'stats.range.1m',
  '3m': 'stats.range.3m',
  '6m': 'stats.range.6m',
  '1y': 'stats.range.1y',
  all: 'stats.range.all',
};

export default function StatisticsScreen() {
  // Mount the month-start provider locally: it only wraps the (tabs) group, and
  // this route lives on the root stack — so we'd otherwise get the default day.
  return (
    <MonthStartProvider>
      <StatisticsContent />
    </MonthStartProvider>
  );
}

function StatisticsContent() {
  const router = useRouter();
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const { startDay } = useMonthStart();

  const [range, setRange] = useState<RangeKey>('6m');
  const [type, setType] = useState<TxnType>('expense');

  const { from, to } = useMemo(() => computeRange(range, startDay), [range, startDay]);
  const filter = useMemo(
    () => ({ from, to, status: 'confirmed' as const }),
    [from, to],
  );
  const { data, loading, refresh } = useTransactions(filter);
  useRefetchOnTxnChange(refresh);

  const summary = useMemo(() => summarize(data), [data]);
  const byCategory = type === 'expense' ? summary.expenseByCategory : summary.incomeByCategory;
  const typeTotal = type === 'expense' ? summary.expense : summary.income;
  const buckets = useMemo(() => monthlyBuckets(data, startDay, type), [data, startDay, type]);

  const hasAny = summary.income > 0 || summary.expense > 0;
  const showLoader = loading && data.length === 0;

  return (
    <Screen scroll padded>
      <View style={{ direction: rtl ? 'rtl' : 'ltr' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 8,
            paddingTop: 6,
            paddingBottom: 18,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: SURFACE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name={rtl ? 'chevron-right' : 'chevron-left'} size={26} color={INK} />
          </Pressable>
          <AppText weight="bold" style={{ fontSize: 26, color: INK }}>
            {t('stats.title', locale)}
          </AppText>
        </View>

        {/* Range pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: 8,
            flexDirection: rtl ? 'row-reverse' : 'row',
            paddingVertical: 2,
          }}
        >
          {RANGE_PRESETS.map((p) => {
            const active = p.key === range;
            return (
              <Pressable
                key={p.key}
                onPress={() => setRange(p.key)}
                accessibilityRole="button"
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: active ? 'rgba(43,217,142,0.16)' : SURFACE,
                }}
              >
                <AppText
                  weight={active ? 'semibold' : 'regular'}
                  style={{ fontSize: 13.5, color: active ? ACCENT : INK2 }}
                >
                  {t(RANGE_LABEL[p.key], locale)}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Summary cards: income / expense / net */}
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10, marginTop: 16 }}>
          <SummaryCard label={t('income', locale)} amount={summary.income} tone="accent" />
          <SummaryCard label={t('expense', locale)} amount={summary.expense} tone="ink" />
          <SummaryCard
            label={t('stats.net', locale)}
            amount={summary.net}
            tone={summary.net < 0 ? 'danger' : 'accent'}
            signed
          />
        </View>

        {showLoader ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : !hasAny ? (
          <View style={{ paddingTop: 48 }}>
            <EmptyState emoji="📊" title={t('stats.empty', locale)} />
          </View>
        ) : (
          <>
            {/* Type toggle */}
            <View style={{ marginTop: 20, marginBottom: 4 }}>
              <ViewToggle value={type} onChange={setType} locale={locale} />
            </View>

            {/* Donut + legend */}
            <Card className="mt-4">
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <SpendingDonut
                  data={byCategory}
                  total={typeTotal}
                  locale={locale}
                  label={type === 'income' ? t('stats.earned', locale) : undefined}
                />
              </View>
              <Legend data={byCategory} total={typeTotal} locale={locale} rtl={rtl} />
            </Card>

            {/* Monthly trend */}
            {buckets.length >= 2 && (
              <Card className="mt-4">
                <AppText
                  weight="semibold"
                  style={{ fontSize: 14, color: INK, textAlign: rtl ? 'right' : 'left', marginBottom: 14 }}
                >
                  {t('stats.trend', locale)}
                </AppText>
                <TrendBars buckets={buckets} rtl={rtl} />
              </Card>
            )}

            {/* Category leaderboard */}
            <Card className="mt-4">
              <AppText
                weight="semibold"
                style={{ fontSize: 14, color: INK, textAlign: rtl ? 'right' : 'left', marginBottom: 12 }}
              >
                {t('by_category', locale)}
              </AppText>
              <View style={{ gap: 14 }}>
                {byCategory.map((c) => (
                  <CategoryRow
                    key={c.slug}
                    slug={c.slug}
                    total={c.total}
                    pct={typeTotal > 0 ? c.total / typeTotal : 0}
                    locale={locale}
                    rtl={rtl}
                  />
                ))}
              </View>
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  amount,
  tone,
  signed,
}: {
  label: string;
  amount: number;
  tone: 'accent' | 'ink' | 'danger';
  signed?: boolean;
}) {
  const color = tone === 'accent' ? ACCENT : tone === 'danger' ? DANGER : INK;
  return (
    <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 16, padding: 12, gap: 6 }}>
      <AppText style={{ fontSize: 11.5, color: INK3, letterSpacing: 0.3 }} numberOfLines={1}>
        {label}
      </AppText>
      <Money amount={amount} tone={tone === 'ink' ? 'ink' : 'accent'} sign={signed ? 'auto' : 'none'} size={16} style={{ color }} />
    </View>
  );
}

function Legend({
  data,
  total,
  locale,
  rtl,
}: {
  data: { slug: string; total: number }[];
  total: number;
  locale: Locale;
  rtl: boolean;
}) {
  // Match the donut: top 5 categories, remainder rolled into "Other".
  const top = data.filter((d) => d.total > 0).slice(0, 5);
  const restTotal = data.slice(5).reduce((s, d) => s + d.total, 0);
  const rows = [
    ...top.map((d) => ({ color: categoryStyle(d.slug).color, label: categoryLabel(d.slug, locale), total: d.total })),
    ...(restTotal > 0 ? [{ color: '#64748B', label: locale === 'ar' ? 'أخرى' : 'Other', total: restTotal }] : []),
  ];
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: 14, gap: 9 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: r.color }} />
          <AppText style={{ flex: 1, fontSize: 13.5, color: INK2, textAlign: rtl ? 'right' : 'left' }} numberOfLines={1}>
            {r.label}
          </AppText>
          <AppText style={{ fontSize: 12.5, color: INK3 }}>
            {total > 0 ? Math.round((r.total / total) * 100) : 0}%
          </AppText>
        </View>
      ))}
    </View>
  );
}

function TrendBars({ buckets, rtl }: { buckets: { key: { year: number; month: number }; total: number }[]; rtl: boolean }) {
  const { width: winW } = useWindowDimensions();
  const hidden = useAmountsHidden();
  // Card inner width ≈ screen − screen padding (40) − card padding (32).
  const chartW = Math.max(220, winW - 72);
  const n = buckets.length;
  const perBar = chartW / n;
  const spacing = Math.max(6, Math.min(16, Math.round(perBar * 0.36)));
  const barWidth = Math.max(10, Math.round(perBar - spacing));
  const showTopLabels = n <= 7 && !hidden;

  const barData = buckets.map((b) => ({
    value: b.total,
    label: monthAbbr(b.key),
    frontColor: ACCENT,
    topLabelComponent: showTopLabels
      ? () => (
          <AppText style={{ fontSize: 9, color: INK3, marginBottom: 3 }}>
            {formatMoneyCompact(b.total, { sign: 'none' }).replace('E£ ', '')}
          </AppText>
        )
      : undefined,
  }));

  return (
    <View style={{ direction: 'ltr' }}>
      <BarChart
        data={barData}
        width={chartW}
        height={150}
        barWidth={barWidth}
        spacing={spacing}
        initialSpacing={spacing}
        endSpacing={spacing}
        barBorderRadius={5}
        frontColor={ACCENT}
        hideRules
        yAxisThickness={0}
        xAxisThickness={0}
        hideYAxisText
        xAxisLabelTextStyle={{ color: INK3, fontSize: 10, fontFamily: FONT.jakartaMd }}
        noOfSections={3}
        isAnimated
        disableScroll
      />
    </View>
  );
}

function CategoryRow({
  slug,
  total,
  pct,
  locale,
  rtl,
}: {
  slug: string;
  total: number;
  pct: number;
  locale: Locale;
  rtl: boolean;
}) {
  const color = categoryStyle(slug).color;
  return (
    <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
      <CategoryAvatar slug={slug} size={36} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText weight="medium" style={{ fontSize: 14.5, color: INK, flex: 1, textAlign: rtl ? 'right' : 'left' }} numberOfLines={1}>
            {categoryLabel(slug, locale)}
          </AppText>
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
            <AppText style={{ fontSize: 12, color: INK3 }}>{Math.round(pct * 100)}%</AppText>
            <Money amount={total} tone="ink" sign="none" size={14} />
          </View>
        </View>
        {/* Progress track */}
        <View style={{ height: 6, borderRadius: 3, backgroundColor: OVERLAY, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${Math.max(3, Math.min(100, pct * 100))}%`,
              backgroundColor: color,
              borderRadius: 3,
              alignSelf: rtl ? 'flex-end' : 'flex-start',
            }}
          />
        </View>
      </View>
    </View>
  );
}
