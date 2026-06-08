import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSession } from '../auth/SessionProvider';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { requestCategorize } from './categorizeClient';
import { requestVoiceCapture } from './voiceCaptureClient';
import { buildCaptureRow } from './toTransactionRow';
import {
  insertTransactions,
  deleteTransaction,
  getTransaction,
} from '../transactions/api';
import {
  ManualEntrySheet,
  type ManualEntryValues,
} from '../transactions/ManualEntrySheet';
import { RecordingOverlay } from './RecordingOverlay';
import { TypeSheet } from './TypeSheet';
import { AddedCardModal } from './AddedCardModal';
import { useDataSync } from '../sync/dataSync';
import { isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale, ParsedTransaction, Transaction, TxnSource } from '../../types';

function sttLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : 'en-US';
}

interface CaptureContextValue {
  /** Tap the mic: start voice capture (or stop if already recording). */
  startVoice: () => void;
  /** Open the "type text" sheet. */
  openType: () => void;
  /** Open the manual (no-AI) entry sheet. */
  openManual: () => void;
  isListening: boolean;
  loading: boolean;
  supported: boolean;
  /** Active UI locale — lets the tab-bar FAB localize its hold-menu. */
  locale: Locale;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error('useCapture must be used within a CaptureProvider');
  return ctx;
}

