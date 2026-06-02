import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTransactions } from '../../src/features/transactions/useTransactions';
import { EditTransactionSheet } from '../../src/features/transactions/EditTransactionSheet';
import { categoryLabel } from '../../src/features/transactions/display';
import { CATEGORIES } from '../../src/lib/categories';
import { useSession } from '../../src/features/auth/SessionProvider';
import { monthRange, addMonth, currentMonthKey, type MonthKey } from '../../src/features/dashboard/monthRange';
import { t, isRTL } from '../../src/lib/i18n';
import { Screen, Pill, EmptyState, TransactionRow, Money } from '../../src/ui';
import { TAB_BAR_CLEARANCE } from '../../src/ui/FloatingTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT } from '../../src/lib/font';
import type { Transaction, Locale } from '../../src/types';

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

/** Group a flat transaction array by calendar day (YYYY-MM-DD strings). */
function groupByDay(txns: Transaction[]): { title: string; data: Transaction[] }[] {
  const map = new Map<string, Transaction[]>();
  for (const txn of txns) {
    const day = txn.occurred_at.slice(0, 10); // "YYYY-MM-DD"
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(txn);
  }
  // Return newest day first
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, data]) => ({ title: day, data }));
}

/** Format a day key "YYYY-MM-DD" into a friendly label, e.g. "Tue, 2 Jun" */
function formatDayHeader(dayKey: string, locale: Locale): string {
  const d = new Date(dayKey + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dayKey;
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      numberingSystem: 'latn',
    }).format(d);
  } catch {
    return dayKey;
  }
}

export default function TransactionsScreen() {
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';
  const insets = useSafeAreaInsets();

  const [monthKey, setMonthKey] = useState<MonthKey>(() => currentMonthKey());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const filter = useMemo(() => {
    const { from, to } = monthRange(monthKey);
    return {
      from,
      to,
      status: 'confirmed' as const,
      ...(categoryFilter ? { category_slug: categoryFilter } : {}),
    };
  }, [monthKey, categoryFilter]);

  const { data, loading, refresh } = useTransactions(filter);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const sections = useMemo(() => groupByDay(data ?? []), [data]);

  const filterItems = useMemo(() => [
    { slug: null as string | null, label: t('all_categories', locale) },
    ...CATEGORIES.map((c) => ({ slug: c.slug, label: categoryLabel(c.slug, locale) })),
  ], [locale]);

  return (
    <Screen padded={false}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 16 }}>
        {/* Title */}
        <Text
          style={{
            fontFamily: FONT.jakartaB,
            fontSize: 28,
            color: '#F4F7F5',
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {t('transactions_title', locale)}
        </Text>

        {/* Month navigator — pill style */}
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#14191A',
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('prev_month', locale)}
            onPress={() => setMonthKey((k) => addMonth(k, -1))}
            style={({ pressed }) => ({
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 18, color: '#A8B2AF' }}>
              {rtl ? '›' : '‹'}
            </Text>
          </Pressable>

          <Text
            style={{
              fontFamily: FONT.jakartaSb,
              fontSize: 15,
              color: '#F4F7F5',
            }}
          >
            {monthLabel(monthKey.month, locale)} {monthKey.year}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('next_month', locale)}
            onPress={() => setMonthKey((k) => addMonth(k, 1))}
            style={({ pressed }) => ({
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 18, color: '#A8B2AF' }}>
              {rtl ? '‹' : '›'}
            </Text>
          </Pressable>
        </View>

        {/* Category filter chips */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterItems}
          keyExtractor={(item) => item.slug ?? '__all__'}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          renderItem={({ item }) => {
            const active = categoryFilter === item.slug;
            return (
              <Pill
                testID={`filter-${item.slug ?? 'all'}`}
                label={item.label}
                active={active}
                onPress={() => setCategoryFilter(item.slug)}
              />
            );
          }}
        />
      </View>

      {/* ── Transaction list grouped by day ────────────────────────────── */}
      {(!loading && sections.length === 0) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            emoji="📭"
            title={t('no_transactions', locale)}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, paddingTop: 12 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const dayTxns = section.data;
            const subtotal = dayTxns.reduce((sum, txn) => {
              return sum + (txn.type === 'income' ? txn.amount : -txn.amount);
            }, 0);
            const isPositive = subtotal >= 0;
            return (
              <View
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 10,
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT.jakartaMd,
                    fontSize: 12,
                    color: '#A8B2AF',
                    letterSpacing: 0.5,
                    textAlign: rtl ? 'right' : 'left',
                  }}
                >
                  {formatDayHeader(section.title, locale)}
                </Text>
                <Money
                  amount={subtotal}
                  sign="auto"
                  tone={subtotal >= 0 ? 'accent' : 'ink'}
                  size={13}
                />
              </View>
            );
          }}
          renderItem={({ item }) => (
            <TransactionRow
              txn={item}
              locale={locale}
              onPress={() => setEditing(item)}
            />
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: '#1C2322', marginVertical: 0 }} />
          )}
        />
      )}

      {/* ── Edit/delete sheet ───────────────────────────────────────────── */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={() => setEditing(null)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable onPress={() => {}}>
              {editing ? (
                <EditTransactionSheet
                  transaction={editing}
                  locale={locale}
                  onCancel={() => setEditing(null)}
                  onDone={() => {
                    setEditing(null);
                    void refresh();
                  }}
                />
              ) : null}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </Screen>
  );
}
