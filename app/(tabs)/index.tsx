import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useMonthSummary } from '../../src/features/dashboard/useMonthSummary';
import { useSession } from '../../src/features/auth/SessionProvider';
import { categoryLabel, formatAmount } from '../../src/features/transactions/display';
import { t, isRTL } from '../../src/lib/i18n';
import type { Locale } from '../../src/types';

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

export default function Dashboard() {
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';

  const { monthKey, summary, transactions, loading, prevMonth, nextMonth, refresh } =
    useMonthSummary();

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const recent = transactions.slice(0, 5);

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ direction: dir }}>
      <ScrollView contentContainerClassName="p-4 gap-4">
        {/* Month navigator */}
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('prev_month', locale)}
            onPress={prevMonth}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-base text-gray-700">{rtl ? '›' : '‹'}</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-gray-900">
            {monthLabel(monthKey.month, locale)} {monthKey.year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('next_month', locale)}
            onPress={nextMonth}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-base text-gray-700">{rtl ? '‹' : '›'}</Text>
          </Pressable>
        </View>

        {/* Net big number */}
        <View className="items-center py-4">
          <Text className="text-sm text-gray-500">{t('net_this_month', locale)}</Text>
          <Text
            className={`text-4xl font-bold ${summary.net >= 0 ? 'text-green-600' : 'text-red-600'}`}
            style={{ writingDirection: dir }}
          >
            {formatAmount(summary.net, locale)}
          </Text>
        </View>

        {/* Income vs expense */}
        <View className="flex-row gap-3">
          <View className="flex-1 rounded-xl bg-green-50 p-4">
            <Text className="text-xs text-green-700">{t('income', locale)}</Text>
            <Text className="mt-1 text-lg font-semibold text-green-700">
              {formatAmount(summary.income, locale)}
            </Text>
          </View>
          <View className="flex-1 rounded-xl bg-red-50 p-4">
            <Text className="text-xs text-red-700">{t('expense', locale)}</Text>
            <Text className="mt-1 text-lg font-semibold text-red-700">
              {formatAmount(summary.expense, locale)}
            </Text>
          </View>
        </View>

        {/* By category */}
        <View className="gap-2">
          <Text className="text-base font-semibold text-gray-900">
            {t('by_category', locale)}
          </Text>
          {summary.byCategory.map((row) => (
            <View
              key={row.slug}
              className="flex-row items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
            >
              <Text className="text-sm text-gray-800">
                {categoryLabel(row.slug, locale)}
              </Text>
              <Text className="text-sm font-medium text-gray-900" style={{ writingDirection: dir }}>
                {row.total.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Recent transactions */}
        <View className="gap-2">
          <Text className="text-base font-semibold text-gray-900">
            {t('recent', locale)}
          </Text>
          {recent.length === 0 && !loading ? (
            <Text className="text-sm text-gray-400">{t('no_transactions', locale)}</Text>
          ) : (
            recent.map((txn) => (
              <View
                key={txn.id}
                className="flex-row items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
              >
                <View className="flex-shrink">
                  {txn.note ? (
                    <Text className="text-sm font-medium text-gray-900">{txn.note}</Text>
                  ) : (
                    <Text className="text-sm font-medium text-gray-900">
                      {categoryLabel(txn.category_slug, locale)}
                    </Text>
                  )}
                </View>
                <Text
                  className={`text-sm font-semibold ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}
                  style={{ writingDirection: dir }}
                >
                  {txn.type === 'income' ? '+' : '-'}
                  {formatAmount(txn.amount, locale)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
