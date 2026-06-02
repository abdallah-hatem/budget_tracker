import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { updateTransaction, deleteTransaction } from './api';
import { categoryLabel } from './display';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { t, isRTL } from '../../lib/i18n';
import type { Transaction, TxnType, Locale } from '../../types';

interface Props {
  transaction: Transaction;
  locale: Locale;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Editable sheet for a single transaction: type / amount / category / note,
 * with Save (updateTransaction), Delete (deleteTransaction), and Cancel.
 * Parent re-queries via its own refresh() inside onDone.
 */
export function EditTransactionSheet({ transaction, locale, onDone, onCancel }: Props) {
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
    <View className="bg-white rounded-t-2xl p-4 gap-4" style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      {/* Type toggle */}
      <View className="flex-row gap-2">
        {(['expense', 'income'] as TxnType[]).map((ty) => (
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
            className={`flex-1 rounded-lg px-3 py-2 ${type === ty ? 'bg-gray-900' : 'bg-gray-100'}`}
          >
            <Text className={`text-center ${type === ty ? 'text-white' : 'text-gray-700'}`}>
              {t(ty, locale)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Amount */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('amount', locale)}</Text>
        <TextInput
          testID="edit-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          className="rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
          style={{ textAlign: rtl ? 'right' : 'left' }}
        />
      </View>

      {/* Category */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('by_category', locale)}</Text>
        <ScrollView
          ref={catScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {cats.map((c) => (
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
              className={`rounded-full px-3 py-2 ${categorySlug === c.slug ? 'bg-gray-900' : 'bg-gray-100'}`}
            >
              <Text className={categorySlug === c.slug ? 'text-white' : 'text-gray-700'}>
                {categoryLabel(c.slug, locale)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Note */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('note', locale)}</Text>
        <TextInput
          testID="edit-note"
          value={note}
          onChangeText={setNote}
          className="rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
          style={{ textAlign: rtl ? 'right' : 'left' }}
        />
      </View>

      {error ? (
        <Text testID="edit-error" className="text-red-600">{error}</Text>
      ) : null}

      {/* Actions */}
      <View className="flex-row gap-2 pt-2">
        <Pressable
          testID="edit-cancel"
          onPress={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg bg-gray-100 px-3 py-3"
        >
          <Text className="text-center text-gray-700">{t('cancel', locale)}</Text>
        </Pressable>
        <Pressable
          testID="edit-delete"
          onPress={handleDelete}
          disabled={busy}
          className="flex-1 rounded-lg bg-red-50 px-3 py-3"
        >
          <Text className="text-center text-red-600">{t('delete', locale)}</Text>
        </Pressable>
        <Pressable
          testID="edit-save"
          onPress={handleSave}
          disabled={busy}
          className="flex-1 rounded-lg bg-gray-900 px-3 py-3"
        >
          <Text className="text-center text-white">{t('save', locale)}</Text>
        </Pressable>
      </View>
    </View>
  );
}
