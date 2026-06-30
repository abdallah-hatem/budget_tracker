import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  TextInput,
  AppState,
  TouchableOpacity,
  Platform,
} from 'react-native';
import RNAndroidNotificationListener from 'react-native-android-notification-listener';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText, CollapsibleCard, PrimaryButton } from '../../ui';
import { t } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale } from '../../types';
import { createIngestToken } from './api';
import { getCaptureConfig, setCaptureConfig, syncNativeCaptureConfig } from './androidCapture';

const SURFACE = '#14191A';
const INK = '#F4F7F5';
const INK2 = '#A8B2AF';
const INK3 = '#6B7672';
const ACCENT = '#2BD98E';
const DANGER = '#FF5C6C';

type PermStatus = 'authorized' | 'denied' | 'unknown';

/**
 * Android-only Settings section for bank-notification auto-capture.
 *
 * Flow: grant "Notification access" → add the keyword(s) the bank always
 * includes (e.g. "EGP", "جم") → enable. A Headless JS task then forwards any
 * notification containing a keyword to ingest-sms (see androidCapture.ts).
 */
export function AndroidCaptureSection({ locale }: { locale: Locale }) {
  const rtl = locale === 'ar';
  const [perm, setPerm] = useState<PermStatus>('unknown');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPerm = useCallback(async () => {
    try {
      const status = (await RNAndroidNotificationListener.getPermissionStatus()) as PermStatus;
      setPerm(status);
    } catch {
      setPerm('unknown');
    }
  }, []);

  // Load saved config + permission on mount, and re-check permission whenever
  // the app returns to the foreground (the user grants it in system Settings).
  useEffect(() => {
    void (async () => {
      const cfg = await getCaptureConfig();
      setKeywords(cfg.keywords);
      setEnabled(cfg.enabled);
      // Mirror config to native (covers users who enabled before this update).
      void syncNativeCaptureConfig();
      await refreshPerm();
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshPerm();
    });
    return () => sub.remove();
  }, [refreshPerm]);

  const addKeyword = useCallback(async () => {
    const k = draft.trim();
    if (!k) return;
    if (keywords.some((x) => x.toLowerCase() === k.toLowerCase())) {
      setDraft('');
      return;
    }
    const next = [...keywords, k];
    setKeywords(next);
    setDraft('');
    await setCaptureConfig({ keywords: next });
  }, [draft, keywords]);

  const removeKeyword = useCallback(
    async (k: string) => {
      const next = keywords.filter((x) => x !== k);
      setKeywords(next);
      await setCaptureConfig({ keywords: next });
    },
    [keywords],
  );

  const toggleEnabled = useCallback(async () => {
    setError(null);
    if (enabled) {
      setEnabled(false);
      await setCaptureConfig({ enabled: false });
      return;
    }
    // Turning ON — require permission + at least one keyword, then provision a token.
    if (perm !== 'authorized') {
      setError(t('acap.need_perm', locale));
      return;
    }
    if (keywords.length === 0) {
      setError(t('acap.need_kw', locale));
      return;
    }
    setBusy(true);
    try {
      // Always mint a FRESH token on enable. A previously-stored token may have
      // been revoked (sign-out, or createIngestToken called elsewhere), which
      // would 401 the headless POST. createIngestToken revokes older tokens
      // server-side, so this device's capture token is always the active one.
      const token = await createIngestToken();
      await setCaptureConfig({ enabled: true, keywords, token });
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [enabled, perm, keywords, locale]);

  // Defensive: never render on iOS even if accidentally mounted.
  if (Platform.OS !== 'android') return null;

  const granted = perm === 'authorized';

  return (
    <CollapsibleCard title={t('acap.title', locale)} rtl={rtl} testID="section-android-capture">
      <AppText
        className="text-ink2"
        style={{ fontSize: 14, marginTop: 10, marginBottom: 14, lineHeight: 20, textAlign: rtl ? 'right' : 'left' }}
      >
        {t('acap.intro', locale)}
      </AppText>

      {/* Step 1 — notification access */}
      <View
        style={{
          flexDirection: rtl ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: SURFACE,
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <MaterialCommunityIcons
            name={granted ? 'check-circle' : 'shield-alert-outline'}
            size={20}
            color={granted ? ACCENT : INK3}
          />
          <AppText style={{ fontSize: 14, color: INK, textAlign: rtl ? 'right' : 'left' }}>
            {granted ? t('acap.granted', locale) : t('acap.notgranted', locale)}
          </AppText>
        </View>
        {!granted && (
          <TouchableOpacity
            testID="acap-grant"
            onPress={() => RNAndroidNotificationListener.requestPermission()}
            style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(43,217,142,0.14)' }}
          >
            <AppText weight="semibold" style={{ fontSize: 13, color: ACCENT }}>
              {t('acap.grant', locale)}
            </AppText>
          </TouchableOpacity>
        )}
      </View>

      {/* Step 2 — keywords */}
      <AppText
        weight="medium"
        style={{ fontSize: 13, color: INK2, marginBottom: 8, textAlign: rtl ? 'right' : 'left' }}
      >
        {t('acap.keywords', locale)}
      </AppText>
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 8, marginBottom: 10 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addKeyword}
          placeholder={t('acap.keyword_ph', locale)}
          placeholderTextColor={INK3}
          autoCapitalize="characters"
          style={{
            flex: 1,
            fontFamily: FONT.jakartaMd,
            fontSize: 15,
            color: INK,
            backgroundColor: SURFACE,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 11,
            textAlign: rtl ? 'right' : 'left',
          }}
        />
        <TouchableOpacity
          testID="acap-add-keyword"
          onPress={addKeyword}
          style={{ justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(43,217,142,0.14)' }}
        >
          <AppText weight="semibold" style={{ color: ACCENT, fontSize: 14 }}>
            {t('acap.add', locale)}
          </AppText>
        </TouchableOpacity>
      </View>

      {keywords.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {keywords.map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => removeKeyword(k)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: SURFACE,
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 12,
              }}
            >
              <AppText style={{ fontSize: 13, color: INK }}>{k}</AppText>
              <MaterialCommunityIcons name="close" size={14} color={INK3} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <AppText style={{ fontSize: 12, color: INK3, marginBottom: 14, lineHeight: 17, textAlign: rtl ? 'right' : 'left' }}>
        {t('acap.hint', locale)}
      </AppText>

      {error && (
        <AppText style={{ fontSize: 13, color: DANGER, marginBottom: 12, textAlign: rtl ? 'right' : 'left' }}>
          {error}
        </AppText>
      )}

      {/* Step 3 — enable */}
      <PrimaryButton
        label={enabled ? t('acap.disable', locale) : t('acap.enable', locale)}
        onPress={toggleEnabled}
        loading={busy}
      />
      {enabled && (
        <AppText
          weight="medium"
          style={{ fontSize: 13, color: ACCENT, marginTop: 10, textAlign: 'center' }}
        >
          {t('acap.on', locale)}
        </AppText>
      )}
    </CollapsibleCard>
  );
}
