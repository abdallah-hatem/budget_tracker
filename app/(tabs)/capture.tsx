import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSession } from '../../src/features/auth/SessionProvider';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { requestCategorize } from '../../src/features/capture/categorizeClient';
import { ConfirmSheet } from '../../src/features/capture/ConfirmSheet';
import type { Locale, ParsedTransaction, TxnSource } from '../../src/types';

// Map a UI locale to a default STT BCP-47 tag.
function sttLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : 'en-US';
}

export default function CaptureScreen() {
  const { user, profile } = useSession();
  const locale: Locale = (profile?.locale as Locale) ?? 'en';

  const { transcript, isListening, supported, error: sttError, start, stop } =
    useSpeechRecognition();

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null);
  const [rawText, setRawText] = useState('');
  const [source, setSource] = useState<TxnSource>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror live transcript into the text box.
  useEffect(() => {
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

  const onCategorize = async () => {
    const value = text.trim();
    if (!value) return;
    setError(null);
    setLoading(true);
    try {
      const result = await requestCategorize(value, locale);
      setRawText(value);
      setParsed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to categorize');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setParsed(null);
    setText('');
    setRawText('');
    setSource('text');
    setError(null);
  };

  return (
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
            {locale === 'ar' ? 'تصنيف' : 'Categorize'}
          </Text>
        )}
      </Pressable>

      {error ? (
        <Text testID="capture-error" className="mb-2 text-red-600">
          {error}
        </Text>
      ) : null}

      {/* Confirm sheet */}
      {parsed && user ? (
        <ConfirmSheet
          parsed={parsed}
          rawText={rawText}
          userId={user.id}
          source={source}
          locale={locale}
          onSaved={reset}
          onCancel={() => setParsed(null)}
        />
      ) : null}
    </ScrollView>
  );
}
