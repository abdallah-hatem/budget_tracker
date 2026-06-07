import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../../ui';
import { t, isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale } from '../../types';

/**
 * Bottom sheet for typing an expense (the "Type text" option). Categorizes via
 * the AI on submit — multiple items in one line are split, same as voice.
 */
export function TypeSheet({
  locale,
  loading,
  onSubmit,
  onCancel,
}: {
  locale: Locale;
  loading: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const rtl = isRTL(locale);
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const empty = !text.trim();

  return (
    <Pressable
      onPress={() => Keyboard.dismiss()}
      style={{
        backgroundColor: '#1C2322',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingHorizontal: 20,
        paddingBottom: 24 + insets.bottom,
        gap: 14,
        direction: rtl ? 'rtl' : 'ltr',
      }}
    >
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A3331' }} />
      </View>

      <Text
        style={{
          fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb,
          fontSize: 17,
          color: '#F4F7F5',
          textAlign: rtl ? 'right' : 'left',
        }}
      >
        {rtl ? 'اكتب معاملتك' : 'Type your expense'}
      </Text>

      <TextInput
        testID="type-input"
        value={text}
        onChangeText={setText}
        autoFocus
        multiline
        placeholder={rtl ? 'مثال: قهوة بـ ٥٠ جنيه، تاكسي بأربعين' : 'e.g. coffee 50, taxi 40'}
        placeholderTextColor="#6B7672"
        style={{
          fontFamily: rtl ? FONT.readex : FONT.jakarta,
          fontSize: 16,
          color: '#F4F7F5',
          backgroundColor: '#14191A',
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          minHeight: 58,
          lineHeight: 22,
          textAlign: rtl ? 'right' : 'left',
        }}
      />

      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
        <PressableScale
          testID="type-cancel"
          onPress={onCancel}
          style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#14191A' }}
        >
          <Text style={{ fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb, fontSize: 14, color: '#A8B2AF' }}>
            {t('cancel', locale)}
          </Text>
        </PressableScale>
        <PressableScale
          testID="type-submit"
          onPress={() => {
            if (empty || loading) return;
            onSubmit(text.trim());
          }}
          style={{
            flex: 2,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: '#2BD98E',
            opacity: empty || loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#06251A" />
          ) : (
            <Text style={{ fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb, fontSize: 14, color: '#06251A' }}>
              {t('add', locale)}
            </Text>
          )}
        </PressableScale>
      </View>
    </Pressable>
  );
}
