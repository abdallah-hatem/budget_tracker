import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CollapsibleCard, AppText, Money, Pill, PressableScale } from '../../ui';
import { t, isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale } from '../../types';
import { useGold } from './useGold';
import { GOLD_KARATS, netWorth, holdingValue, type GoldHolding } from './value';

const ACCENT = '#2BD98E';
const INK2 = '#A8B2AF';
const INSET = '#14191A';

function karatLabel(k: number, locale: Locale): string {
  return locale === 'ar' ? `عيار ${k}` : `${k}k`;
}

function timeOf(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Settings → Gold: holdings + live value + net worth (cash + gold). */
export function GoldSection({ locale, accountsTotal }: { locale: Locale; accountsTotal: number }) {
  const rtl = isRTL(locale);
  const font = rtl ? FONT.readex : FONT.jakarta;
  const { holdings, prices, fetchedAt, stale, goldValue, priceUnavailable, add, update, remove } = useGold();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [karat, setKarat] = useState<number>(21);
  const [grams, setGrams] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  function openAdd() {
    setEditId(null); setKarat(21); setGrams(''); setLabel(''); setFormOpen(true);
  }
  function openEdit(h: GoldHolding) {
    setEditId(h.id); setKarat(h.karat); setGrams(String(h.grams)); setLabel(h.label ?? ''); setFormOpen(true);
  }

  async function save() {
    const g = parseFloat(grams.replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) return;
    setBusy(true);
    try {
      const patch = { karat, grams: g, label: label.trim() || null };
      if (editId) await update(editId, patch);
      else await add(patch);
      setFormOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const asOf = timeOf(fetchedAt, locale);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const align = rtl ? 'right' : 'left';

  return (
    <CollapsibleCard title={t('gold.section', locale)} rtl={rtl} testID="section-gold">
      <View style={{ gap: 14 }}>
        {/* Net worth + gold value */}
        <View style={{ gap: 2 }}>
          <AppText className="text-ink2" style={{ fontSize: 12, textAlign: align }}>
            {t('gold.net_worth', locale)}
          </AppText>
          <Money amount={netWorth(accountsTotal, goldValue)} tone="ink" sign="none" size={22} />
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <AppText className="text-ink3" style={{ fontSize: 12 }}>{t('gold.value', locale)}:</AppText>
            {priceUnavailable ? (
              <AppText className="text-ink3" style={{ fontSize: 12 }}>{t('gold.value_unavailable', locale)}</AppText>
            ) : (
              <Money amount={goldValue} tone="ink2" sign="none" size={13} />
            )}
            {asOf ? (
              <AppText style={{ fontFamily: font, fontSize: 11, color: stale ? '#E0A23C' : '#6B7672' }}>
                · {t('gold.as_of', locale)} {asOf}{stale ? ` · ${t('gold.outdated', locale)}` : ''}
              </AppText>
            ) : null}
          </View>
        </View>

        {/* Holdings */}
        {holdings.length === 0 && !formOpen ? (
          <AppText className="text-ink3" style={{ fontSize: 13, textAlign: align }}>
            {t('gold.empty', locale)}
          </AppText>
        ) : (
          holdings.map((h) => (
            <View key={h.id} testID={`gold-row-${h.id}`} style={{ flexDirection: rowDir, alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: rowDir, alignItems: 'baseline', gap: 8 }}>
                <AppText weight="semibold" className="text-ink" style={{ fontSize: 15 }}>
                  {h.grams}g · {karatLabel(h.karat, locale)}
                </AppText>
                {h.label ? <AppText className="text-ink3" style={{ fontSize: 12 }}>{h.label}</AppText> : null}
              </View>
              <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 12 }}>
                {priceUnavailable ? (
                  <AppText className="text-ink3" style={{ fontSize: 13 }}>—</AppText>
                ) : (
                  <Money amount={holdingValue(h, prices)} tone="ink2" sign="none" size={13} />
                )}
                <TouchableOpacity testID={`gold-edit-${h.id}`} onPress={() => openEdit(h)}>
                  <AppText className="text-ink2" style={{ fontSize: 12 }}>{t('edit', locale)}</AppText>
                </TouchableOpacity>
                <TouchableOpacity testID={`gold-delete-${h.id}`} onPress={() => void remove(h.id)}>
                  <AppText className="text-danger" style={{ fontSize: 12 }}>{t('delete', locale)}</AppText>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Add / edit form */}
        {formOpen ? (
          <View style={{ gap: 10, backgroundColor: INSET, borderRadius: 14, padding: 12 }}>
            <View style={{ flexDirection: rowDir, gap: 8 }}>
              {GOLD_KARATS.map((k) => (
                <Pill key={k} testID={`gold-karat-${k}`} label={karatLabel(k, locale)} active={karat === k} onPress={() => setKarat(k)} />
              ))}
            </View>
            <TextInput
              testID="gold-grams"
              value={grams}
              onChangeText={setGrams}
              keyboardType="decimal-pad"
              placeholder={t('gold.grams', locale)}
              placeholderTextColor="#6B7672"
              style={{ fontFamily: FONT.sora, fontSize: 15, color: '#F4F7F5', backgroundColor: '#0B0F0E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, textAlign: align }}
            />
            <TextInput
              testID="gold-label"
              value={label}
              onChangeText={setLabel}
              placeholder={t('gold.label_optional', locale)}
              placeholderTextColor="#6B7672"
              style={{ fontFamily: font, fontSize: 14, color: '#F4F7F5', backgroundColor: '#0B0F0E', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, textAlign: align }}
            />
            <View style={{ flexDirection: rowDir, gap: 10 }}>
              <PressableScale testID="gold-cancel" onPress={() => setFormOpen(false)} style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#0B0F0E' }}>
                <AppText weight="semibold" style={{ fontSize: 14, color: INK2 }}>{t('cancel', locale)}</AppText>
              </PressableScale>
              <PressableScale testID="gold-save" onPress={save} style={{ flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: ACCENT, opacity: busy ? 0.7 : 1 }}>
                {busy ? <ActivityIndicator color="#06251A" /> : <AppText weight="semibold" style={{ fontSize: 14, color: '#06251A' }}>{t('save', locale)}</AppText>}
              </PressableScale>
            </View>
          </View>
        ) : (
          <TouchableOpacity testID="gold-add" onPress={openAdd}>
            <AppText className="text-accent" weight="semibold" style={{ fontSize: 13, textAlign: align }}>
              + {t('gold.add', locale)}
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </CollapsibleCard>
  );
}
