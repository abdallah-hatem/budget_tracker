import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  TextInput,
  Pressable,
  Text,
} from 'react-native';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../src/features/auth/SessionProvider';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { requestCategorize } from '../../src/features/capture/categorizeClient';
import { buildCaptureRow } from '../../src/features/capture/toTransactionRow';
import {
  insertTransaction,
  deleteTransaction,
} from '../../src/features/transactions/api';
import { categoryLabel } from '../../src/features/transactions/display';
import type { Locale, Transaction, TxnSource } from '../../src/types';
import {
  Screen,
  Card,
  AppText,
  Money,
  CategoryAvatar,
  SectionLabel,
} from '@/src/ui';
import { FONT } from '@/src/lib/font';

// Map a UI locale to a default STT BCP-47 tag.
function sttLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : 'en-US';
}

// Below this LLM confidence we still auto-save, but flag the entry for a glance.
const LOW_CONFIDENCE = 0.6;

// Design tokens
const ACCENT = '#2BD98E';
const SURFACE = '#14191A';
const OVERLAY = '#1C2322';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const DANGER = '#FF5C6C';
const ACCENT_SOFT = 'rgba(43,217,142,0.16)';
const WARNING = '#F5B544';

export default function CaptureScreen() {
  const { user, profile } = useSession();
  const locale: Locale = (profile?.locale as Locale) ?? 'en';
  const isRTL = locale === 'ar';

  const { transcript, isListening, supported, error: sttError, start, stop } =
    useSpeechRecognition();

  const [text, setText] = useState('');
  const [source, setSource] = useState<TxnSource>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The transaction we just auto-added (so we can show it + offer Undo).
  const [lastSaved, setLastSaved] = useState<Transaction | null>(null);
  // Render-timing-independent reentrancy guard against double-submit.
  const submittingRef = useRef(false);

  // Mirror live transcript into the text box — but never while a submit is in
  // flight, so a late transcript can't clobber the text/source we're saving.
  useEffect(() => {
    if (submittingRef.current) return;
    if (transcript) {
      setText(transcript);
      setSource('voice');
    }
  }, [transcript]);

  const toggleMic = () => {
    if (!supported) return;
    if (isListening) {
      stop();
    } else {
      setError(null);
      try {
        Haptics.selectionAsync();
      } catch {
        // haptics optional
      }
      start(sttLocale(locale));
    }
  };

  // Categorize AND save in one tap — no confirmation step.
  const onCategorize = async () => {
    if (submittingRef.current || loading) return;
    const value = text.trim();
    if (!value || !user) return;
    const src = source; // snapshot now; transcript effect can't change it mid-flight
    submittingRef.current = true;
    setError(null);
    setLoading(true);
    if (isListening) stop();
    try {
      const parsed = await requestCategorize(value, locale);
      // Round to the column's precision (numeric(14,2)) so the client guard
      // matches what the DB will actually store (CHECK amount > 0).
      const amount = Math.round((parsed.amount ?? 0) * 100) / 100;
      if (!(amount > 0)) {
        setError(
          locale === 'ar'
            ? 'لم أتمكن من إيجاد مبلغ — أضِف المبلغ وحاول مرة أخرى'
            : "Couldn't find an amount — add it and try again",
        );
        return;
      }
      const row = await insertTransaction(
        buildCaptureRow({ ...parsed, amount }, value, src, user.id, 'confirmed'),
      );
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // haptics optional
      }
      setLastSaved(row);
      setText('');
      setSource('text');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const undoLast = async () => {
    if (!lastSaved) return;
    const id = lastSaved.id;
    try {
      await deleteTransaction(id);
      setLastSaved(null);
    } catch (e) {
      // Keep the banner so Undo stays tappable on failure.
      setError(e instanceof Error ? e.message : 'Failed to undo');
    }
  };

  const saved = lastSaved;
  const savedLow = saved?.confidence != null && saved.confidence < LOW_CONFIDENCE;
  const savedIncome = saved?.type === 'income';

  const isEmpty = !text.trim();

  return (
    <Screen scroll padded>
      {/* Header */}
      <View style={{ marginTop: 8, marginBottom: 32 }}>
        <Text
          style={{
            fontFamily: isRTL ? FONT.readexSb : FONT.sora,
            fontSize: 28,
            color: INK,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {isRTL ? 'إضافة' : 'Add'}
        </Text>
        <Text
          style={{
            fontFamily: isRTL ? FONT.readex : FONT.jakarta,
            fontSize: 14,
            color: INK3,
            marginTop: 4,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {isRTL ? 'سجّل معاملتك بصوتك أو كتابةً' : 'Voice or type to capture a transaction'}
        </Text>
      </View>

      {/* Mic button — centered, prominent */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <Pressable
          testID="capture-mic"
          onPress={toggleMic}
          disabled={!supported}
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: !supported
              ? SURFACE
              : isListening
                ? ACCENT
                : OVERLAY,
            alignItems: 'center',
            justifyContent: 'center',
            // Emerald ring when listening
            shadowColor: isListening ? ACCENT : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: isListening ? 0.55 : 0,
            shadowRadius: isListening ? 20 : 0,
            elevation: isListening ? 12 : 0,
          }}
        >
          <Text style={{ fontSize: 32 }}>
            {isListening ? '🔴' : '🎤'}
          </Text>
        </Pressable>

        <Text
          style={{
            fontFamily: isRTL ? FONT.readex : FONT.jakartaMd,
            fontSize: 13,
            color: !supported ? INK3 : isListening ? ACCENT : INK2,
            marginTop: 12,
            textAlign: 'center',
          }}
        >
          {!supported
            ? isRTL
              ? 'الصوت يتطلب بناء مطوّر — اكتب بدلاً من ذلك'
              : 'Voice needs a dev build — type instead'
            : isListening
              ? isRTL
                ? '● استماع… اضغط للإيقاف'
                : '● Listening… tap to stop'
              : isRTL
                ? 'اضغط للتحدث'
                : 'Tap to speak'}
        </Text>
      </View>

      {/* STT error */}
      {sttError ? (
        <Text
          testID="capture-stt-error"
          style={{
            fontFamily: isRTL ? FONT.readex : FONT.jakarta,
            fontSize: 13,
            color: DANGER,
            marginBottom: 12,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {sttError}
        </Text>
      ) : null}

      {/* Text input — clean pill */}
      <View style={{ marginBottom: 16 }}>
        <SectionLabel>{isRTL ? 'أو اكتب هنا' : 'or type below'}</SectionLabel>
        <View
          style={{
            marginTop: 8,
            backgroundColor: SURFACE,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 4,
            minHeight: 56,
            justifyContent: 'center',
          }}
        >
          <TextInput
            testID="capture-text"
            value={text}
            onChangeText={(v) => {
              setText(v);
              setSource('text');
            }}
            placeholder={
              isRTL
                ? 'اكتب… مثل: قهوة بـ ٥٠ جنيه'
                : 'e.g. coffee 50 EGP, salary 8000'
            }
            placeholderTextColor={INK3}
            multiline
            style={{
              fontFamily: isRTL ? FONT.readex : FONT.jakarta,
              fontSize: 16,
              color: INK,
              textAlign: isRTL ? 'right' : 'left',
              paddingVertical: 12,
              lineHeight: 22,
            }}
          />
        </View>
      </View>

      {/* Add button */}
      <Pressable
        testID="capture-categorize"
        onPress={onCategorize}
        disabled={isEmpty || loading}
        style={{
          marginBottom: 16,
          backgroundColor: isEmpty || loading ? '#1FB877' : ACCENT,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          opacity: isEmpty ? 0.5 : 1,
          shadowColor: (!isEmpty && !loading) ? ACCENT : 'transparent',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: (!isEmpty && !loading) ? 0.3 : 0,
          shadowRadius: 12,
          elevation: (!isEmpty && !loading) ? 6 : 0,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#06251A" />
        ) : (
          <Text
            style={{
              fontFamily: isRTL ? FONT.readexSb : FONT.jakartaSb,
              fontSize: 16,
              color: '#06251A',
            }}
          >
            {isRTL ? 'إضافة' : 'Add'}
          </Text>
        )}
      </Pressable>

      {/* Capture error */}
      {error ? (
        <Text
          testID="capture-error"
          style={{
            fontFamily: isRTL ? FONT.readex : FONT.jakarta,
            fontSize: 13,
            color: DANGER,
            marginBottom: 16,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {error}
        </Text>
      ) : null}

      {/* Saved banner — sleek card with fade/scale-in */}
      {saved ? (
        <MotiView
          testID="capture-saved"
          from={{ opacity: 0, scale: 0.96, translateY: 8 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 260 }}
          style={{ marginBottom: 24 }}
        >
          <Card
            style={{
              backgroundColor: savedLow
                ? 'rgba(245,181,68,0.08)'
                : ACCENT_SOFT,
              borderRadius: 20,
            }}
          >
            {/* Status line */}
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 18, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }}>
                {savedLow ? '⚠️' : '✓'}
              </Text>
              <Text
                style={{
                  fontFamily: isRTL ? FONT.readexSb : FONT.jakartaSb,
                  fontSize: 15,
                  color: savedLow ? WARNING : ACCENT,
                }}
              >
                {savedLow
                  ? isRTL
                    ? 'تحقق من هذه'
                    : 'Check this'
                  : isRTL
                    ? 'تمت الإضافة'
                    : 'Added'}
              </Text>
            </View>

            {/* Category + amount row */}
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: saved.note ? 10 : 14,
              }}
            >
              <CategoryAvatar slug={saved.category_slug} size={44} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={{
                    fontFamily: isRTL ? FONT.readexSb : FONT.jakartaSb,
                    fontSize: 15,
                    color: INK,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  {categoryLabel(saved.category_slug, locale)}
                </Text>
                <Money
                  amount={saved.amount}
                  sign={savedIncome ? 'always' : 'none'}
                  tone={savedIncome ? 'accent' : 'ink'}
                  size={15}
                />
              </View>
            </View>

            {/* Note */}
            {saved.note ? (
              <Text
                style={{
                  fontFamily: isRTL ? FONT.readex : FONT.jakarta,
                  fontSize: 13,
                  color: INK2,
                  marginBottom: 14,
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {saved.note}
              </Text>
            ) : null}

            {/* Undo + hint */}
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Pressable
                testID="capture-undo"
                onPress={undoLast}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: 'rgba(244,247,245,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(244,247,245,0.16)',
                }}
              >
                <Text
                  style={{
                    fontFamily: isRTL ? FONT.readexMd : FONT.jakartaMd,
                    fontSize: 13,
                    color: INK,
                  }}
                >
                  {isRTL ? 'تراجع' : 'Undo'}
                </Text>
              </Pressable>

              <Text
                style={{
                  flex: 1,
                  fontFamily: isRTL ? FONT.readex : FONT.jakarta,
                  fontSize: 12,
                  color: INK3,
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {isRTL
                  ? 'خطأ؟ عدّله من تبويب المعاملات'
                  : 'Wrong? Edit it in the Transactions tab'}
              </Text>
            </View>
          </Card>
        </MotiView>
      ) : null}
    </Screen>
  );
}
