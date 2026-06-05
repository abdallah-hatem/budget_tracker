import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  TextInput,
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
  PressableScale,
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

  // Holds the latest "process this capture" fn so the speech callback (registered
  // once) always runs current logic. Voice never touches the text box — when the
  // utterance finishes, we process it straight away.
  const processRef = useRef<(raw: string, src: TxnSource) => void>(() => {});

  const { isListening, supported, error: sttError, start, stop } =
    useSpeechRecognition((finalText) => processRef.current(finalText, 'voice'));

  const [text, setText] = useState('');
  const [source, setSource] = useState<TxnSource>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The transaction we just auto-added (so we can show it + offer Undo).
  const [lastSaved, setLastSaved] = useState<Transaction | null>(null);
  // Render-timing-independent reentrancy guard against double-submit.
  const submittingRef = useRef(false);

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

  // Categorize AND save in one go — no confirmation step. Shared by the typed
  // "Add" button and (automatically) by voice once the utterance finishes, so a
  // spoken entry goes straight from speech to a saved transaction.
  const processCapture = useCallback(
    async (raw: string, src: TxnSource) => {
      if (submittingRef.current || loading) return;
      const value = raw.trim();
      if (!value || !user) return;
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
    },
    [user, locale, loading, isListening, stop],
  );
  // Keep the speech callback pointing at the latest processCapture.
  processRef.current = processCapture;

  const onCategorize = () => void processCapture(text, source);

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
        <PressableScale
          testID="capture-mic"
          onPress={toggleMic}
          disabled={!supported || loading}
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
            {loading ? '⏳' : isListening ? '🔴' : '🎤'}
          </Text>
        </PressableScale>

        <Text
          style={{
            fontFamily: isRTL ? FONT.readex : FONT.jakartaMd,
            fontSize: 13,
            color: !supported ? INK3 : isListening || loading ? ACCENT : INK2,
            marginTop: 12,
            textAlign: 'center',
          }}
        >
          {!supported
            ? isRTL
              ? 'الصوت يتطلب بناء مطوّر — اكتب بدلاً من ذلك'
              : 'Voice needs a dev build — type instead'
            : loading
              ? isRTL
                ? 'جارٍ الإضافة…'
                : 'Adding…'
              : isListening
                ? isRTL
                  ? '● استماع…'
                  : '● Listening…'
                : isRTL
                  ? 'اضغط وتحدّث'
                  : 'Tap and speak'}
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
      <PressableScale
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
      </PressableScale>

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
              <PressableScale
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
              </PressableScale>

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
