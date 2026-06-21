import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/ui/Screen';
import { Card } from '../../src/ui/Card';
import { Hero } from '../../src/ui/Hero';
import { Money } from '../../src/ui/Money';
import { SectionLabel } from '../../src/ui/SectionLabel';
import { CategoryAvatar } from '../../src/ui/CategoryAvatar';
import { SpendingDonut } from '../../src/ui/SpendingDonut';
import { TransactionRow } from '../../src/ui/TransactionRow';
import { EmptyState } from '../../src/ui/EmptyState';
import { PressableScale } from '../../src/ui/PressableScale';
import { ViewToggle } from '../../src/ui/ViewToggle';
import { MonthPicker } from '../../src/ui/MonthPicker';
import { useMonthSummary } from '../../src/features/dashboard/useMonthSummary';
import { useTabPreload } from '../../src/hooks/useTabPreload';
import { useAccountBalances } from '../../src/features/accounts/useAccountBalances';
import { useRefetchOnTxnChange } from '../../src/features/sync/dataSync';
import { useSession } from '../../src/features/auth/SessionProvider';
import { categoryLabel } from '../../src/features/transactions/display';
import { categoryStyle } from '../../src/lib/categoryStyle';
import { categoryBySlug } from '../../src/lib/categories';
import { useHiddenCategories } from '../../src/features/categories/HiddenCategoriesProvider';
import { useCategoriesVersion } from '../../src/features/categories/useCategoriesVersion';
import { t, isRTL } from '../../src/lib/i18n';
import { FONT, uiFontSemiBold } from '../../src/lib/font';
import type { Locale, TxnType } from '../../src/types';

const MONTH_LABELS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_LABELS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function monthLabel(month: number, locale: Locale): string {
  return locale === 'ar' ? MONTH_LABELS_AR[month] : MONTH_LABELS_EN[month];
}

