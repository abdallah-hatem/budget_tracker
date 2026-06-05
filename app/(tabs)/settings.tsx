import { useCallback, useEffect, useState } from 'react';
import { Alert, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { t, isRTL } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';
import {
  createIngestToken,
  revokeIngestTokens,
  hasActiveIngestToken,
} from '@/src/features/ingest/api';
import {
  listAccountBalances,
  createAccount,
  updateAccount,
  setDefaultAccount,
  deleteAccount,
} from '@/src/features/accounts/api';
import * as Clipboard from 'expo-clipboard';
import type { Locale, AccountBalance } from '@/src/types';
import { Screen, Card, AppText, SectionLabel, Pill, Money } from '@/src/ui';
import { FONT } from '@/src/lib/font';

export default function Settings() {
  const { user, profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
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
    // RTL is driven purely by JS (locale + manual row-reverse + writingDirection).
    // DO NOT call I18nManager.forceRTL — it would double-flip layouts after reload.
    // SessionProvider will pick up the new locale on the next auth/profile refresh;
    // the toggle UI below still reflects the chosen value optimistically via `selected`.
    setBusy(false);
  }

  // ── accounts ────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formBalance, setFormBalance] = useState('');
  const [formDefault, setFormDefault] = useState(false);

  const reloadAccounts = useCallback(() => {
    listAccountBalances().then(setAccounts).catch(() => {});
  }, []);
  useEffect(() => {
    reloadAccounts();
  }, [reloadAccounts]);

  function openCreate() {
    setEditId(null);
    setFormName('');
    setFormBalance('');
    setFormDefault(false);
    setFormOpen(true);
  }
  function openEdit(a: AccountBalance) {
    setEditId(a.id);
    setFormName(a.name);
    setFormBalance(String(a.opening_balance));
    setFormDefault(false);
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditId(null);
  }

  async function onSubmitForm() {
    if (formName.trim() === '') return;
    setBusy(true);
    try {
      const opening = parseFloat(formBalance) || 0;
      if (editId) {
        await updateAccount(editId, { name: formName.trim(), opening_balance: opening });
      } else {
        await createAccount({ name: formName.trim(), opening_balance: opening, is_default: formDefault });
      }
      closeForm();
      reloadAccounts();
    } finally {
      setBusy(false);
    }
  }
  async function onSetDefault(id: string) {
    setBusy(true);
    try {
      await setDefaultAccount(id);
      reloadAccounts();
    } finally {
      setBusy(false);
    }
  }
  function onDelete(id: string) {
    Alert.alert(t('accounts.delete', locale), t('accounts.delete_confirm', locale), [
      { text: t('accounts.cancel', locale), style: 'cancel' },
      {
        text: t('accounts.delete', locale),
        style: 'destructive',
        onPress: async () => {
          await deleteAccount(id);
          reloadAccounts();
        },
      },
    ]);
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    // onAuthStateChange fires SIGNED_OUT -> root gate redirects to (auth)/sign-in.
    setBusy(false);
  }

  function onSignOut() {
    Alert.alert(t('settings.signOut', locale), t('settings.signOutConfirm', locale), [
      { text: t('settings.cancel', locale), style: 'cancel' },
      { text: t('settings.signOut', locale), style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  const selected = locale;

  const ingestUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? '<SUPABASE_URL>'}/functions/v1/ingest-sms`;

  return (
    <Screen scroll padded>
      {/* ── Page title ─────────────────────────────────────────────────────── */}
      <AppText
        weight="bold"
        className="text-ink"
        style={{ fontSize: 28, marginTop: 8, marginBottom: 24, textAlign: rtl ? 'right' : 'left' }}
      >
        {t('settings.title', locale)}
      </AppText>

      {/* ── ACCOUNT ────────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <SectionLabel>{t('settings.account', locale)}</SectionLabel>
        <AppText
          testID="settings-email"
          className="text-ink"
          style={{ fontSize: 15, marginTop: 10, textAlign: rtl ? 'right' : 'left' }}
        >
          {user?.email ?? '—'}
        </AppText>
      </Card>

      {/* ── ACCOUNTS ───────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <SectionLabel>{t('settings.accounts', locale)}</SectionLabel>
        <View style={{ marginTop: 12, gap: 14 }}>
          {accounts.map((a) => (
            <View key={a.id} testID={`account-row-${a.id}`} style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                  <AppText weight="semibold" className="text-ink" style={{ fontSize: 15 }}>
                    {a.name}
                  </AppText>
                  {a.is_default ? (
                    <View style={{ backgroundColor: 'rgba(43,217,142,0.16)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <AppText weight="semibold" className="text-accent" style={{ fontSize: 10 }}>
                        {t('accounts.default', locale)}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <Money amount={a.balance} tone="ink" sign="auto" size={15} />
              </View>
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 16 }}>
                {!a.is_default ? (
                  <TouchableOpacity testID={`account-setdefault-${a.id}`} disabled={busy} onPress={() => onSetDefault(a.id)}>
                    <AppText className="text-accent" style={{ fontSize: 12 }}>{t('accounts.set_default', locale)}</AppText>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity testID={`account-edit-${a.id}`} onPress={() => openEdit(a)}>
                  <AppText className="text-ink2" style={{ fontSize: 12 }}>{t('accounts.edit', locale)}</AppText>
                </TouchableOpacity>
                {!a.is_default ? (
                  <TouchableOpacity testID={`account-delete-${a.id}`} onPress={() => onDelete(a.id)}>
                    <AppText className="text-danger" style={{ fontSize: 12 }}>{t('accounts.delete', locale)}</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        {/* Inline create / edit form */}
        {formOpen ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <TextInput
              testID="account-name-input"
              value={formName}
              onChangeText={setFormName}
              placeholder={t('accounts.name', locale)}
              placeholderTextColor="#6B7672"
              style={{ backgroundColor: '#1C2322', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#F4F7F5', fontFamily: FONT.jakartaMd, fontSize: 15, textAlign: rtl ? 'right' : 'left' }}
            />
            <TextInput
              testID="account-balance-input"
              value={formBalance}
              onChangeText={setFormBalance}
              keyboardType="numeric"
              placeholder={t('accounts.starting_balance', locale)}
              placeholderTextColor="#6B7672"
              style={{ backgroundColor: '#1C2322', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#F4F7F5', fontFamily: FONT.soraSb, fontSize: 15, textAlign: rtl ? 'right' : 'left' }}
            />
            {editId === null ? (
              <TouchableOpacity
                testID="account-makedefault-toggle"
                onPress={() => setFormDefault((d) => !d)}
                style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: '#2BD98E', backgroundColor: formDefault ? '#2BD98E' : 'transparent' }} />
                <AppText className="text-ink2" style={{ fontSize: 13 }}>{t('accounts.make_default', locale)}</AppText>
              </TouchableOpacity>
            ) : null}
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
              <TouchableOpacity
                testID="account-create-submit"
                disabled={busy || formName.trim() === ''}
                onPress={onSubmitForm}
                style={{ flex: 1, backgroundColor: '#2BD98E', borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: formName.trim() === '' ? 0.5 : 1 }}
              >
                <AppText weight="semibold" style={{ fontSize: 14, color: '#06251A' }}>{t('accounts.save', locale)}</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                testID="account-form-cancel"
                onPress={closeForm}
                style={{ flex: 1, backgroundColor: '#14191A', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <AppText weight="semibold" className="text-ink2" style={{ fontSize: 14 }}>{t('accounts.cancel', locale)}</AppText>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            testID="accounts-add"
            onPress={openCreate}
            style={{ marginTop: 14, backgroundColor: 'rgba(43,217,142,0.12)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <AppText weight="semibold" className="text-accent" style={{ fontSize: 14 }}>{t('accounts.add', locale)}</AppText>
          </TouchableOpacity>
        )}
      </Card>

      {/* ── LANGUAGE ───────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <SectionLabel>{t('settings.language', locale)}</SectionLabel>
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10, marginTop: 12 }}>
          <Pill
            testID="locale-en"
            label={t('settings.langEnglish', locale)}
            active={selected === 'en'}
            onPress={() => !busy && setLocale('en')}
          />
          <Pill
            testID="locale-ar"
            label={t('settings.langArabic', locale)}
            active={selected === 'ar'}
            onPress={() => !busy && setLocale('ar')}
          />
        </View>
      </Card>

      {/* ── SMS AUTO-CAPTURE ───────────────────────────────────────────────── */}
      <Card className="mb-4">
        <SectionLabel>{t('sms_capture', locale)}</SectionLabel>
        <AppText
          className="text-ink2"
          style={{ fontSize: 14, marginTop: 10, marginBottom: 16, lineHeight: 20, textAlign: rtl ? 'right' : 'left' }}
        >
          {t('sms_token_intro', locale)}
        </AppText>

        {/* Token error */}
        {tokenError ? (
          <AppText
            testID="token-error"
            className="text-danger"
            style={{ fontSize: 13, marginBottom: 12 }}
          >
            {tokenError}
          </AppText>
        ) : null}

        {/* Token display (shown once right after generate/regenerate) */}
        {rawToken ? (
          <View
            style={{
              backgroundColor: '#1C2322',
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              gap: 8,
            }}
          >
            <AppText
              testID="token-value"
              selectable
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                color: '#F4F7F5',
                letterSpacing: 0.5,
              }}
            >
              {rawToken}
            </AppText>
            <AppText
              className="text-warning"
              style={{ fontSize: 12, lineHeight: 17 }}
            >
              {t('token_shown_once', locale)}
            </AppText>
            <TouchableOpacity
              testID="copy-token"
              onPress={onCopy}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(43,217,142,0.16)',
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 6,
              }}
            >
              <AppText
                weight="semibold"
                className="text-accent"
                style={{ fontSize: 12 }}
              >
                {t(copyLabel, locale)}
              </AppText>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Generate (no active token) or Regenerate + Revoke (active token) */}
        {!hasToken ? (
          <TouchableOpacity
            disabled={busy}
            testID="gen-token"
            onPress={onGenerateToken}
            style={{
              backgroundColor: busy ? '#1FB877' : '#2BD98E',
              borderRadius: 16,
              paddingVertical: 15,
              alignItems: 'center',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <AppText
              weight="semibold"
              style={{ fontSize: 15, color: '#06251A' }}
            >
              {t('generate_token', locale)}
            </AppText>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
            <TouchableOpacity
              disabled={busy}
              testID="regen-token"
              onPress={onGenerateToken}
              style={{
                flex: 1,
                backgroundColor: 'rgba(43,217,142,0.12)',
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <AppText
                weight="semibold"
                className="text-accent"
                style={{ fontSize: 14 }}
              >
                {t('regenerate_token', locale)}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busy}
              testID="revoke-token"
              onPress={onRevokeToken}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#FF5C6C',
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <AppText
                weight="semibold"
                className="text-danger"
                style={{ fontSize: 14 }}
              >
                {t('revoke_token', locale)}
              </AppText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── iOS Shortcut guide (collapsible) ───────────────────────────── */}
        <TouchableOpacity
          testID="shortcut-guide-toggle"
          onPress={() => setGuideOpen((o) => !o)}
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
          }}
        >
          <AppText
            weight="semibold"
            className="text-accent"
            style={{ fontSize: 14 }}
          >
            {t('shortcut_guide', locale)}
          </AppText>
          <AppText className="text-accent" style={{ fontSize: 14 }}>
            {guideOpen ? '▲' : '▼'}
          </AppText>
        </TouchableOpacity>

        {guideOpen ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            <AppText
              weight="semibold"
              className="text-ink"
              style={{ fontSize: 13, marginBottom: 4, textAlign: rtl ? 'right' : 'left' }}
            >
              {locale === 'ar' ? 'الخطوات:' : 'Steps:'}
            </AppText>
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
              <AppText key={i} className="text-ink2" style={{ fontSize: 12, lineHeight: 19, textAlign: rtl ? 'right' : 'left' }}>
                {step}
              </AppText>
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
                style={{
                  marginTop: 8,
                  backgroundColor: '#1C2322',
                  borderRadius: 12,
                  padding: 10,
                  gap: 6,
                }}
              >
                <AppText
                  weight="semibold"
                  className="text-ink3"
                  style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, textAlign: rtl ? 'right' : 'left' }}
                >
                  {f.label}
                </AppText>
                <AppText
                  selectable
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: '#F4F7F5',
                    lineHeight: 17,
                    textAlign: rtl ? 'right' : 'left',
                  }}
                >
                  {f.value}
                </AppText>
                <View style={{ flexDirection: rtl ? 'row-reverse' : 'row' }}>
                  <TouchableOpacity
                    testID={`copy-${f.key}`}
                    onPress={() => copyField(f.key, f.value)}
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: 'rgba(43,217,142,0.16)',
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                    }}
                  >
                    <AppText
                      weight="semibold"
                      className="text-accent"
                      style={{ fontSize: 11 }}
                    >
                      {t(copiedField === f.key ? 'copied' : 'copy', locale)}
                    </AppText>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {/* ── Sign out ───────────────────────────────────────────────────────── */}
      <TouchableOpacity
        disabled={busy}
        onPress={onSignOut}
        testID="sign-out"
        style={{
          borderWidth: 1,
          borderColor: '#FF5C6C',
          borderRadius: 16,
          paddingVertical: 15,
          alignItems: 'center',
          marginTop: 8,
          marginBottom: 16,
        }}
      >
        <AppText
          weight="semibold"
          className="text-danger"
          style={{ fontSize: 15 }}
        >
          {t('settings.signOut', locale)}
        </AppText>
      </TouchableOpacity>
    </Screen>
  );
}
