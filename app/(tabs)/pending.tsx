import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { usePending } from '../../src/features/transactions/usePending';
import { updateTransaction, deleteTransaction } from '../../src/features/transactions/api';
import { EditTransactionSheet } from '../../src/features/transactions/EditTransactionSheet';
import { categoryLabel, formatAmount } from '../../src/features/transactions/display';
import { useSession } from '../../src/features/auth/SessionProvider';
import { t, isRTL } from '../../src/lib/i18n';
import type { Transaction } from '../../src/types';

export default function PendingScreen() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';

  const { data, loading, refresh } = usePending();
  const [editing, setEditing] = useState<Transaction | null>(null);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function handleConfirm(id: string) {
    await updateTransaction(id, { status: 'confirmed' });
    void refresh();
  }

  async function handleReject(id: string) {
    await deleteTransaction(id);
    void refresh();
  }

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ direction: dir }}>
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">{t('pending_title', locale)}</Text>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        ListEmptyComponent={
          loading ? null : (
            <Text className="text-center text-sm text-gray-400 mt-8">
              {t('pending_empty', locale)}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View
            testID={`pending-row-${item.id}`}
            className="rounded-lg border border-gray-100 px-3 py-3 gap-2"
          >
            {/* Top row: category + signed amount */}
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-medium text-gray-900">
                {categoryLabel(item.category_slug, locale)}
              </Text>
              <Text
                className={`text-sm font-semibold ${item.type === 'income' ? 'text-green-600' : 'text-red-600'}`}
              >
                {item.type === 'income' ? '+' : '-'}
                {formatAmount(item.amount, locale)}
              </Text>
            </View>

            {/* Note */}
            {item.note ? (
              <Text className="text-xs text-gray-600">{item.note}</Text>
            ) : null}

            {/* Raw SMS text */}
            {item.raw_text ? (
              <Text className="text-xs text-gray-400" numberOfLines={2}>
                {item.raw_text}
              </Text>
            ) : null}

            {/* via SMS tag */}
            <View className="flex-row">
              <View className="rounded-full bg-blue-50 px-2 py-0.5">
                <Text className="text-xs text-blue-600">{t('via_sms', locale)}</Text>
              </View>
            </View>

            {/* Actions */}
            <View className="flex-row gap-2 pt-1">
              <Pressable
                testID={`pending-confirm-${item.id}`}
                onPress={() => handleConfirm(item.id)}
                className="flex-1 rounded-lg bg-green-50 px-3 py-2"
              >
                <Text className="text-center text-xs font-medium text-green-700">
                  {t('confirm', locale)}
                </Text>
              </Pressable>
              <Pressable
                testID={`pending-edit-${item.id}`}
                onPress={() => setEditing(item)}
                className="flex-1 rounded-lg bg-gray-100 px-3 py-2"
              >
                <Text className="text-center text-xs font-medium text-gray-700">
                  {t('edit', locale)}
                </Text>
              </Pressable>
              <Pressable
                testID={`pending-reject-${item.id}`}
                onPress={() => handleReject(item.id)}
                className="flex-1 rounded-lg bg-red-50 px-3 py-2"
              >
                <Text className="text-center text-xs font-medium text-red-600">
                  {t('reject', locale)}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      {/* Edit sheet modal */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setEditing(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable onPress={() => {}}>
              {editing ? (
                <EditTransactionSheet
                  transaction={editing}
                  locale={locale}
                  confirmOnSave
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
    </SafeAreaView>
  );
}
