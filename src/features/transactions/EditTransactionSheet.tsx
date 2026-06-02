import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { updateTransaction, deleteTransaction } from './api';
import { categoryLabel } from './display';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { t, isRTL } from '../../lib/i18n';
import { CategoryAvatar } from '../../ui';
import { FONT } from '../../lib/font';
import type { Transaction, TxnType, Locale } from '../../types';

interface Props {
  transaction: Transaction;
  locale: Locale;
  onDone: () => void;
  onCancel: () => void;
  /** When true the Save action also sets status:'confirmed' on the patch. */
  confirmOnSave?: boolean;
}

/**
 * Editable sheet for a single transaction: type / amount / category / note,
 * with Save (updateTransaction), Delete (deleteTransaction), and Cancel.
 * Parent re-queries via its own refresh() inside onDone.
 */
export function EditTransactionSheet({ transaction, locale, onDone, onCancel, confirmOnSave = false }: Props) {
  const rtl = isRTL(locale);
  const [type, setType] = useState<TxnType>(transaction.type);
  const [amount, setAmount] = useState<string>(String(transaction.amount));
  const [categorySlug, setCategorySlug] = useState<string>(transaction.category_slug);
  const [note, setNote] = useState<string>(transaction.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll the selected category chip into view (on open + on tap).
  const catScrollRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const didInitialScroll = useRef(false);
  const scrollToSlug = (slug: string, animated: boolean) => {
    const x = chipX.current[slug];
    if (x != null) catScrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated });
  };

  const cats = type === 'income' ? incomeCategories() : expenseCategories();

  async function handleSave() {
    if (busy) return;
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than 0');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateTransaction(transaction.id, {
        type,
        amount: parsed,
        category_slug: categorySlug,
        note: note.trim() === '' ? null : note.trim(),
        ...(confirmOnSave ? { status: 'confirmed' as const } : {}),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await deleteTransaction(transaction.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        backgroundColor: '#1C2322',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingHorizontal: 20,
        paddingBottom: 32,
        gap: 20,
        direction: rtl ? 'rtl' : 'ltr',
      }}
    >
      {/* Drag handle */}
      <View style={{ alignItems: 'center', marginBottom: 4 }}>
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#2A3331',
          }}
        />
      </View>

      {/* ── Type toggle — two pills ── */}
      <View
        style={{
          flexDirection: rtl ? 'row-reverse' : 'row',
          gap: 8,
          backgroundColor: '#14191A',
          borderRadius: 14,
          padding: 4,
        }}
      >
        {(['expense', 'income'] as TxnType[]).map((ty) => {
          const active = type === ty;
          return (
            <Pressable
              key={ty}
              testID={`edit-type-${ty}`}
              onPress={() => {
                setType(ty);
                const next = ty === 'income' ? incomeCategories() : expenseCategories();
                if (!next.some((c) => c.slug === categorySlug)) {
                  setCategorySlug(next[0]?.slug ?? categorySlug);
                }
              }}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor: active ? '#2BD98E' : 'transparent',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: FONT.jakartaSb,
                  fontSize: 14,
                  color: active ? '#06251A' : '#6B7672',
                }}
              >
                {t(ty, locale)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Amount field ── */}
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontFamily: FONT.jakartaMd,
            fontSize: 12,
            color: '#6B7672',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {t('amount', locale)}
        </Text>
        <TextInput
          testID="edit-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholderTextColor="#6B7672"
          style={{
            fontFamily: FONT.soraSb,
            fontSize: 28,
            color: '#F4F7F5',
            backgroundColor: '#14191A',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            textAlign: rtl ? 'right' : 'left',
            fontVariant: ['tabular-nums', 'lining-nums'],
          }}
        />
      </View>

      {/* ── Category chips ── */}
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontFamily: FONT.jakartaMd,
            fontSize: 12,
            color: '#6B7672',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {t('by_category', locale)}
        </Text>
        <ScrollView
          ref={catScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {cats.map((c) => {
            const active = categorySlug === c.slug;
            return (
              <Pressable
                key={c.slug}
                testID={`edit-cat-${c.slug}`}
                onLayout={(e) => {
                  chipX.current[c.slug] = e.nativeEvent.layout.x;
                  if (c.slug === categorySlug && !didInitialScroll.current) {
                    didInitialScroll.current = true;
                    scrollToSlug(c.slug, false);
                  }
                }}
                onPress={() => {
                  setCategorySlug(c.slug);
                  scrollToSlug(c.slug, true);
                }}
                style={({ pressed }) => ({
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: active
                    ? 'rgba(43,217,142,0.16)'
                    : '#14191A',
                  borderWidth: active ? 1 : 0,
                  borderColor: active ? 'rgba(43,217,142,0.4)' : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <CategoryAvatar slug={c.slug} size={24} />
                <Text
                  style={{
                    fontFamily: FONT.jakartaMd,
                    fontSize: 13,
                    color: active ? '#2BD98E' : '#A8B2AF',
                  }}
                >
                  {categoryLabel(c.slug, locale)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Note field ── */}
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontFamily: FONT.jakartaMd,
            fontSize: 12,
            color: '#6B7672',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {t('note', locale)}
        </Text>
        <TextInput
          testID="edit-note"
          value={note}
          onChangeText={setNote}
          placeholderTextColor="#6B7672"
          style={{
            fontFamily: FONT.jakartaMd,
            fontSize: 15,
            color: '#F4F7F5',
            backgroundColor: '#14191A',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            textAlign: rtl ? 'right' : 'left',
          }}
        />
      </View>

      {/* ── Error ── */}
      {error ? (
        <Text
          testID="edit-error"
          style={{
            fontFamily: FONT.jakartaMd,
            fontSize: 13,
            color: '#FF5C6C',
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {error}
        </Text>
      ) : null}

      {/* ── Actions ── */}
      <View
        style={{
          flexDirection: rtl ? 'row-reverse' : 'row',
          gap: 8,
          paddingTop: 4,
        }}
      >
        {/* Cancel */}
        <Pressable
          testID="edit-cancel"
          onPress={onCancel}
          disabled={busy}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: pressed ? '#2A3331' : '#14191A',
            opacity: busy ? 0.5 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: FONT.jakartaSb,
              fontSize: 14,
              color: '#A8B2AF',
            }}
          >
            {t('cancel', locale)}
          </Text>
        </Pressable>

        {/* Delete */}
        <Pressable
          testID="edit-delete"
          onPress={handleDelete}
          disabled={busy}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: pressed
              ? 'rgba(255,92,108,0.2)'
              : 'rgba(255,92,108,0.1)',
            borderWidth: 1,
            borderColor: 'rgba(255,92,108,0.4)',
            opacity: busy ? 0.5 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: FONT.jakartaSb,
              fontSize: 14,
              color: '#FF5C6C',
            }}
          >
            {t('delete', locale)}
          </Text>
        </Pressable>

        {/* Save */}
        <Pressable
          testID="edit-save"
          onPress={handleSave}
          disabled={busy}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: pressed ? '#1FB877' : '#2BD98E',
            opacity: busy ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: FONT.jakartaSb,
              fontSize: 14,
              color: '#06251A',
            }}
          >
            {t('save', locale)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
