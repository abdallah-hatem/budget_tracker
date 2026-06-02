import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../src/features/auth/SessionProvider';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { requestCategorize } from '../../src/features/capture/categorizeClient';
import { buildCaptureRow } from '../../src/features/capture/toTransactionRow';
import {
  insertTransaction,
  deleteTransaction,
} from '../../src/features/transactions/api';
import { categoryLabel, formatAmount } from '../../src/features/transactions/display';
import type { Locale, Transaction, TxnSource } from '../../src/types';

// Map a UI locale to a default STT BCP-47 tag.
function sttLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : 'en-US';
}

// Below this LLM confidence we still auto-save, but flag the entry for a glance.
const LOW_CONFIDENCE = 0.6;

export default function CaptureScreen() {
  const { user, profile } = useSession();
  const locale: Locale = (profile?.locale as Locale) ?? 'en';

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

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-24"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      <Text className="mb-4 text-2xl font-bold">
        {locale === 'ar' ? 'تسجيل معاملة' : 'Capture'}
      </Text>

      {/* Mic */}
      <Pressable
        testID="capture-mic"
        onPress={toggleMic}
        disabled={!supported}
        className={`mb-4 items-center justify-center rounded-2xl py-8 ${
          !supported ? 'bg-gray-300' : isListening ? 'bg-red-500' : 'bg-black'
        }`}
      >
        <Text className="text-lg text-white">
          {!supported
            ? locale === 'ar'
              ? '🎤 الصوت يتطلب نسخة تطوير — اكتب بدلاً من ذلك'
              : '🎤 Voice needs a dev build — type instead'
            : isListening
              ? locale === 'ar'
                ? '● استماع… اضغط للإيقاف'
                : '● Listening… tap to stop'
              : locale === 'ar'
                ? '🎤 اضغط للتحدث'
                : '🎤 Tap to speak'}
        </Text>
      </Pressable>

      {sttError ? (
        <Text testID="capture-stt-error" className="mb-2 text-red-600">
          {sttError}
        </Text>
      ) : null}

      {/* Text box */}
      <TextInput
        testID="capture-text"
        value={text}
        onChangeText={(v) => {
          setText(v);
          setSource('text');
        }}
        placeholder={
          locale === 'ar'
            ? 'اكتب أو تحدث… مثل: قهوة بـ ٥٠ جنيه'
            : 'Type or speak… e.g. coffee 50 EGP'
        }
        multiline
        className="mb-4 min-h-24 rounded-xl border border-gray-300 bg-white p-3 text-base"
        style={{ textAlign: locale === 'ar' ? 'right' : 'left' }}
      />

      <Pressable
        testID="capture-categorize"
        onPress={onCategorize}
        disabled={loading || !text.trim()}
        className={`mb-4 items-center rounded-xl py-3 ${
          !text.trim() ? 'bg-gray-300' : 'bg-blue-600'
        }`}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-white">
            {locale === 'ar' ? 'إضافة' : 'Add'}
          </Text>
        )}
      </Pressable>

      {error ? (
        <Text testID="capture-error" className="mb-2 text-red-600">
          {error}
        </Text>
      ) : null}

      {/* Auto-added confirmation — your glance-able review + Undo. */}
      {saved ? (
        <View
          testID="capture-saved"
          className={`mb-4 rounded-xl border p-3 ${
            savedLow ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50'
          }`}
          style={{ direction: locale === 'ar' ? 'rtl' : 'ltr' }}
        >
          <Text
            className={`text-base font-semibold ${
              savedLow ? 'text-amber-800' : 'text-green-800'
            }`}
          >
            {savedLow
              ? locale === 'ar'
                ? '⚠ تحقق من هذه'
                : '⚠ Check this'
              : locale === 'ar'
                ? '✓ تمت الإضافة'
                : '✓ Added'}
          </Text>

          <Text className="mt-1">
            <Text className="text-gray-800">
              {categoryLabel(saved.category_slug, locale)}
            </Text>
            <Text className="text-gray-400">{'   ·   '}</Text>
            <Text
              className={`font-semibold ${
                savedIncome ? 'text-green-700' : 'text-red-600'
              }`}
            >
              {(savedIncome ? '+' : '-') + formatAmount(saved.amount, locale)}
            </Text>
          </Text>

          {saved.note ? (
            <Text className="mt-0.5 text-gray-600">{saved.note}</Text>
          ) : null}

          <View className="mt-2 flex-row items-center gap-3">
            <Pressable
              testID="capture-undo"
              onPress={undoLast}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5"
            >
              <Text className="text-gray-800">
                {locale === 'ar' ? 'تراجع' : 'Undo'}
              </Text>
            </Pressable>
            <Text className="flex-1 text-xs text-gray-500">
              {locale === 'ar'
                ? 'خطأ؟ عدّله من تبويب المعاملات'
                : 'Wrong? Edit it in the Transactions tab'}
            </Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
    </SafeAreaView>
  );
}
