import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CategoryAvatar, Money, PressableScale } from '../../ui';
import { categoryLabel } from '../transactions/display';
import { isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale, Transaction } from '../../types';

const ACCENT = '#2BD98E';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const WARNING = '#F5B544';
const LOW_CONFIDENCE = 0.6;

/**
 * The "Added" confirmation, now a bottom-sheet modal. One row per added
 * transaction (tap a row to edit/discard it), an ✕ to dismiss (keeps the
 * entries), and Undo (deletes them all).
 */
export function AddedCardModal({
  saved,
  locale,
  onTapItem,
  onUndo,
  onDismiss,
}: {
  saved: Transaction[];
  locale: Locale;
  onTapItem: (t: Transaction) => void;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const rtl = isRTL(locale);
  const insets = useSafeAreaInsets();
  const savedLow =
    saved.length === 1 &&
    saved[0].confidence != null &&
    saved[0].confidence < LOW_CONFIDENCE;

  return (
    <Modal
      visible={saved.length > 0}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onDismiss}
      >
        <Pressable
          testID="capture-saved"
          onPress={() => {}}
          style={{
            backgroundColor: '#1C2322',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: 24 + insets.bottom,
            direction: rtl ? 'rtl' : 'ltr',
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A3331' }} />
          </View>

          {/* Status + dismiss */}
          <View
            style={{
              flexDirection: rtl ? 'row-reverse' : 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, marginRight: rtl ? 0 : 8, marginLeft: rtl ? 8 : 0 }}>
                {savedLow ? '⚠️' : '✓'}
              </Text>
              <Text
                style={{
                  fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb,
                  fontSize: 16,
                  color: savedLow ? WARNING : ACCENT,
                }}
              >
                {savedLow
                  ? rtl
                    ? 'تحقق من هذه'
                    : 'Check this'
                  : saved.length > 1
                    ? rtl
                      ? `تمت إضافة ${saved.length}`
                      : `Added ${saved.length}`
                    : rtl
                      ? 'تمت الإضافة'
                      : 'Added'}
              </Text>
            </View>
            <PressableScale
              testID="capture-dismiss"
              accessibilityRole="button"
              onPress={onDismiss}
              hitSlop={10}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={22} color={INK3} />
            </PressableScale>
          </View>

          {/* One tappable row per added transaction */}
          <View style={{ gap: 12, marginBottom: 16 }}>
            {saved.map((t) => {
              const income = t.type === 'income';
              return (
                <PressableScale
                  key={t.id}
                  testID={`saved-item-${t.id}`}
                  onPress={() => onTapItem(t)}
                  style={{
                    flexDirection: rtl ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <CategoryAvatar slug={t.category_slug} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb,
                        fontSize: 15,
                        color: INK,
                        textAlign: rtl ? 'right' : 'left',
                      }}
                    >
                      {categoryLabel(t.category_slug, locale)}
                    </Text>
                    {t.note ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: rtl ? FONT.readex : FONT.jakarta,
                          fontSize: 12,
                          color: INK2,
                          textAlign: rtl ? 'right' : 'left',
                        }}
                      >
                        {t.note}
                      </Text>
                    ) : null}
                  </View>
                  <Money amount={t.amount} sign={income ? 'always' : 'none'} tone={income ? 'accent' : 'ink'} size={15} />
                  <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color={INK3} />
                </PressableScale>
              );
            })}
          </View>

          {/* Undo + hint */}
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
            <PressableScale
              testID="capture-undo"
              onPress={onUndo}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(244,247,245,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(244,247,245,0.16)',
              }}
            >
              <Text style={{ fontFamily: rtl ? FONT.readexMd : FONT.jakartaMd, fontSize: 13, color: INK }}>
                {rtl ? 'تراجع' : 'Undo'}
              </Text>
            </PressableScale>
            <Text
              style={{
                flex: 1,
                fontFamily: rtl ? FONT.readex : FONT.jakarta,
                fontSize: 12,
                color: INK3,
                textAlign: rtl ? 'right' : 'left',
              }}
            >
              {rtl ? 'اضغط على عنصر لتعديله أو حذفه' : 'Tap an item to edit or remove it'}
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
