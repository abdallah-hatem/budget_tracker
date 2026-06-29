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
    </CollapsibleCard>
  );
}
