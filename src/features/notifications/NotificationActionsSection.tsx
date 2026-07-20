import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Keyboard } from 'react-native';
import { CollapsibleCard, CategoryAvatar, PressableScale } from '../../ui';
import { expenseCategories, incomeCategories, categoryBySlug } from '../../lib/categories';
import { categoryLabel } from '../transactions/display';
import { t, isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale, TxnType } from '../../types';
import {
  type QuickAction,
  getQuickActions,
  setQuickActions,
  makeQuickActionId,
  MAX_QUICK_ACTIONS,
} from './quickActions';

const SURFACE = '#14191A';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';
const DANGER = '#FF5C6C';

/**
 * Settings → Notification quick actions. The user defines up to
 * MAX_QUICK_ACTIONS presets (category + note; the expense/income type follows
 * the category). Each becomes a one-tap button on the SMS-pending notification
 * that files the transaction into that category and confirms it.
 */
export function NotificationActionsSection({ locale }: { locale: Locale }) {
  const rtl = isRTL(locale);
  const align: 'left' | 'right' = rtl ? 'right' : 'left';
  const rowDir = rtl ? 'row-reverse' : 'row';

  const allCategories = [...expenseCategories(), ...incomeCategories()];

  const [actions, setActions] = useState<QuickAction[]>([]);
  const [categorySlug, setCategorySlug] = useState(allCategories[0]?.slug ?? 'food');
  const [note, setNote] = useState('');

  useEffect(() => {
    getQuickActions().then(setActions).catch(() => {});
  }, []);

  const atMax = actions.length >= MAX_QUICK_ACTIONS;

  async function persist(next: QuickAction[]) {
    setActions(next);
    await setQuickActions(next);
  }

  async function onAdd() {
    if (atMax) return;
    const type: TxnType = categoryBySlug(categorySlug)?.kind === 'income' ? 'income' : 'expense';
    const next: QuickAction[] = [
      ...actions,
      { id: makeQuickActionId(), categorySlug, type, note: note.trim() },
    ];
    setNote('');
    Keyboard.dismiss();
    await persist(next);
  }

  async function onDelete(id: string) {
    await persist(actions.filter((a) => a.id !== id));
  }

  const labelStyle = {
    fontFamily: FONT.jakartaMd,
    fontSize: 12,
    color: INK3,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    textAlign: align,
  };

  return (
    <CollapsibleCard
      title={t('notifActions.section', locale)}
      icon="gesture-tap-button"
      rtl={rtl}
      testID="section-notif-actions"
    >
      <Text
        style={{
          fontFamily: rtl ? FONT.readex : FONT.jakarta,
          fontSize: 14,
          color: INK2,
          marginBottom: 14,
          lineHeight: 20,
          textAlign: align,
        }}
      >
        {t('notifActions.subtitle', locale)}
      </Text>

      {/* Existing quick actions */}
      {actions.length > 0 ? (
        <View style={{ gap: 10, marginBottom: 14 }}>
          {actions.map((a) => (
            <View
              key={a.id}
              testID={`notif-action-${a.id}`}
              style={{ flexDirection: rowDir, alignItems: 'center', gap: 10 }}
            >
              <CategoryAvatar slug={a.categorySlug} size={34} />
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb,
                    fontSize: 14,
                    color: INK,
                    textAlign: align,
                  }}
                >
                  {categoryLabel(a.categorySlug, locale)}
                  {a.note ? ` · ${a.note}` : ''}
                </Text>
                <Text
                  style={{
                    fontFamily: rtl ? FONT.readex : FONT.jakarta,
                    fontSize: 12,
                    color: INK2,
                    textAlign: align,
                  }}
                >
                  {t(a.type, locale)}
                </Text>
              </View>
              <PressableScale
                testID={`notif-action-delete-${a.id}`}
                onPress={() => onDelete(a.id)}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Text style={{ fontFamily: rtl ? FONT.readexMd : FONT.jakartaMd, fontSize: 13, color: DANGER }}>
                  {t('delete', locale)}
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
            textAlign: align,
          }}
        >
          {t('notifActions.empty', locale)}
        </Text>
      )}

      {/* Add form — hidden once at the iOS action cap */}
      {atMax ? (
        <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 12, color: INK3, textAlign: align }}>
          {t('notifActions.max', locale)}
        </Text>
      ) : (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: '#1C2322', paddingTop: 14 }}>
          <Text style={labelStyle}>{t('notifActions.category', locale)}</Text>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          >
            {allCategories.map((c) => {
              const active = categorySlug === c.slug;
              return (
                <PressableScale
                  key={c.slug}
                  testID={`notif-action-cat-${c.slug}`}
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

          <Text style={labelStyle}>{t('notifActions.note', locale)}</Text>
          <TextInput
            testID="notif-action-note"
            value={note}
            onChangeText={setNote}
            placeholder={t('notifActions.notePlaceholder', locale)}
            placeholderTextColor={INK3}
            style={{
              fontFamily: FONT.jakartaMd,
              fontSize: 15,
              color: INK,
              backgroundColor: SURFACE,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 11,
              textAlign: align,
            }}
          />

          <PressableScale
            testID="notif-action-add"
            onPress={onAdd}
            style={{
              backgroundColor: 'rgba(43,217,142,0.12)',
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb, fontSize: 14, color: ACCENT }}>
              {t('notifActions.add', locale)}
            </Text>
          </PressableScale>
        </View>
      )}
    </CollapsibleCard>
  );
}
