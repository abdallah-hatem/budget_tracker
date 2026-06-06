import React, { useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoryLabel } from './display';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { t, isRTL } from '../../lib/i18n';
import { CategoryAvatar, PressableScale } from '../../ui';
import { FONT } from '../../lib/font';
import type { TxnType, Locale } from '../../types';

export interface ManualEntryValues {
  type: TxnType;
  amount: number;
  category_slug: string;
  note: string;
}

interface Props {
  locale: Locale;
  onSubmit: (values: ManualEntryValues) => void;
  onCancel: () => void;
}

/**
 * Manual quick-add — a no-AI fallback for adding a transaction by hand. Collects
 * type / amount / category / note and hands them back via onSubmit (the caller
 * persists, so this stays presentational). Mirrors EditTransactionSheet's fields
 * without Delete, the account picker, or any AI round-trip.
 */
export function ManualEntrySheet({ locale, onSubmit, onCancel }: Props) {
  const rtl = isRTL(locale);
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TxnType>('expense');
  const [amount, setAmount] = useState('');
  const [categorySlug, setCategorySlug] = useState<string>(
    expenseCategories()[0]?.slug ?? '',
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll the selected category chip into view on tap.
  const catScrollRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const scrollToSlug = (slug: string, animated: boolean) => {
    const x = chipX.current[slug];
    if (x != null) catScrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated });
  };

  const cats = type === 'income' ? incomeCategories() : expenseCategories();

  function handleAdd() {
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(locale === 'ar' ? 'أدخل مبلغًا أكبر من صفر' : 'Enter an amount greater than 0');
      return;
    }
    onSubmit({ type, amount: parsed, category_slug: categorySlug, note: note.trim() });
  }

  const fieldLabelStyle = {
    fontFamily: FONT.jakartaMd,
    fontSize: 12,
    color: '#6B7672',
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    textAlign: (rtl ? 'right' : 'left') as 'right' | 'left',
  };

  return (
    // Tapping the sheet background dismisses the keyboard (numeric keypad has no
    // Done key); category chips and inputs still capture their own taps.
    <Pressable
      onPress={() => Keyboard.dismiss()}
      style={{
        backgroundColor: '#1C2322',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingHorizontal: 20,
        paddingBottom: 32 + insets.bottom,
        gap: 18,
        direction: rtl ? 'rtl' : 'ltr',
      }}
    >
      {/* Drag handle */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A3331' }} />
      </View>

      {/* Title */}
      <Text
        style={{
          fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb,
          fontSize: 17,
          color: '#F4F7F5',
          textAlign: rtl ? 'right' : 'left',
        }}
      >
        {t('add_manually', locale)}
      </Text>

      {/* Type toggle */}
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
            <PressableScale
              key={ty}
              testID={`manual-type-${ty}`}
              onPress={() => {
                setType(ty);
                const next = ty === 'income' ? incomeCategories() : expenseCategories();
                if (!next.some((c) => c.slug === categorySlug)) {
                  setCategorySlug(next[0]?.slug ?? categorySlug);
                }
              }}
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor: active ? '#2BD98E' : 'transparent',
              }}
            >
              <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 14, color: active ? '#06251A' : '#6B7672' }}>
                {t(ty, locale)}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {/* Amount */}
      <View style={{ gap: 6 }}>
        <Text style={fieldLabelStyle}>{t('amount', locale)}</Text>
        <TextInput
          testID="manual-amount"
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            if (error) setError(null);
          }}
          keyboardType="numeric"
          autoFocus
          placeholder="0"
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

      {/* Category chips */}
      <View style={{ gap: 6 }}>
        <Text style={fieldLabelStyle}>{t('by_category', locale)}</Text>
        <ScrollView
          ref={catScrollRef}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {cats.map((c) => {
            const active = categorySlug === c.slug;
            return (
              <PressableScale
                key={c.slug}
                testID={`manual-cat-${c.slug}`}
                onLayout={(e) => {
                  chipX.current[c.slug] = e.nativeEvent.layout.x;
                }}
                onPress={() => {
                  setCategorySlug(c.slug);
                  scrollToSlug(c.slug, true);
                }}
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: active ? 'rgba(43,217,142,0.16)' : '#14191A',
                  borderWidth: active ? 1 : 0,
                  borderColor: active ? 'rgba(43,217,142,0.4)' : 'transparent',
                }}
              >
                <CategoryAvatar slug={c.slug} size={24} />
                <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 13, color: active ? '#2BD98E' : '#A8B2AF' }}>
                  {categoryLabel(c.slug, locale)}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      {/* Note */}
      <View style={{ gap: 6 }}>
        <Text style={fieldLabelStyle}>{t('note', locale)}</Text>
        <TextInput
          testID="manual-note"
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

      {/* Error */}
      {error ? (
        <Text
          testID="manual-error"
          style={{ fontFamily: FONT.jakartaMd, fontSize: 13, color: '#FF5C6C', textAlign: rtl ? 'right' : 'left' }}
        >
          {error}
        </Text>
      ) : null}

      {/* Actions */}
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 8, paddingTop: 2 }}>
        <PressableScale
          testID="manual-cancel"
          onPress={onCancel}
          style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#14191A' }}
        >
          <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 14, color: '#A8B2AF' }}>{t('cancel', locale)}</Text>
        </PressableScale>
        <PressableScale
          testID="manual-add"
          onPress={handleAdd}
          style={{ flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#2BD98E' }}
        >
          <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 14, color: '#06251A' }}>{t('add', locale)}</Text>
        </PressableScale>
      </View>
    </Pressable>
  );
}
