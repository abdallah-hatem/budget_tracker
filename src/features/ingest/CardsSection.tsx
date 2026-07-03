import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, Switch, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText, CollapsibleCard } from '../../ui';
import { t, isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale } from '../../types';
import {
  listDetectedCards,
  setCardEnabled,
  renameCard,
  deleteCard,
  addManualCard,
  type DetectedCard,
} from './cards';

const SURFACE = '#14191A';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';
const DANGER = '#FF5C6C';

/**
 * Settings section listing the cards/accounts auto-detected from bank messages.
 * The user can rename, enable/disable (disable = stop capturing that card), or
 * delete each one. Shown on BOTH platforms — it reflects server-side detection.
 */
export function CardsSection({ locale }: { locale: Locale }) {
  const rtl = isRTL(locale);
  const [cards, setCards] = useState<DetectedCard[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Manual "add a card" inline form.
  const [adding, setAdding] = useState(false);
  const [newDigits, setNewDigits] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listDetectedCards().then(setCards).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onToggle = useCallback(
    async (card: DetectedCard) => {
      // Optimistic flip.
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, enabled: !c.enabled } : c)),
      );
      try {
        await setCardEnabled(card.id, !card.enabled);
      } catch {
        load(); // revert to server truth on failure
      }
    },
    [load],
  );

  const startRename = useCallback((card: DetectedCard) => {
    setEditingId(card.id);
    setDraft(card.label ?? '');
  }, []);

  const commitRename = useCallback(async () => {
    const id = editingId;
    const label = draft.trim();
    setEditingId(null);
    if (!id || !label) return;
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
    try {
      await renameCard(id, label);
    } catch {
      load();
    }
  }, [editingId, draft, load]);

  const onDelete = useCallback(
    (card: DetectedCard) => {
      Alert.alert('', t('cards.delete_confirm', locale), [
        { text: t('cards.cancel', locale), style: 'cancel' },
        {
          text: t('cards.delete', locale),
          style: 'destructive',
          onPress: async () => {
            setCards((prev) => prev.filter((c) => c.id !== card.id));
            try {
              await deleteCard(card.id);
            } catch {
              load();
            }
          },
        },
      ]);
    },
    [locale, load],
  );

  const commitAdd = useCallback(async () => {
    const digits = newDigits.replace(/\D/g, '');
    if (digits.length < 4) {
      Alert.alert('', t('cards.add_invalid', locale));
      return;
    }
    setSaving(true);
    try {
      await addManualCard(digits, newLabel);
      setAdding(false);
      setNewDigits('');
      setNewLabel('');
      load();
    } catch {
      Alert.alert('', t('cards.add_invalid', locale));
    } finally {
      setSaving(false);
    }
  }, [newDigits, newLabel, locale, load]);

  return (
    <CollapsibleCard title={t('cards.title', locale)} rtl={rtl} testID="section-cards">
      <AppText
        className="text-ink2"
        style={{ fontSize: 14, marginTop: 10, marginBottom: 14, lineHeight: 20, textAlign: rtl ? 'right' : 'left' }}
      >
        {t('cards.intro', locale)}
      </AppText>

      {cards.length === 0 ? (
        <AppText
          style={{ fontSize: 13, color: INK3, lineHeight: 19, textAlign: rtl ? 'right' : 'left' }}
        >
          {t('cards.empty', locale)}
        </AppText>
      ) : (
        <View style={{ gap: 10 }}>
          {cards.map((card) => (
            <View
              key={card.id}
              style={{
                flexDirection: rtl ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: SURFACE,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <MaterialCommunityIcons
                name="credit-card-outline"
                size={20}
                color={card.enabled ? ACCENT : INK3}
              />

              <View style={{ flex: 1 }}>
                {editingId === card.id ? (
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={commitRename}
                    onBlur={commitRename}
                    autoFocus
                    placeholder={card.label ?? ''}
                    placeholderTextColor={INK3}
                    style={{
                      fontFamily: FONT.jakartaMd,
                      fontSize: 15,
                      color: INK,
                      paddingVertical: 2,
                      textAlign: rtl ? 'right' : 'left',
                    }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => startRename(card)} accessibilityRole="button">
                    <AppText
                      weight="medium"
                      style={{ fontSize: 15, color: INK, textAlign: rtl ? 'right' : 'left' }}
                    >
                      {card.label || card.fingerprint}
                    </AppText>
                    <AppText
                      style={{ fontSize: 12, color: INK3, marginTop: 2, textAlign: rtl ? 'right' : 'left' }}
                    >
                      {card.txn_count} {t('cards.txns', locale)}
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                onPress={() => onDelete(card)}
                hitSlop={8}
                accessibilityLabel={t('cards.delete', locale)}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={INK3} />
              </TouchableOpacity>

              <Switch
                value={card.enabled}
                onValueChange={() => onToggle(card)}
                trackColor={{ false: '#2A312F', true: 'rgba(43,217,142,0.5)' }}
                thumbColor={card.enabled ? ACCENT : '#6B7672'}
                testID={`card-toggle-${card.fingerprint}`}
              />
            </View>
          ))}
        </View>
      )}

      {/* Manual add — a card added by its last-4 captures immediately (or can be
          pre-disabled). Same fingerprint as the parser, so it merges with the
          auto-detected row for that number. */}
      {adding ? (
        <View
          style={{
            marginTop: 14,
            gap: 10,
            backgroundColor: SURFACE,
            borderRadius: 12,
            padding: 12,
          }}
        >
          <TextInput
            value={newDigits}
            onChangeText={(s) => setNewDigits(s.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            autoFocus
            maxLength={4}
            placeholder={t('cards.add_digits', locale)}
            placeholderTextColor={INK3}
            style={{
              fontFamily: FONT.jakartaMd,
              fontSize: 15,
              color: INK,
              backgroundColor: '#0E1213',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              textAlign: rtl ? 'right' : 'left',
            }}
          />
          <TextInput
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder={t('cards.add_label', locale)}
            placeholderTextColor={INK3}
            style={{
              fontFamily: FONT.jakartaMd,
              fontSize: 15,
              color: INK,
              backgroundColor: '#0E1213',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              textAlign: rtl ? 'right' : 'left',
            }}
          />
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={commitAdd}
              disabled={saving}
              accessibilityRole="button"
              style={{
                flex: 1,
                backgroundColor: ACCENT,
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: 'center',
                opacity: saving ? 0.6 : 1,
              }}
            >
              <AppText weight="semibold" style={{ fontSize: 14, color: '#04110B' }}>
                {t('cards.save', locale)}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setAdding(false);
                setNewDigits('');
                setNewLabel('');
              }}
              accessibilityRole="button"
              style={{
                flex: 1,
                backgroundColor: '#0E1213',
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: 'center',
              }}
            >
              <AppText style={{ fontSize: 14, color: INK2 }}>
                {t('cards.cancel', locale)}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          testID="cards-add-button"
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 14,
            paddingVertical: 11,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#243029',
          }}
        >
          <MaterialCommunityIcons name="plus" size={18} color={ACCENT} />
          <AppText weight="medium" style={{ fontSize: 14, color: ACCENT }}>
            {t('cards.add', locale)}
          </AppText>
        </TouchableOpacity>
      )}
    </CollapsibleCard>
  );
}
