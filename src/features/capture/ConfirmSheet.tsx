// NOTE: Not currently rendered. The Capture screen auto-saves on "Add" (no
// confirm step). Retained intentionally as the editable review sheet for a
// possible confidence-gated fallback (low-confidence parses -> confirm instead
// of auto-save). See app/(tabs)/capture.tsx `onCategorize`. Delete this file +
// confirmReducer + their tests if pure auto-add becomes permanent.
import React, { useReducer, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import type { Locale, ParsedTransaction, Transaction, TxnSource } from '../../types';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { NumericInput } from '../../ui';
import { insertTransaction } from '../transactions/api';
import { buildCaptureRow } from './toTransactionRow';
import {
  confirmReducer,
  initConfirmState,
} from './confirmReducer';

export interface ConfirmSheetProps {
  parsed: ParsedTransaction;
  rawText: string;
  userId: string;
  source: TxnSource;
  locale: Locale;
  onSaved: (row: Transaction) => void;
  onCancel: () => void;
}

function categoryLabel(
  cat: { name_en: string; name_ar: string },
  locale: Locale,
): string {
  return locale === 'ar' ? cat.name_ar : cat.name_en;
}

export function ConfirmSheet({
  parsed,
  rawText,
  userId,
  source,
  locale,
  onSaved,
  onCancel,
}: ConfirmSheetProps) {
  const [state, dispatch] = useReducer(confirmReducer, parsed, initConfirmState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories =
    state.type === 'income' ? incomeCategories() : expenseCategories();

  const handleSave = async () => {
    const amount = Number(state.amountText);
    if (!state.amountText || Number.isNaN(amount) || amount <= 0) {
      setError('Enter an amount greater than 0');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const row = await insertTransaction(
        buildCaptureRow(
          {
            type: state.type,
            amount,
            currency: 'EGP',
            category_slug: state.category_slug,
            note: state.note,
            confidence: parsed.confidence,
            occurred_at: parsed.occurred_at,
          },
          rawText,
          source,
          userId,
          'confirmed',
        ),
      );
      onSaved(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const isRtl = locale === 'ar';

  return (
    <View
      className="rounded-2xl bg-white p-4"
      style={{ direction: isRtl ? 'rtl' : 'ltr' } as any}
    >
      {/* Type toggle */}
      <View className="mb-3 flex-row gap-2">
        {(['expense', 'income'] as const).map((tt) => (
          <Pressable
            key={tt}
            testID={`confirm-type-${tt}`}
            onPress={() => dispatch({ kind: 'SET_TYPE', value: tt })}
            className={`flex-1 rounded-xl px-3 py-2 ${
              state.type === tt ? 'bg-black' : 'bg-gray-200'
            }`}
          >
            <Text
              className={`text-center ${
                state.type === tt ? 'text-white' : 'text-black'
              }`}
            >
              {tt === 'expense'
                ? locale === 'ar'
                  ? 'مصروف'
                  : 'Expense'
                : locale === 'ar'
                  ? 'دخل'
                  : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Amount */}
      <Text className="mb-1 text-xs text-gray-500">
        {locale === 'ar' ? 'المبلغ (ج.م)' : 'Amount (EGP)'}
      </Text>
      <NumericInput
        testID="confirm-amount"
        value={state.amountText}
        onChangeValue={(v) => dispatch({ kind: 'SET_AMOUNT', value: v })}
        placeholder="0"
        className="mb-3 rounded-xl border border-gray-300 px-3 py-2 text-lg"
      />

      {/* Category picker */}
      <Text className="mb-1 text-xs text-gray-500">
        {locale === 'ar' ? 'الفئة' : 'Category'}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-3"
      >
        <View className="flex-row gap-2">
          {categories.map((cat) => (
            <Pressable
              key={cat.slug}
              testID={`confirm-category-${cat.slug}`}
              onPress={() =>
                dispatch({ kind: 'SET_CATEGORY', value: cat.slug })
              }
              className={`rounded-full px-3 py-2 ${
                state.category_slug === cat.slug ? 'bg-black' : 'bg-gray-200'
              }`}
            >
              <Text
                className={
                  state.category_slug === cat.slug
                    ? 'text-white'
                    : 'text-black'
                }
              >
                {categoryLabel(cat, locale)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Note */}
      <Text className="mb-1 text-xs text-gray-500">
        {locale === 'ar' ? 'ملاحظة' : 'Note'}
      </Text>
      <TextInput
        testID="confirm-note"
        value={state.note}
        onChangeText={(v) => dispatch({ kind: 'SET_NOTE', value: v })}
        placeholder={locale === 'ar' ? 'اختياري' : 'Optional'}
        className="mb-3 rounded-xl border border-gray-300 px-3 py-2"
      />

      {error ? (
        <Text testID="confirm-error" className="mb-2 text-red-600">
          {error}
        </Text>
      ) : null}

      {/* Actions */}
      <View className="flex-row gap-2">
        <Pressable
          testID="confirm-cancel"
          onPress={onCancel}
          disabled={saving}
          className="flex-1 rounded-xl bg-gray-200 px-3 py-3"
        >
          <Text className="text-center text-black">
            {locale === 'ar' ? 'إلغاء' : 'Cancel'}
          </Text>
        </Pressable>
        <Pressable
          testID="confirm-save"
          onPress={handleSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-black px-3 py-3"
        >
          <Text className="text-center text-white">
            {saving
              ? locale === 'ar'
                ? 'جارٍ الحفظ…'
                : 'Saving…'
              : locale === 'ar'
                ? 'حفظ'
                : 'Save'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
