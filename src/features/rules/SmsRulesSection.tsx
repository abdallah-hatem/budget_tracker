import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Keyboard } from 'react-native';
import { Card, CollapsibleCard, SectionLabel, CategoryAvatar, PressableScale } from '../../ui';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { categoryLabel } from '../transactions/display';
import { t, isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale } from '../../types';
import { listSmsRules, createSmsRule, deleteSmsRule, type SmsRule } from './api';

const SURFACE = '#14191A';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';
const DANGER = '#FF5C6C';

const ALL_CATEGORIES = [...expenseCategories(), ...incomeCategories()];

function inputStyle(rtl: boolean) {
  return {
    fontFamily: FONT.jakartaMd,
    fontSize: 15,
    color: INK,
    backgroundColor: SURFACE,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    textAlign: (rtl ? 'right' : 'left') as 'right' | 'left',
  };
}

/**
 * Settings section: per-user keyword rules for SMS auto-categorization. When an
 * incoming bank SMS contains a keyword, ingest-sms forces the rule's category
 * (and note) onto the pending transaction.
 */
export function SmsRulesSection({
  locale,
  collapsible = false,
}: {
  locale: Locale;
  collapsible?: boolean;
}) {
  const rtl = isRTL(locale);
  const [rules, setRules] = useState<SmsRule[]>([]);
  const [keyword, setKeyword] = useState('');
  const [categorySlug, setCategorySlug] = useState(ALL_CATEGORIES[0]?.slug ?? 'food');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listSmsRules().then(setRules).catch(() => {});
  };
  useEffect(load, []);

  async function onAdd() {
    if (busy) return;
    const kw = keyword.trim();
    if (!kw) {
      setError(locale === 'ar' ? 'اكتب كلمة مفتاحية' : 'Enter a keyword');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await createSmsRule({ keyword: kw, category_slug: categorySlug, note });
      setKeyword('');
      setNote('');
      Keyboard.dismiss();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add rule');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id)); // optimistic
    try {
      await deleteSmsRule(id);
    } catch {
      load(); // revert on failure
    }
  }

  const labelStyle = {
    fontFamily: FONT.jakartaMd,
    fontSize: 12,
    color: INK3,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    textAlign: (rtl ? 'right' : 'left') as 'right' | 'left',
  };

  const body = (
    <>
      <Text
        style={{
          fontFamily: rtl ? FONT.readex : FONT.jakarta,
          fontSize: 14,
          color: INK2,
          marginBottom: 14,
          lineHeight: 20,
          textAlign: rtl ? 'right' : 'left',
        }}
      >
        {t('rules.subtitle', locale)}
      </Text>

      {/* Existing rules */}
      {rules.length > 0 ? (
        <View style={{ gap: 10, marginBottom: 14 }}>
          {rules.map((r) => (
            <View
              key={r.id}
              testID={`rule-${r.id}`}
              style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}
            >
              <CategoryAvatar slug={r.category_slug} size={34} />
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb,
                    fontSize: 14,
                    color: INK,
                    textAlign: rtl ? 'right' : 'left',
                  }}
                >
                  “{r.keyword}” → {categoryLabel(r.category_slug, locale)}
                </Text>
                {r.note ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: rtl ? FONT.readex : FONT.jakarta,
                      fontSize: 12,
                      color: INK2,
                      textAlign: rtl ? 'right' : 'left',
                    }}
                  >
                    {r.note}
                  </Text>
                ) : null}
              </View>
              <PressableScale
                testID={`rule-delete-${r.id}`}
                onPress={() => onDelete(r.id)}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Text style={{ fontFamily: rtl ? FONT.readexMd : FONT.jakartaMd, fontSize: 13, color: DANGER }}>
                  {t('rules.delete', locale)}
                </Text>
              </PressableScale>
            </View>
          ))}
        </View>
      ) : (
        <Text
          style={{
            fontFamily: rtl ? FONT.readex : FONT.jakarta,
            fontSize: 13,
            color: INK3,
            marginBottom: 14,
            textAlign: rtl ? 'right' : 'left',
          }}
        >
          {t('rules.empty', locale)}
        </Text>
      )}

      {/* Add form */}
      <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: '#1C2322', paddingTop: 14 }}>
        <Text style={labelStyle}>{t('rules.keyword', locale)}</Text>
        <TextInput
          testID="rule-keyword"
          value={keyword}
          onChangeText={(v) => {
            setKeyword(v);
            if (error) setError(null);
          }}
          placeholder={locale === 'ar' ? 'مثلاً: VODAFONE' : 'e.g. VODAFONE'}
          placeholderTextColor={INK3}
          autoCapitalize="characters"
          style={inputStyle(rtl)}
        />

        <Text style={labelStyle}>{t('by_category', locale)}</Text>
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {ALL_CATEGORIES.map((c) => {
            const active = categorySlug === c.slug;
            return (
              <PressableScale
                key={c.slug}
                testID={`rule-cat-${c.slug}`}
                onPress={() => setCategorySlug(c.slug)}
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: active ? 'rgba(43,217,142,0.16)' : SURFACE,
                  borderWidth: active ? 1 : 0,
                  borderColor: active ? 'rgba(43,217,142,0.4)' : 'transparent',
                }}
              >
                <CategoryAvatar slug={c.slug} size={22} />
                <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 13, color: active ? ACCENT : INK2 }}>
                  {categoryLabel(c.slug, locale)}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <Text style={labelStyle}>{t('rules.note_optional', locale)}</Text>
        <TextInput
          testID="rule-note"
          value={note}
          onChangeText={setNote}
          placeholder={locale === 'ar' ? 'اختياري' : 'optional'}
          placeholderTextColor={INK3}
          style={inputStyle(rtl)}
        />

        {error ? (
          <Text testID="rule-error" style={{ fontFamily: FONT.jakartaMd, fontSize: 13, color: DANGER, textAlign: rtl ? 'right' : 'left' }}>
            {error}
          </Text>
        ) : null}

        <PressableScale
          testID="rule-add"
          onPress={onAdd}
          style={{
            backgroundColor: 'rgba(43,217,142,0.12)',
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb, fontSize: 14, color: ACCENT }}>
            {t('rules.add', locale)}
          </Text>
        </PressableScale>
      </View>
    </>
  );

  return collapsible ? (
    <CollapsibleCard title={t('rules.title', locale)} rtl={rtl} testID="section-rules">
      {body}
    </CollapsibleCard>
  ) : (
    <Card className="mb-4">
      <SectionLabel>{t('rules.title', locale)}</SectionLabel>
      {body}
    </Card>
  );
}
