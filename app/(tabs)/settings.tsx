import { useEffect, useState } from 'react';
import { I18nManager, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Locale } from '@/src/types';
import { supabase } from '@/src/lib/supabase';
import { t, isRTL } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';
import {
  createIngestToken,
  revokeIngestTokens,
  hasActiveIngestToken,
} from '@/src/features/ingest/api';
import * as Clipboard from 'expo-clipboard';

export default function Settings() {
  const { user, profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const [busy, setBusy] = useState(false);

  // ── ingest token state ────────────────────────────────────────────────────
  const [hasToken, setHasToken] = useState(false);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<'copy' | 'copied'>('copy');
  const [guideOpen, setGuideOpen] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    hasActiveIngestToken()
      .then(setHasToken)
      .catch(() => {});
  }, []);

  async function onGenerateToken() {
    setBusy(true);
    setTokenError(null);
    try {
      const token = await createIngestToken();
      setRawToken(token);
      setHasToken(true);
      setCopyLabel('copy');
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to generate token.');
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeToken() {
    setBusy(true);
    setTokenError(null);
    try {
      await revokeIngestTokens();
      setHasToken(false);
      setRawToken(null);
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to revoke token.');
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!rawToken) return;
    await Clipboard.setStringAsync(rawToken);
    setCopyLabel('copied');
    setTimeout(() => setCopyLabel('copy'), 2000);
  }

  async function copyField(key: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((c) => (c === key ? null : c)), 2000);
  }

  // ── locale ────────────────────────────────────────────────────────────────
  async function setLocale(next: Locale) {
    if (!user || next === locale) return;
    setBusy(true);
    // Persist on the profile row (RLS restricts to the current user).
    await supabase.from('profiles').update({ locale: next }).eq('id', user.id);
    // Apply RTL direction; takes full effect after the next reload.
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(isRTL(next));
    setBusy(false);
    // SessionProvider will pick up the new locale on the next auth/profile refresh;
    // for an immediate switch, M6 can add a profile-refetch helper. The toggle UI
    // below still reflects the chosen value optimistically via `selected`.
  }

  async function onSignOut() {
    setBusy(true);
    await supabase.auth.signOut();
    // onAuthStateChange fires SIGNED_OUT -> root gate redirects to (auth)/sign-in.
    setBusy(false);
  }

  const selected = locale;

  const ingestUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? '<SUPABASE_URL>'}/functions/v1/ingest-sms`;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
    <ScrollView className="flex-1 bg-white px-6 pt-6">
      <Text className="text-2xl font-bold text-gray-900 mb-6">
        {t('settings.title', locale)}
      </Text>

      <Text className="text-sm uppercase text-gray-400 mb-1">
        {t('settings.account', locale)}
      </Text>
      <Text className="text-base text-gray-900 mb-6" testID="settings-email">
        {user?.email ?? '—'}
      </Text>

      <Text className="text-sm uppercase text-gray-400 mb-2">
        {t('settings.language', locale)}
      </Text>
      <View className="flex-row gap-3 mb-8">
        <TouchableOpacity
          disabled={busy}
          onPress={() => setLocale('en')}
          className={
            selected === 'en'
              ? 'flex-1 items-center py-3 rounded-lg bg-blue-600'
              : 'flex-1 items-center py-3 rounded-lg bg-gray-100'
          }
          testID="locale-en"
        >
          <Text className={selected === 'en' ? 'text-white font-semibold' : 'text-gray-800'}>
            {t('settings.langEnglish', locale)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={() => setLocale('ar')}
          className={
            selected === 'ar'
              ? 'flex-1 items-center py-3 rounded-lg bg-blue-600'
              : 'flex-1 items-center py-3 rounded-lg bg-gray-100'
          }
          testID="locale-ar"
        >
          <Text className={selected === 'ar' ? 'text-white font-semibold' : 'text-gray-800'}>
            {t('settings.langArabic', locale)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── SMS Auto-Capture ─────────────────────────────────────────────── */}
      <Text className="text-sm uppercase text-gray-400 mb-1">
        {t('sms_capture', locale)}
      </Text>
      <Text className="text-sm text-gray-500 mb-3">{t('sms_token_intro', locale)}</Text>

      {/* Token display (shown once right after generate/regenerate) */}
      {rawToken ? (
        <View className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 gap-2">
          <Text
            selectable
            testID="token-value"
            className="font-mono text-sm text-gray-900 break-all"
          >
            {rawToken}
          </Text>
          <Text className="text-xs text-amber-700">{t('token_shown_once', locale)}</Text>
          <TouchableOpacity
            testID="copy-token"
            onPress={onCopy}
            className="self-start rounded-md bg-amber-200 px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-amber-900">
              {t(copyLabel, locale)}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Token action error */}
      {tokenError ? (
        <Text testID="token-error" className="text-sm text-red-600 mb-2">
          {tokenError}
        </Text>
      ) : null}

      {/* Generate (no active token) or Regenerate + Revoke (active token) */}
      {!hasToken ? (
        <TouchableOpacity
          disabled={busy}
          testID="gen-token"
          onPress={onGenerateToken}
          className="mb-3 rounded-lg bg-blue-600 py-3 items-center"
        >
          <Text className="text-white font-semibold">{t('generate_token', locale)}</Text>
        </TouchableOpacity>
      ) : (
        <View className="flex-row gap-3 mb-3">
          <TouchableOpacity
            disabled={busy}
            testID="regen-token"
            onPress={onGenerateToken}
            className="flex-1 rounded-lg bg-blue-100 py-3 items-center"
          >
            <Text className="text-blue-700 font-semibold">{t('regenerate_token', locale)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={busy}
            testID="revoke-token"
            onPress={onRevokeToken}
            className="flex-1 rounded-lg border border-red-300 py-3 items-center"
          >
            <Text className="text-red-600 font-semibold">{t('revoke_token', locale)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── iOS Shortcut guide (collapsible) ─────────────────────────────── */}
      <TouchableOpacity
        testID="shortcut-guide-toggle"
        onPress={() => setGuideOpen((o) => !o)}
        className="flex-row items-center justify-between mb-2"
      >
        <Text className="text-sm font-semibold text-blue-700">
          {t('shortcut_guide', locale)}
        </Text>
        <Text className="text-sm text-blue-700">{guideOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {guideOpen ? (
        <View className="rounded-lg border border-gray-100 bg-gray-50 p-4 mb-6 gap-2">
          <Text className="text-sm font-semibold text-gray-800 mb-1">
            {locale === 'ar' ? 'الخطوات:' : 'Steps:'}
          </Text>
          {(locale === 'ar'
            ? [
                '١. الاختصارات ← الأتمتة ← جديد ← رسالة',
                '٢. "الرسالة تحتوي على: EGP" أو "جنيه" أو اسم المرسِل البنكي ← تشغيل فوري',
                '٣. أضف إجراء "الحصول على محتويات URL" ← الطريقة POST',
                '٤. أضف رأس Content-Type: application/json',
                '٥. الصِق القيم أدناه: الرابط، ورأس apikey، ونص الطلب (JSON)',
                '٦. في نص JSON استبدل <Shortcut Input> بمتغير "مدخلات الاختصار" و<token> برمزك',
              ]
            : [
                '1. Shortcuts → Automation → New → Message',
                '2. "Message Contains: EGP" (or "جنيه" / your bank sender) → Run Immediately',
                '3. Add action "Get Contents of URL" → Method: POST',
                '4. Add header Content-Type: application/json',
                '5. Paste the values below: the URL, an apikey header, and the JSON body',
                '6. In the JSON body, replace <Shortcut Input> with the "Shortcut Input" magic variable and <token> with your token',
              ]
          ).map((step, i) => (
            <Text key={i} className="text-xs text-gray-700 leading-5">
              {step}
            </Text>
          ))}

          {/* Copyable values */}
          {[
            { key: 'url', label: locale === 'ar' ? 'الرابط (URL)' : 'URL', value: ingestUrl },
            {
              key: 'apikey',
              label: 'apikey',
              value: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '<anon key>',
            },
            {
              key: 'body',
              label: locale === 'ar' ? 'نص الطلب (JSON)' : 'Request Body (JSON)',
              value: '{ "text": "<Shortcut Input>", "token": "<paste your token>" }',
            },
          ].map((f) => (
            <View
              key={f.key}
              className="mt-2 rounded-md border border-gray-200 bg-white p-2 gap-1"
            >
              <Text className="text-[11px] font-semibold uppercase text-gray-400">
                {f.label}
              </Text>
              <Text selectable className="font-mono text-xs text-gray-900 break-all">
                {f.value}
              </Text>
              <TouchableOpacity
                testID={`copy-${f.key}`}
                onPress={() => copyField(f.key, f.value)}
                className="self-start rounded bg-gray-200 px-2 py-1"
              >
                <Text className="text-[11px] font-semibold text-gray-700">
                  {t(copiedField === f.key ? 'copied' : 'copy', locale)}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        disabled={busy}
        onPress={onSignOut}
        className="border border-red-500 rounded-lg py-3 items-center mb-8"
        testID="sign-out"
      >
        <Text className="text-red-600 font-semibold">{t('settings.signOut', locale)}</Text>
      </TouchableOpacity>
    </ScrollView>
    </SafeAreaView>
  );
}