/**
 * Holds the whole capture engine (record → transcribe → categorize → save) and
 * renders every capture surface as a global overlay, so the tab-bar mic can
 * drive it from any screen. The capture tab no longer exists.
 */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useSession();
  const locale: Locale = (profile?.locale as Locale) ?? 'en';
  const { notifyTxnsChanged } = useDataSync();

  const voiceRef = useRef<(transcript: string, audioUri: string | null) => void>(() => {});
  const { isListening, supported, error: sttError, start, stop, cancel } =
    useSpeechRecognition((transcript, audioUri) => voiceRef.current(transcript, audioUri));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Transaction[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingSaved, setEditingSaved] = useState<Transaction | null>(null);
  const submittingRef = useRef(false);

  // Persist one or more parsed transactions; returns whether anything was saved.
  const saveMany = useCallback(
    async (items: ParsedTransaction[], rawText: string, src: TxnSource): Promise<boolean> => {
      if (!user) return false;
      const valid = items
        .map((p) => ({ ...p, amount: Math.round((p.amount ?? 0) * 100) / 100 }))
        .filter((p) => p.amount > 0);
      if (valid.length === 0) {
        setError(
          locale === 'ar'
            ? 'لم أتمكن من إيجاد مبلغ — أضِف المبلغ وحاول مرة أخرى'
            : "Couldn't find an amount — add it and try again",
        );
        return false;
      }
      const rows = await insertTransactions(
        valid.map((p) => buildCaptureRow(p, rawText, src, user.id, 'confirmed')),
      );
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // haptics optional
      }
      setLastSaved(rows);
      notifyTxnsChanged(); // refresh whatever tab is on screen
      return true;
    },
    [user, locale, notifyTxnsChanged],
  );

  const processCapture = useCallback(
    async (raw: string, src: TxnSource): Promise<boolean> => {
      if (submittingRef.current || loading) return false;
      const value = raw.trim();
      if (!value || !user) return false;
      submittingRef.current = true;
      setError(null);
      setLoading(true);
      if (isListening) stop();
      try {
        const items = await requestCategorize(value, locale);
        return await saveMany(items, value, src);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add');
        return false;
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    },
    [user, locale, loading, isListening, stop, saveMany],
  );

  const processVoice = useCallback(
    async (audioUri: string): Promise<boolean> => {
      if (submittingRef.current || loading || !user) return false;
      submittingRef.current = true;
      setError(null);
      setLoading(true);
      if (isListening) stop();
      try {
        const { text: heard, transactions } = await requestVoiceCapture(audioUri, locale);
        if (transactions.length === 0) {
          setError(
            heard
              ? locale === 'ar'
                ? `سمعت: «${heard}» — بس مفيش مبلغ. قول السعر كمان، مثلاً «بادل بميتين»`
                : `Heard "${heard}" — but no amount. Add a price, e.g. "padel 200".`
              : locale === 'ar'
                ? 'لم أسمع شيئًا — حاول مرة أخرى'
                : "Didn't catch that — try again",
          );
          return false;
        }
        return await saveMany(transactions, heard, 'voice');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add');
        return false;
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    },
    [user, locale, loading, isListening, stop, saveMany],
  );

  voiceRef.current = (transcript, audioUri) => {
    if (audioUri) void processVoice(audioUri);
    else if (transcript) void processCapture(transcript, 'voice');
  };

  const startVoice = useCallback(() => {
    if (!supported) {
      setError(
        locale === 'ar'
          ? 'الصوت يتطلب بناء مطوّر — اكتب بدلاً من ذلك'
          : 'Voice needs a dev build — type instead',
      );
      return;
    }
    if (isListening) {
      stop();
      return;
    }
    setError(null);
    try {
      Haptics.selectionAsync();
    } catch {
      // haptics optional
    }
    start(sttLocale(locale));
  }, [supported, isListening, stop, start, locale]);

  // Abort the recording and throw it away — nothing is transcribed or saved.
  const cancelVoice = useCallback(() => {
    try {
      Haptics.selectionAsync();
    } catch {
      // haptics optional
    }
    cancel();
    setError(null);
  }, [cancel]);

  const openType = useCallback(() => {
    setError(null);
    setTypeOpen(true);
  }, []);
  const openManual = useCallback(() => {
    setError(null);
    setManualOpen(true);
  }, []);

  const onTypeSubmit = useCallback(
    async (text: string) => {
      const ok = await processCapture(text, 'text');
      if (ok) setTypeOpen(false);
    },
    [processCapture],
  );

  const onManualSubmit = useCallback(
    (m: ManualEntryValues) => {
      setManualOpen(false);
      void saveMany(
        [
          {
            type: m.type,
            amount: m.amount,
            currency: 'EGP',
            category_slug: m.category_slug,
            note: m.note,
            confidence: 1,
            occurred_at: m.occurred_at,
          },
        ],
        '',
        'text',
      );
    },
    [saveMany],
  );

  const undoLast = useCallback(async () => {
    if (lastSaved.length === 0) return;
    const ids = lastSaved.map((t) => t.id);
    try {
      await Promise.all(ids.map((id) => deleteTransaction(id)));
      setLastSaved([]);
      notifyTxnsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to undo');
    }
  }, [lastSaved, notifyTxnsChanged]);

  const dismissCard = useCallback(() => setLastSaved([]), []);

  const onSavedEditDone = useCallback(async () => {
    const id = editingSaved?.id;
    setEditingSaved(null);
    if (!id) return;
    // The edit sheet already wrote to the DB — refresh the on-screen tab.
    notifyTxnsChanged();
    try {
      const fresh = await getTransaction(id);
      setLastSaved((prev) =>
        fresh ? prev.map((t) => (t.id === id ? fresh : t)) : prev.filter((t) => t.id !== id),
      );
    } catch {
      // leave the card as-is on a re-fetch failure
    }
  }, [editingSaved, notifyTxnsChanged]);

  // Surface STT errors + auto-dismiss any error toast.
  useEffect(() => {
    if (sttError) setError(sttError);
  }, [sttError]);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error]);

  const value: CaptureContextValue = {
    startVoice,
    openType,
    openManual,
    isListening,
    loading,
    supported,
    locale,
  };

  const rtl = isRTL(locale);
  // Hide the recording overlay while typing (the type sheet shows its own spinner).
  const overlayVisible = (isListening || loading) && !typeOpen;

  return (
    <CaptureContext.Provider value={value}>
      {children}

      <RecordingOverlay
        visible={overlayVisible}
        listening={isListening}
        loading={loading}
        locale={locale}
        onStop={stop}
        onCancel={cancelVoice}
      />

      <AddedCardModal
        saved={lastSaved}
        locale={locale}
        editing={editingSaved}
        onTapItem={setEditingSaved}
        onUndo={undoLast}
        onDismiss={dismissCard}
        onEditDone={onSavedEditDone}
        onEditCancel={() => setEditingSaved(null)}
      />

      {/* Type-text sheet */}
      <Modal visible={typeOpen} transparent animationType="slide" onRequestClose={() => setTypeOpen(false)}>
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={() => setTypeOpen(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable onPress={() => {}}>
              <TypeSheet locale={locale} loading={loading} onSubmit={onTypeSubmit} onCancel={() => setTypeOpen(false)} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Manual quick-add sheet */}
      <Modal visible={manualOpen} transparent animationType="slide" onRequestClose={() => setManualOpen(false)}>
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={() => setManualOpen(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable onPress={() => {}}>
              <ManualEntrySheet locale={locale} onSubmit={onManualSubmit} onCancel={() => setManualOpen(false)} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Transient error toast */}
      {error ? (
        <View
          testID="capture-error"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: 120,
            backgroundColor: '#1C2322',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,92,108,0.4)',
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              fontFamily: rtl ? FONT.readex : FONT.jakarta,
              fontSize: 13,
              color: '#FF5C6C',
              textAlign: rtl ? 'right' : 'left',
            }}
          >
            {error}
          </Text>
        </View>
      ) : null}
    </CaptureContext.Provider>
  );
}