/** Wraps a dashboard section in a staggered fade + rise reveal. */
function Reveal({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360, delay: index * 60 }}
    >
      {children}
    </MotiView>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';

  // Re-render the breakdown once the user's custom categories finish loading,
  // so custom slugs resolve to their name/icon instead of the raw "c_…" fallback.
  useCategoriesVersion();

  // Warm sibling tabs in the background after the dashboard is interactive, so
  // the first switch to each isn't janky (they're lazy-mounted by default).
  // NOTE: Transactions is intentionally NOT preloaded — preloading mounts it
  // before custom categories load, which froze its category filter on the
  // built-ins-only list. Lazy-mounting it lets the filter read the loaded
  // registry on first open (like the add-entry picker does).
  useTabPreload(['settings', 'pending']);

  const { monthKey, summary, transactions, loading, prevMonth, nextMonth, goToMonth, refresh } =
    useMonthSummary();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { accounts, total: accountsTotal, refresh: refreshAccounts } = useAccountBalances();

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshAccounts();
    }, [refresh, refreshAccounts]),
  );

  // Capture floats over this tab as a modal, so adding/editing an entry never
  // blurs it — refetch explicitly when a transaction changes anywhere.
  useRefetchOnTxnChange(
    useCallback(() => {
      void refresh();
      void refreshAccounts();
    }, [refresh, refreshAccounts]),
  );

  const recent = transactions.slice(0, 5);
  const hasData = transactions.length > 0;

  // Expenses by default; a small toggle flips the whole view to income.
  const [view, setView] = useState<TxnType>('expense');
  const isIncome = view === 'income';
  const breakdown = isIncome ? summary.incomeByCategory : summary.expenseByCategory;
  const viewTotal = isIncome ? summary.income : summary.expense;

  // Category rows (already sorted desc) with a max for progress-bar scaling.
  const categoryRows = breakdown;
  const maxTotal = categoryRows.reduce((m, r) => Math.max(m, r.total), 0);

  // Long-press a category to hide it from Home; hidden ones can be restored from
  // the small footer below the breakdown.
  const { hidden, toggle: toggleHidden } = useHiddenCategories();
  const hiddenForView = [...hidden].filter(
    (slug) => (categoryBySlug(slug)?.kind ?? 'expense') === view,
  );
  const confirmHide = useCallback(
    (slug: string, label: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert(label, t('cat.hideHomePrompt', locale), [
        { text: t('cancel', locale), style: 'cancel' },
        { text: t('cat.hide', locale), style: 'destructive', onPress: () => toggleHidden(slug) },
      ]);
    },
    [locale, toggleHidden],
  );

  function handleMonthStep(step: () => void) {
    void Haptics.selectionAsync();
    step();
  }

  function goToTransactions() {
    router.navigate('/(tabs)/transactions');
  }

  let revealIndex = 0;

  return (
    <Screen scroll>
      <View style={{ direction: dir }}>
        {/* ── Month navigator ─────────────────────────────────────────── */}
        <Reveal index={revealIndex++}>
          <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
            <View
              style={{
                // Force a stable LTR layout: ‹ = previous (left), › = next (right)
                // in both languages (the RTL row-reverse + glyph swap pointed wrong).
                direction: 'ltr',
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#14191A',
                borderRadius: 999,
                paddingHorizontal: 6,
                paddingVertical: 4,
              }}
            >
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('prev_month', locale)}
                onPress={() => handleMonthStep(prevMonth)}
                hitSlop={8}
                style={{ width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.sora, fontSize: 18, color: '#A8B2AF' }}>‹</Text>
              </PressableScale>

              {/* Tap the month to jump to any month/year */}
              <PressableScale
                testID="month-nav-label"
                accessibilityRole="button"
                onPress={() => setPickerOpen(true)}
                hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 }}
              >
                <Text
                  style={{
                    fontFamily: uiFontSemiBold(locale),
                    fontSize: 15,
                    color: '#F4F7F5',
                    minWidth: 112,
                    textAlign: 'center',
                  }}
                >
                  {monthLabel(monthKey.month, locale)} {monthKey.year}
                </Text>
                <Ionicons name="chevron-down" size={14} color="#A8B2AF" />
              </PressableScale>

              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('next_month', locale)}
                onPress={() => handleMonthStep(nextMonth)}
                hitSlop={8}
                style={{ width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.sora, fontSize: 18, color: '#A8B2AF' }}>›</Text>
              </PressableScale>
            </View>
          </View>
        </Reveal>

        <MonthPicker
          visible={pickerOpen}
          value={monthKey}
          onSelect={(m) => {
            goToMonth(m);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
          locale={locale}
        />

        {/* ── View toggle: Expenses | Income ─────────────────────────── */}
        <Reveal index={revealIndex++}>
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <ViewToggle value={view} onChange={setView} locale={locale} />
          </View>
        </Reveal>

        {/* ── Hero: total for the selected view ──────────────────────── */}
        <Reveal index={revealIndex++}>
          <View style={{ marginBottom: 28 }}>
            <Hero
              label={t(isIncome ? 'income_this_month' : 'spent_this_month', locale)}
              amount={viewTotal}
            />
          </View>
        </Reveal>

        {/* ── Accounts: live balances (all-time, not month-filtered) ──── */}
        {accounts.length > 0 && (
          <Reveal index={revealIndex++}>
            <Card style={{ marginBottom: 28 }}>
              <SectionLabel>{t('accounts.title', locale)}</SectionLabel>
              <View style={{ marginTop: 12, gap: 10 }}>
                {accounts.map((a) => (
                  <View
                    key={a.id}
                    testID={`account-card-${a.id}`}
                    style={{
                      flexDirection: rtl ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: uiFontSemiBold(locale),
                        fontSize: 15,
                        color: a.is_default ? '#F4F7F5' : '#A8B2AF',
                      }}
                    >
                      {a.name}
                      {a.is_default ? '  •' : ''}
                    </Text>
                    <Money amount={a.balance} tone="ink" sign="auto" size={16} />
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: rtl ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTopWidth: 1,
                    borderTopColor: '#1C2322',
                    paddingTop: 10,
                    marginTop: 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: uiFontSemiBold(locale),
                      fontSize: 12,
                      color: '#6B7672',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    {t('accounts.total', locale)}
                  </Text>
                  <Money testID="accounts-total" amount={accountsTotal} tone="accent" sign="auto" size={18} />
                </View>
              </View>
            </Card>
          </Reveal>
        )}

        {!hasData && !loading ? (
          /* ── Empty state ──────────────────────────────────────────── */
          <Reveal index={revealIndex++}>
            <View style={{ paddingVertical: 40 }}>
              <EmptyState
                emoji="📊"
                title={
                  locale === 'ar'
                    ? 'لا مصروفات هذا الشهر'
                    : 'No spending yet this month'
                }
                subtitle={
                  locale === 'ar'
                    ? 'أضف أول معاملة لترى ملخصك هنا.'
                    : 'Add your first transaction to see your summary here.'
                }
              />
            </View>
          </Reveal>
        ) : (
          <>
            {/* ── Spending donut ───────────────────────────────────── */}
            <Reveal index={revealIndex++}>
              <View style={{ alignItems: 'center', marginBottom: 28 }}>
                <SpendingDonut
                  data={breakdown}
                  total={viewTotal}
                  locale={locale}
                  label={isIncome ? t('earned_caption', locale) : undefined}
                  emptyHint={isIncome ? t('no_income', locale) : undefined}
                />
              </View>
            </Reveal>

            {/* ── By category ──────────────────────────────────────── */}
            {(categoryRows.length > 0 || hiddenForView.length > 0) && (
              <Reveal index={revealIndex++}>
                <Card className="mb-7">
                  <SectionLabel>{t('by_category', locale)}</SectionLabel>
                  <View style={{ marginTop: 14, gap: 16 }}>
                    {categoryRows.map((row) => {
                      const color = categoryStyle(row.slug).color;
                      const pct = maxTotal > 0 ? row.total / maxTotal : 0;
                      return (
                        <Pressable
                          key={row.slug}
                          onLongPress={() => confirmHide(row.slug, categoryLabel(row.slug, locale))}
                          delayLongPress={300}
                        >
                          <View
                            style={{
                              flexDirection: rtl ? 'row-reverse' : 'row',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
                            <CategoryAvatar slug={row.slug} size={32} />
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontFamily: uiFontSemiBold(locale),
                                fontSize: 15,
                                color: '#F4F7F5',
                                textAlign: rtl ? 'right' : 'left',
                              }}
                            >
                              {categoryLabel(row.slug, locale)}
                            </Text>
                            <Money amount={row.total} tone="ink" sign="none" size={15} />
                          </View>
                          {/* Progress bar */}
                          <View
                            style={{
                              height: 4,
                              borderRadius: 999,
                              backgroundColor: '#1C2322',
                              marginTop: 8,
                              overflow: 'hidden',
                            }}
                          >
                            <View
                              style={{
                                width: `${Math.max(pct * 100, 4)}%`,
                                height: '100%',
                                borderRadius: 999,
                                backgroundColor: color,
                                alignSelf: rtl ? 'flex-end' : 'flex-start',
                              }}
                            />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Hidden-from-home footer: tap a chip to restore it. */}
                  {hiddenForView.length > 0 && (
                    <View
                      style={{
                        flexDirection: rtl ? 'row-reverse' : 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 18,
                        paddingTop: 14,
                        borderTopWidth: 1,
                        borderTopColor: '#1C2322',
                      }}
                    >
                      <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 11, color: '#6B7672' }}>
                        {t('cat.hidden', locale)}
                      </Text>
                      {hiddenForView.map((slug) => (
                        <Pressable
                          key={slug}
                          onPress={() => toggleHidden(slug)}
                          hitSlop={6}
                          style={{
                            flexDirection: rtl ? 'row-reverse' : 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            backgroundColor: '#14191A',
                            borderRadius: 999,
                            opacity: 0.6,
                          }}
                        >
                          <CategoryAvatar slug={slug} size={18} />
                          <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 12, color: '#A8B2AF' }}>
                            {categoryLabel(slug, locale)}
                          </Text>
                          <Ionicons name="eye-off-outline" size={13} color="#6B7672" />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Card>
              </Reveal>
            )}

            {/* ── Recent ───────────────────────────────────────────── */}
            <Reveal index={revealIndex++}>
              <View>
                <View
                  style={{
                    flexDirection: rtl ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <SectionLabel>{t('recent', locale)}</SectionLabel>
                  <Pressable onPress={goToTransactions} hitSlop={8}>
                    <Text
                      style={{
                        fontFamily: uiFontSemiBold(locale),
                        fontSize: 13,
                        color: '#2BD98E',
                      }}
                    >
                      {locale === 'ar' ? 'عرض الكل' : 'See all'}
                    </Text>
                  </Pressable>
                </View>

                <Card>
                  {recent.map((txn, i) => (
                    <View key={txn.id}>
                      {i > 0 && (
                        <View
                          style={{
                            height: 1,
                            backgroundColor: 'rgba(42,51,49,0.4)',
                          }}
                        />
                      )}
                      <TransactionRow
                        txn={txn}
                        locale={locale}
                        onPress={goToTransactions}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            </Reveal>
          </>
        )}
      </View>
    </Screen>
  );
}
