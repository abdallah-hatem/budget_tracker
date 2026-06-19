import { useCallback, useEffect, useState } from 'react';
import { Alert, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { t, isRTL } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';
import { softDeleteOwnAccount } from '@/src/features/auth/account';
import {
  listAccountBalances,
  createAccount,
  updateAccount,
  setDefaultAccount,
  deleteAccount,
} from '@/src/features/accounts/api';
import type { Locale, AccountBalance } from '@/src/types';
import { Screen, Card, CollapsibleCard, AppText, SectionLabel, Pill, Money } from '@/src/ui';
import { SmsRulesSection } from '@/src/features/rules/SmsRulesSection';
import { MonthStartSection } from '@/src/features/dashboard/MonthStartSection';
import { GoldSection } from '@/src/features/gold/GoldSection';
import { CategoriesSection } from '@/src/features/categories/CategoriesSection';
import { FONT } from '@/src/lib/font';

export default function Settings() {
  const { user, profile, updateProfile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const [busy, setBusy] = useState(false);


  // ── locale ────────────────────────────────────────────────────────────────
  async function setLocale(next: Locale) {
    if (!user || next === locale) return;
    setBusy(true);
    // Flip the whole UI immediately by patching the in-memory profile — no app
    // restart needed. RTL is JS-driven (locale + row-reverse + writingDirection);
    // DO NOT call I18nManager.forceRTL (it double-flips after reload).
    updateProfile({ locale: next });
    // Persist on the profile row (RLS restricts to the current user).
    await supabase.from('profiles').update({ locale: next }).eq('id', user.id);
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

  async function deleteOwnAccount() {
    setBusy(true);
    try {
      // Soft-delete: marks the profile deleted + signs out. The SessionProvider
      // gate then refuses any future session, redirecting to (auth)/sign-in.
      await softDeleteOwnAccount();
    } catch (e) {
      Alert.alert(t('settings.deleteAccount', locale), e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  function onDeleteAccount() {
    Alert.alert(t('settings.deleteAccount', locale), t('settings.deleteAccountConfirm', locale), [
      { text: t('settings.cancel', locale), style: 'cancel' },
      {
        text: t('settings.deleteAccount', locale),
        style: 'destructive',
        onPress: () => void deleteOwnAccount(),
      },
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
      <CollapsibleCard title={t('settings.accounts', locale)} rtl={rtl} testID="section-accounts">
        <View style={{ gap: 14 }}>
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
      </CollapsibleCard>

      {/* ── LANGUAGE ───────────────────────────────────────────────────────── */}
      <CollapsibleCard title={t('settings.language', locale)} rtl={rtl} testID="section-language">
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
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
      </CollapsibleCard>

      {/* ── CATEGORIES ─────────────────────────────────────────────────────── */}
      <CategoriesSection locale={locale} />

      {/* ── GOLD ───────────────────────────────────────────────────────────── */}
      <GoldSection locale={locale} accountsTotal={accounts.reduce((s, a) => s + a.balance, 0)} />

      {/* ── START OF MONTH ─────────────────────────────────────────────────── */}
      <MonthStartSection locale={locale} />

      {/* ── SMS AUTO-CAPTURE ───────────────────────────────────────────────── */}
      <CollapsibleCard title={t('sms_capture', locale)} rtl={rtl} testID="section-sms">
        <AppText
          className="text-ink2"
          style={{ fontSize: 14, marginTop: 10, marginBottom: 12, lineHeight: 20, textAlign: rtl ? 'right' : 'left' }}
        >
          {t('sms_token_intro', locale)}
        </AppText>

        {/* Recommended: the built-in App Intent (auto-appears, no token/import) */}
        <View style={{ backgroundColor: 'rgba(43,217,142,0.10)', borderRadius: 14, padding: 14, marginBottom: 16, gap: 6 }}>
          <AppText weight="semibold" className="text-accent" style={{ fontSize: 13, textAlign: rtl ? 'right' : 'left' }}>
            {t('sms_recommended', locale)}
          </AppText>
          {(locale === 'ar'
            ? [
                '١. افتح مصاريف مرة وأنت مسجّل الدخول.',
                '٢. الاختصارات ← الأتمتة ← + ← رسالة ← «الرسالة تحتوي على EGP» (أو اسم بنكك) ← تشغيل فوري.',
                '٣. أضف إجراء ← «Log SMS to Masareef» ← اضبط Message على «مدخلات الاختصار». تم.',
              ]
            : [
                '1. Open Masareef once while signed in.',
                '2. Shortcuts → Automation → + → Message → "Message Contains EGP" (or your bank) → Run Immediately.',
                '3. Add Action → "Log SMS to Masareef" → set Message → Shortcut Input. Done.',
              ]
          ).map((step, i) => (
            <AppText
              key={i}
              className="text-ink2"
              style={{ fontSize: 13, lineHeight: 19, textAlign: rtl ? 'right' : 'left' }}
            >
              {step}
            </AppText>
          ))}
        </View>

      </CollapsibleCard>

      {/* ── SMS rules (keyword → category/note) ─────────────────────────────── */}
      <SmsRulesSection locale={locale} collapsible />

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
          marginBottom: 12,
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

      {/* ── Delete account (soft delete) ───────────────────────────────────── */}
      <TouchableOpacity
        disabled={busy}
        onPress={onDeleteAccount}
        testID="delete-account"
        style={{ paddingVertical: 12, alignItems: 'center', marginBottom: 24 }}
      >
        <AppText className="text-ink3" style={{ fontSize: 13 }}>
          {t('settings.deleteAccount', locale)}
        </AppText>
      </TouchableOpacity>
    </Screen>
  );
}
