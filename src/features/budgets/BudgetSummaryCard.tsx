import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card, AppText, Money, CategoryAvatar, PressableScale, SectionLabel } from '@/src/ui';
import { useBudgets } from './useBudgets';
import { atRisk } from './progress';
import { categoryLabel } from '@/src/features/transactions/display';
import { t, isRTL } from '@/src/lib/i18n';
import { FONT } from '@/src/lib/font';
import type { Locale } from '@/src/types';
import type { BudgetProgress } from './types';

const OVERLAY = '#1C2322';
const INK = '#F4F7F5';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';
const DANGER = '#FF5C6C';

const TONE_COLOR: Record<BudgetProgress['tone'], string> = {
  ok: '#2BD98E',
  warn: '#F5B841',
  over: '#FF5C6C',
};

/**
 * BudgetSummaryCard — glanceable dashboard surface for budgets.
 *
 * Shows the overall budget's bar (if one exists) plus `atRisk(progress, 2)`
 * rows — the same tone colors and clamped-width bar markup as the Budgets
 * screen (Task 9). If that leaves nothing to show (no overall budget and
 * nothing at risk), falls back to the user's most-used budgets — highest
 * `pct` first, up to 2 — so a healthy user still sees their bars sitting
 * comfortably in green instead of the card vanishing. Renders NOTHING only
 * when the user has no budgets at all, and nothing while still loading, so it
 * never flashes an empty card for someone who has never set a budget.
 * The whole card is tappable through to `/budgets`.
 */
export function BudgetSummaryCard({ locale }: { locale: Locale }) {
  const router = useRouter();
  const rtl = isRTL(locale);
  const rowDir = rtl ? 'row-reverse' : 'row';

  const { progress, loading, refresh } = useBudgets();

  // Re-evaluate spend every time the dashboard regains focus (e.g. after
  // recording a transaction), so this card never sits frozen at its
  // first-mount values — matching the useMonthSummary/useAccountBalances
  // refresh-on-focus pattern used elsewhere on the dashboard.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // No flash of empty state: bail out before anything renders while loading,
  // and render nothing at all for a user who has never set a budget.
  if (loading || progress.length === 0) return null;

  const overall = progress.find((p) => p.budget.scope === 'overall');
  // Exclude the overall budget from the non-overall pool so it's never shown
  // twice (once as the pinned overall row, again inside the worst-first list
  // or the most-used fallback below).
  const others = progress.filter((p) => p.budget.id !== overall?.budget.id);
  const risk = atRisk(others, 2);
  let rows = overall ? [overall, ...risk] : risk;

  // Nothing at risk and no overall budget: the user is doing fine, don't
  // vanish the card — show their most-used budgets instead, tone and all.
  if (rows.length === 0) {
    rows = [...others].sort((a, b) => b.pct - a.pct).slice(0, 2);
  }

  return (
    <PressableScale
      testID="budget-summary-card"
      accessibilityRole="button"
      onPress={() => router.push('/budgets' as Href)}
      style={{ marginBottom: 28 }}
    >
      <Card>
        <View
          style={{
            flexDirection: rowDir,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <SectionLabel>{t('budgets.section', locale)}</SectionLabel>
          <MaterialCommunityIcons name={rtl ? 'chevron-left' : 'chevron-right'} size={18} color={INK3} />
        </View>
        <View style={{ gap: 16 }}>
          {rows.map((p) => (
            <SummaryRow key={p.budget.id} progress={p} locale={locale} rtl={rtl} />
          ))}
        </View>
      </Card>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------

/** "Overall" tile — matches CategoryAvatar's look (mirrors app/budgets.tsx). */
function OverallAvatar({ size = 36 }: { size?: number }) {
  const radius = Math.round(size * 0.35);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: 'rgba(43,217,142,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name="chart-donut" size={Math.round(size * 0.55)} color={ACCENT} />
    </View>
  );
}

function SummaryRow({
  progress,
  locale,
  rtl,
}: {
  progress: BudgetProgress;
  locale: Locale;
  rtl: boolean;
}) {
  const rowDir = rtl ? 'row-reverse' : 'row';
  const align: 'left' | 'right' = rtl ? 'right' : 'left';
  const { budget, spent, remaining, pct, tone } = progress;
  const label =
    budget.scope === 'overall'
      ? t('budgets.overall', locale)
      : categoryLabel(budget.category_slug ?? '', locale);
  const barColor = TONE_COLOR[tone];

  return (
    <View
      testID={`budget-summary-row-${budget.id}`}
      style={{ flexDirection: rowDir, alignItems: 'flex-start', gap: 10 }}
    >
      {budget.scope === 'overall' ? (
        <OverallAvatar />
      ) : (
        <CategoryAvatar slug={budget.category_slug ?? ''} size={36} />
      )}
      <View style={{ flex: 1, gap: 8 }}>
        <AppText
          weight="semibold"
          numberOfLines={1}
          style={{ fontSize: 14, color: INK, textAlign: align }}
        >
          {label}
        </AppText>

        {/* Progress track — filled width is clamped so an overspent bar never overflows */}
        <View style={{ height: 8, borderRadius: 4, backgroundColor: OVERLAY, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${Math.min(100, pct)}%`,
              backgroundColor: barColor,
              borderRadius: 4,
              alignSelf: rtl ? 'flex-end' : 'flex-start',
            }}
          />
        </View>

        {/* Stacked, not side-by-side: four money elements collide and overflow
            once EGP amounts reach thousands. */}
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 4 }}>
            <Money amount={spent} tone="ink" sign="none" size={12.5} numberOfLines={1} />
            <Text
              style={{ fontFamily: FONT.jakartaMd, fontSize: 11.5, color: INK3 }}
              numberOfLines={1}
            >
              {t('budgets.spentOf', locale)}
            </Text>
            <Money
              amount={budget.amount}
              tone="ink2"
              sign="none"
              size={12.5}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            />
          </View>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 4 }}>
            <Money
              amount={tone === 'over' ? Math.max(0, spent - budget.amount) : remaining}
              tone="ink2"
              sign="none"
              size={11.5}
              numberOfLines={1}
            />
            <Text
              style={{ fontFamily: FONT.jakartaMd, fontSize: 11.5, color: tone === 'over' ? DANGER : INK3 }}
              numberOfLines={1}
            >
              {t(tone === 'over' ? 'budgets.over' : 'budgets.remaining', locale)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
