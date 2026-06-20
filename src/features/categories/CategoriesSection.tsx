import React, { useState } from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CollapsibleCard, AppText, Pill, PressableScale, CategoryAvatar } from '../../ui';
import { t, isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Category, CategoryKind, Locale } from '../../types';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { categoryLabel } from '../transactions/display';
import { useCustomCategories } from './CategoriesProvider';
import { createCustomCategory, updateCustomCategory, deleteCustomCategory } from './api';
import { CATEGORY_ICONS, CATEGORY_COLORS, DEFAULT_CATEGORY_ICON, DEFAULT_CATEGORY_COLOR } from './icons';

const ACCENT = '#2BD98E';
const INK2 = '#A8B2AF';
const INSET = '#14191A';

/** Settings → Categories: manage your custom categories (built-ins read-only). */
export function CategoriesSection({ locale }: { locale: Locale }) {
  const rtl = isRTL(locale);
  const align = rtl ? 'right' : 'left';
  const rowDir = rtl ? 'row-reverse' : 'row';
  const { custom, refresh } = useCustomCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [icon, setIcon] = useState<string>(DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [busy, setBusy] = useState(false);

  function openAdd() {
    setEditSlug(null);
    setName('');
    setKind('expense');
    setIcon(DEFAULT_CATEGORY_ICON);
    setColor(DEFAULT_CATEGORY_COLOR);
    setFormOpen(true);
  }
  function openEdit(c: Category) {
    setEditSlug(c.slug);
    setName(c.name_en);
    setKind(c.kind);
    setIcon(c.icon || DEFAULT_CATEGORY_ICON);
    setColor(c.color || DEFAULT_CATEGORY_COLOR);
    setFormOpen(true);
  }

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (editSlug) await updateCustomCategory(editSlug, { name, kind, icon, color });
      else await createCustomCategory({ name, kind, icon, color });
      await refresh();
      setFormOpen(false);
    } catch (e) {
      Alert.alert('', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(c: Category) {
    Alert.alert('', t('cat.deleteConfirm', locale), [
      { text: t('cancel', locale), style: 'cancel' },
      {
        text: t('delete', locale),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomCategory(c.slug);
            await refresh();
          } catch (e) {
            Alert.alert('', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  const builtIns: Category[] = [...expenseCategories(), ...incomeCategories()].filter((c) => !c.user_id);

  return (
    <CollapsibleCard title={t('cat.section', locale)} rtl={rtl} testID="section-categories">
      <View style={{ gap: 14 }}>
        {/* ── Your categories ── */}
        <AppText className="text-ink3" style={{ fontSize: 12, textAlign: align }}>
          {t('cat.your', locale)}
        </AppText>

        {custom.length === 0 && !formOpen ? (
          <AppText className="text-ink3" style={{ fontSize: 13, textAlign: align }}>
            {t('cat.empty', locale)}
          </AppText>
        ) : (
          custom.map((c) => (
            <View
              key={c.slug}
              testID={`cat-row-${c.slug}`}
              style={{ flexDirection: rowDir, alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 10 }}>
                <CategoryAvatar slug={c.slug} size={34} />
                <View style={{ gap: 1 }}>
                  <AppText weight="semibold" className="text-ink" style={{ fontSize: 15, textAlign: align }}>
                    {categoryLabel(c.slug, locale)}
                  </AppText>
                  <AppText className="text-ink3" style={{ fontSize: 11, textAlign: align }}>
                    {t(c.kind, locale)}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 14 }}>
                <TouchableOpacity testID={`cat-edit-${c.slug}`} onPress={() => openEdit(c)}>
                  <AppText className="text-ink2" style={{ fontSize: 12 }}>{t('edit', locale)}</AppText>
                </TouchableOpacity>
                <TouchableOpacity testID={`cat-delete-${c.slug}`} onPress={() => confirmDelete(c)}>
                  <AppText className="text-danger" style={{ fontSize: 12 }}>{t('delete', locale)}</AppText>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* ── Add / edit form ── */}
        {formOpen ? (
          <CategoryForm
            locale={locale}
            name={name}
            setName={setName}
            kind={kind}
            setKind={setKind}
            icon={icon}
            setIcon={setIcon}
            color={color}
            setColor={setColor}
            busy={busy}
            onCancel={() => setFormOpen(false)}
            onSave={save}
          />
        ) : (
          <TouchableOpacity testID="cat-add" onPress={openAdd}>
            <AppText className="text-accent" weight="semibold" style={{ fontSize: 13, textAlign: align }}>
              + {t('cat.add', locale)}
            </AppText>
          </TouchableOpacity>
        )}

        {/* ── Built-in (read-only) ── */}
        <View style={{ height: 1, backgroundColor: '#1F2826' }} />
        <AppText className="text-ink3" style={{ fontSize: 12, textAlign: align }}>
          {t('cat.builtin', locale)}
        </AppText>
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
          {builtIns.map((c) => (
            <View
              key={c.slug}
              style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: INSET, borderRadius: 999 }}
            >
              <CategoryAvatar slug={c.slug} size={20} />
              <AppText className="text-ink2" style={{ fontSize: 12 }}>{categoryLabel(c.slug, locale)}</AppText>
            </View>
          ))}
        </View>
      </View>
    </CollapsibleCard>
  );
}

interface FormProps {
  locale: Locale;
  name: string; setName: (v: string) => void;
  kind: CategoryKind; setKind: (v: CategoryKind) => void;
  icon: string; setIcon: (v: string) => void;
  color: string; setColor: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}

function CategoryForm(p: FormProps) {
  const { locale } = p;
  const rtl = isRTL(locale);
  const align = rtl ? 'right' : 'left';
  const font = rtl ? FONT.readex : FONT.jakarta;

  return (
    <View style={{ gap: 12, backgroundColor: INSET, borderRadius: 14, padding: 12 }}>
      {/* Live preview + name */}
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
        <IconTile icon={p.icon} color={p.color} size={40} selected={false} onPress={() => {}} preview />
        <TextInput
          testID="cat-name"
          value={p.name}
          onChangeText={p.setName}
          placeholder={t('cat.name', locale)}
          placeholderTextColor="#6B7672"
          style={{ flex: 1, fontFamily: font, fontSize: 15, color: '#F4F7F5', backgroundColor: '#0B0F0E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, textAlign: align }}
        />
      </View>

      {/* Kind */}
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 8 }}>
        <Pill testID="cat-kind-expense" label={t('expense', locale)} active={p.kind === 'expense'} onPress={() => p.setKind('expense')} />
        <Pill testID="cat-kind-income" label={t('income', locale)} active={p.kind === 'income'} onPress={() => p.setKind('income')} />
      </View>

      {/* Icon grid */}
      <AppText className="text-ink3" style={{ fontSize: 11, textAlign: align }}>{t('cat.icon', locale)}</AppText>
      <ScrollView style={{ maxHeight: 168 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} showsVerticalScrollIndicator={false}>
        {CATEGORY_ICONS.map((g) => (
          <IconTile key={g} icon={g} color={p.color} size={40} selected={p.icon === g} onPress={() => p.setIcon(g)} />
        ))}
      </ScrollView>

      {/* Color row */}
      <AppText className="text-ink3" style={{ fontSize: 11, textAlign: align }}>{t('cat.color', locale)}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, flexDirection: rtl ? 'row-reverse' : 'row', paddingVertical: 2 }}>
        {CATEGORY_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            testID={`cat-color-${c}`}
            onPress={() => p.setColor(c)}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: p.color === c ? 3 : 0, borderColor: '#F4F7F5' }}
          />
        ))}
      </ScrollView>

      {/* Actions */}
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
        <PressableScale testID="cat-cancel" onPress={p.onCancel} style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#0B0F0E' }}>
          <AppText weight="semibold" style={{ fontSize: 14, color: INK2 }}>{t('cancel', locale)}</AppText>
        </PressableScale>
        <PressableScale testID="cat-save" onPress={p.onSave} style={{ flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: ACCENT, opacity: p.busy || !p.name.trim() ? 0.6 : 1 }}>
          {p.busy ? <ActivityIndicator color="#06251A" /> : <AppText weight="semibold" style={{ fontSize: 14, color: '#06251A' }}>{t('save', locale)}</AppText>}
        </PressableScale>
      </View>
    </View>
  );
}

function IconTile({ icon, color, size, selected, onPress, preview }: { icon: string; color: string; size: number; selected: boolean; onPress: () => void; preview?: boolean }) {
  const bg = hexToRgba(color, 0.14);
  const radius = Math.round(size * 0.35);
  const body = (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: selected ? 2 : 0, borderColor: color }}>
      <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={Math.round(size * 0.55)} color={color} />
    </View>
  );
  if (preview) return body;
  return (
    <TouchableOpacity testID={`cat-icon-${icon}`} onPress={onPress}>
      {body}
    </TouchableOpacity>
  );
}

function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
