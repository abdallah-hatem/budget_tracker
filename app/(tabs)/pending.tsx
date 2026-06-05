import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { usePendingContext } from '../../src/features/transactions/PendingProvider';
import { updateTransaction, deleteTransaction } from '../../src/features/transactions/api';
import { EditTransactionSheet } from '../../src/features/transactions/EditTransactionSheet';
import { categoryLabel } from '../../src/features/transactions/display';
import { useSession } from '../../src/features/auth/SessionProvider';
import { t, isRTL } from '../../src/lib/i18n';
import { Screen, Card, CategoryAvatar, EmptyState, Money } from '../../src/ui';
import { TAB_BAR_CLEARANCE } from '../../src/ui/FloatingTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT } from '../../src/lib/font';
import type { Transaction } from '../../src/types';

export default function PendingScreen() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const insets = useSafeAreaInsets();

  const { data, loading, refresh } = usePendingContext();
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

  const pendingCount = data?.length ?? 0;

  return (
    <Screen padded={false}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text
            style={{
              fontFamily: FONT.jakartaB,
              fontSize: 28,
              color: '#F4F7F5',
            }}
          >
            {t('pending_title', locale)}
          </Text>
          {pendingCount > 0 && (
            <View
              style={{
                backgroundColor: '#2BD98E',
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
                minWidth: 24,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: FONT.soraSb,
                  fontSize: 12,
                  color: '#06251A',
                  fontVariant: ['tabular-nums', 'lining-nums'],
                }}
              >
                {pendingCount}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── List ───────────────────────────────────────────────────── */}
      {!loading && pendingCount === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            emoji="📥"
            title={t('pending_empty', locale)}
            subtitle={locale === 'ar' ? 'لا يوجد شيء لمراجعته' : 'Nothing to review'}
          />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, gap: 12 }}
          renderItem={({ item }) => (
            <Card testID={`pending-row-${item.id}`}>
              {/* ── Transaction row: avatar + details + amount ── */}
              <View
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <CategoryAvatar slug={item.category_slug} />

                <View
                  style={{
                    flex: 1,
                    alignItems: rtl ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT.jakartaSb,
                      fontSize: 16,
                      color: '#F4F7F5',
                      textAlign: rtl ? 'right' : 'left',
                    }}
                    numberOfLines={1}
                  >
                    {item.note && item.note.trim().length > 0
                      ? item.note
                      : categoryLabel(item.category_slug, locale)}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONT.jakartaMd,
                      fontSize: 13,
                      color: '#A8B2AF',
                      marginTop: 2,
                    }}
                  >
                    {categoryLabel(item.category_slug, locale)}
                  </Text>
                </View>

                {/* Amount */}
                <Money
                  amount={item.amount}
                  tone={item.type === 'income' ? 'accent' : 'ink'}
                  sign={item.type === 'income' ? 'always' : 'none'}
                  size={16}
                />
              </View>

              {/* ── via SMS pill + raw text ── */}
              <View style={{ marginTop: 10, gap: 6 }}>
                {/* via SMS chip */}
                <View style={{ flexDirection: rtl ? 'row-reverse' : 'row' }}>
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: 'rgba(43,217,142,0.1)',
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONT.jakartaMd,
                        fontSize: 11,
                        color: '#2BD98E',
                        letterSpacing: 0.3,
                      }}
                    >
                      {t('via_sms', locale)}
                    </Text>
                  </View>
                </View>

                {/* Raw SMS text — ink2 for AA contrast on essential muted text */}
                {item.raw_text ? (
                  <Text
                    style={{
                      fontFamily: FONT.jakarta,
                      fontSize: 12,
                      color: '#A8B2AF',
                      lineHeight: 18,
                      textAlign: rtl ? 'right' : 'left',
                    }}
                    numberOfLines={2}
                  >
                    {item.raw_text}
                  </Text>
                ) : null}
              </View>

              {/* ── Divider ── */}
              <View
                style={{ height: 1, backgroundColor: 'rgba(42,51,49,0.4)', marginVertical: 12 }}
              />

              {/* ── Action buttons ── */}
              <View
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  gap: 8,
                }}
              >
                {/* Confirm */}
                <Pressable
                  testID={`pending-confirm-${item.id}`}
                  onPress={() => handleConfirm(item.id)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#2BD98E',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT.jakartaSb,
                      fontSize: 13,
                      color: '#06251A',
                    }}
                  >
                    {t('confirm', locale)}
                  </Text>
                </Pressable>

                {/* Edit */}
                <Pressable
                  testID={`pending-edit-${item.id}`}
                  onPress={() => setEditing(item)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#1C2322',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT.jakartaSb,
                      fontSize: 13,
                      color: '#A8B2AF',
                    }}
                  >
                    {t('edit', locale)}
                  </Text>
                </Pressable>

                {/* Reject */}
                <Pressable
                  testID={`pending-reject-${item.id}`}
                  onPress={() => handleReject(item.id)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: 'rgba(255,92,108,0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,92,108,0.4)',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONT.jakartaSb,
                      fontSize: 13,
                      color: '#FF5C6C',
                    }}
                  >
                    {t('reject', locale)}
                  </Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}

      {/* ── Edit sheet modal ────────────────────────────────────────── */}
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
    </Screen>
  );
}
