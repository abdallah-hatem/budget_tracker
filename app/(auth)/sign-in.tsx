import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { t, isRTL } from '@/src/lib/i18n';
import { useAuthLocale } from '@/src/hooks/useAuthLocale';
import { SocialAuthButtons } from '@/src/features/auth/SocialAuthButtons';
import { AppText, LanguageToggle } from '@/src/ui';
import { FONT } from '@/src/lib/font';

const RESEND_COOLDOWN = 60; // seconds

export default function SignIn() {
  const [locale, setLocale] = useAuthLocale();
  const rtl = isRTL(locale);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when sign-in fails because the email isn't confirmed yet → offer resend.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function onSubmit() {
    setError(null);
    setUnconfirmed(false);
    setResent(false);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      const notConfirmed =
        (error as { code?: string }).code === 'email_not_confirmed' ||
        /not confirmed|confirm your email/i.test(error.message);
      if (notConfirmed) {
        setUnconfirmed(true);
        setError(t('auth.emailNotConfirmed', locale));
      } else {
        setError(error.message || t('auth.genericError', locale));
      }
    }
    // On success, onAuthStateChange fires and the root gate redirects to (tabs).
  }

  async function onResend() {
    if (cooldown > 0 || !email) return;
    setResent(false);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      setError(error.message || t('auth.genericError', locale));
      return;
    }
    setResent(true);
    setCooldown(RESEND_COOLDOWN);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0B0F0E' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 28,
          paddingVertical: 48,
        }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Language toggle (no profile yet → device-level auth locale) */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <LanguageToggle locale={locale} onChange={setLocale} />
        </View>

        {/* Wordmark */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <AppText
            style={{
              fontFamily: FONT.sora,
              fontSize: 32,
              color: '#2BD98E',
              letterSpacing: -0.5,
            }}
          >
            {locale === 'ar' ? 'مصاريف' : 'Masareef'}
          </AppText>
          <AppText
            weight="medium"
            className="text-ink3"
            style={{ fontSize: 13, marginTop: 4 }}
          >
            {t('auth.signIn.title', locale)}
          </AppText>
        </View>

        {/* Email input */}
        <AppText weight="medium" className="text-ink2" style={{ fontSize: 13, marginBottom: 6, textAlign: rtl ? 'right' : 'left' }}>
          {t('auth.email', locale)}
        </AppText>
        <TextInput
          style={{
            backgroundColor: '#14191A',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 15,
            color: '#F4F7F5',
            fontFamily: FONT.jakarta,
            marginBottom: 14,
          }}
          placeholderTextColor="#6B7672"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="email-input"
        />

        {/* Password input */}
        <AppText weight="medium" className="text-ink2" style={{ fontSize: 13, marginBottom: 6, textAlign: rtl ? 'right' : 'left' }}>
          {t('auth.password', locale)}
        </AppText>
        <TextInput
          style={{
            backgroundColor: '#14191A',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 15,
            color: '#F4F7F5',
            fontFamily: FONT.jakarta,
            marginBottom: 14,
          }}
          placeholderTextColor="#6B7672"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          testID="password-input"
        />

        {/* Error */}
        {error ? (
          <AppText
            testID="error-text"
            className="text-danger"
            style={{ fontSize: 13, marginBottom: 14, lineHeight: 19 }}
          >
            {error}
          </AppText>
        ) : null}

        {/* Resend verification (shown when the email isn't confirmed yet) */}
        {unconfirmed ? (
          <TouchableOpacity testID="resend-button" onPress={onResend} disabled={cooldown > 0} style={{ marginBottom: 14 }}>
            <AppText weight="semibold" className="text-accent" style={{ fontSize: 13 }}>
              {cooldown > 0 ? `${t('auth.resendIn', locale)} ${cooldown}s` : t('auth.resend', locale)}
            </AppText>
          </TouchableOpacity>
        ) : null}
        {resent ? (
          <AppText testID="resent-text" className="text-accent" style={{ fontSize: 13, marginBottom: 14 }}>
            {t('auth.resent', locale)}
          </AppText>
        ) : null}

        {/* Submit */}
        <TouchableOpacity
          style={{
            backgroundColor: busy ? '#1FB877' : '#2BD98E',
            borderRadius: 16,
            paddingVertical: 15,
            alignItems: 'center',
            marginBottom: 20,
            opacity: busy ? 0.8 : 1,
          }}
          disabled={busy}
          onPress={onSubmit}
          testID="submit-button"
        >
          {busy ? (
            <ActivityIndicator color="#06251A" />
          ) : (
            <AppText
              weight="semibold"
              style={{ fontSize: 15, color: '#06251A' }}
            >
              {t('auth.signInButton', locale)}
            </AppText>
          )}
        </TouchableOpacity>

        {/* Google / Apple sign-in */}
        <SocialAuthButtons locale={locale} onError={setError} />

        {/* Link to sign up */}
        <Link href={"/(auth)/sign-up" as never} style={{ textAlign: 'center' }}>
          <AppText
            weight="medium"
            className="text-accent"
            style={{ fontSize: 14 }}
          >
            {t('auth.toSignUp', locale)}
          </AppText>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
