import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTransactions } from '../../src/features/transactions/useTransactions';
import { EditTransactionSheet } from '../../src/features/transactions/EditTransactionSheet';
import { categoryLabel, formatAmount } from '../../src/features/transactions/display';
import { CATEGORIES } from '../../src/lib/categories';
import { useSession } from '../../src/features/auth/SessionProvider';
import { monthRange, addMonth, currentMonthKey, type MonthKey } from '../../src/features/dashboard/monthRange';
import { t, isRTL } from '../../src/lib/i18n';
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

export default function TransactionsScreen() {
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';

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

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ direction: dir }}>
      <View className="p-4 gap-3">
        <Text className="text-xl font-bold text-gray-900">{t('transactions_title', locale)}</Text>

        {/* Month navigator */}
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('prev_month', locale)}
            onPress={() => setMonthKey((k) => addMonth(k, -1))}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-gray-700">{rtl ? '›' : '‹'}</Text>
          </Pressable>
          <Text className="text-base font-semibold text-gray-900">
            {monthLabel(monthKey.month, locale)} {monthKey.year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('next_month', locale)}
            onPress={() => setMonthKey((k) => addMonth(k, 1))}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-gray-700">{rtl ? '‹' : '›'}</Text>
          </Pressable>
        </View>

        {/* Category filter */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ slug: null as string | null, label: t('all_categories', locale) }, ...CATEGORIES.map((c) => ({ slug: c.slug, label: categoryLabel(c.slug, locale) }))]}
          keyExtractor={(item) => item.slug ?? '__all__'}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const active = categoryFilter === item.slug;
            return (
              <Pressable
                testID={`filter-${item.slug ?? 'all'}`}
                accessibilityLabel={item.label}
                onPress={() => setCategoryFilter(item.slug)}
                className={`rounded-full px-3 py-2 ${active ? 'bg-gray-900' : 'bg-gray-100'}`}
              >
                <Text aria-hidden className={active ? 'text-white' : 'text-gray-700'}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        ListEmptyComponent={
          loading ? null : (
            <Text className="text-center text-sm text-gray-400 mt-8">
              {t('no_transactions', locale)}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`txn-row-${item.id}`}
            onPress={() => setEditing(item)}
            className="flex-row items-center justify-between rounded-lg border border-gray-100 px-3 py-3"
          >
            <View className="flex-shrink">
              <Text className="text-sm font-medium text-gray-900">
                {categoryLabel(item.category_slug, locale)}
              </Text>
              {item.note ? <Text className="text-xs text-gray-500">{item.note}</Text> : null}
            </View>
            <Text
              className={`text-sm font-semibold ${item.type === 'income' ? 'text-green-600' : 'text-red-600'}`}
              style={{ writingDirection: dir }}
            >
              {item.type === 'income' ? '+' : '-'}
              {formatAmount(item.amount, locale)}
            </Text>
          </Pressable>
        )}
      />

      {/* Edit/delete sheet */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setEditing(null)}>
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
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
