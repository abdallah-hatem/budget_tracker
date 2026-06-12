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
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';
import { SocialAuthButtons } from '@/src/features/auth/SocialAuthButtons';
import { AppText } from '@/src/ui';
import { FONT } from '@/src/lib/font';

const RESEND_COOLDOWN = 60; // seconds

export default function SignUp() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Once set, we've created an account that needs email confirmation → show the
  // "verify your email" view instead of the form.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message || t('auth.genericError', locale));
      return;
    }
    // Confirmation required → no session yet; switch to the verify view.
    if (!data.session) {
      setSentTo(email);
      setCooldown(RESEND_COOLDOWN);
    }
    // If confirmation is disabled (dev), onAuthStateChange redirects to (tabs).
  }

  async function onResend() {
    if (!sentTo || cooldown > 0) return;
    setError(null);
    setResent(false);
    const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo });
    if (error) {
      setError(error.message || t('auth.genericError', locale));
      return;
    }
    setResent(true);
    setCooldown(RESEND_COOLDOWN);
  }

  // ── Verify-email view ─────────────────────────────────────────────────────
  if (sentTo) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0F0E', justifyContent: 'center', paddingHorizontal: 28 }}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(43,217,142,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Ionicons name="mail-outline" size={34} color="#2BD98E" />
          </View>
          <AppText weight="semibold" style={{ fontSize: 22, color: '#F4F7F5', textAlign: 'center' }}>
            {t('auth.verifyTitle', locale)}
          </AppText>
          <AppText className="text-ink2" style={{ fontSize: 14, marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
            {t('auth.verifySentTo', locale)}
          </AppText>
          <AppText weight="semibold" style={{ fontSize: 15, color: '#2BD98E', marginTop: 2, textAlign: 'center' }}>
            {sentTo}
          </AppText>
          <AppText className="text-ink3" style={{ fontSize: 13, marginTop: 14, textAlign: 'center', lineHeight: 19 }}>
            {t('auth.verifyHint', locale)}
          </AppText>
        </View>

        {error ? (
          <AppText testID="error-text" className="text-danger" style={{ fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
            {error}
          </AppText>
        ) : null}
        {resent && !error ? (
          <AppText testID="resent-text" className="text-accent" style={{ fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
            {t('auth.resent', locale)}
          </AppText>
        ) : null}

        <TouchableOpacity
          testID="resend-button"
          disabled={cooldown > 0}
          onPress={onResend}
          style={{
            backgroundColor: '#14191A',
            borderRadius: 16,
            paddingVertical: 15,
            alignItems: 'center',
            marginBottom: 14,
            opacity: cooldown > 0 ? 0.55 : 1,
          }}
        >
          <AppText weight="semibold" style={{ fontSize: 15, color: '#F4F7F5' }}>
            {cooldown > 0 ? `${t('auth.resendIn', locale)} ${cooldown}s` : t('auth.resend', locale)}
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity testID="go-signin" onPress={() => router.replace('/(auth)/sign-in' as never)} style={{ alignItems: 'center', paddingVertical: 6 }}>
          <AppText weight="medium" className="text-accent" style={{ fontSize: 14 }}>
            {t('auth.goToSignIn', locale)}
          </AppText>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Sign-up form ──────────────────────────────────────────────────────────
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
            {t('auth.signUp.title', locale)}
          </AppText>
        </View>

        {/* Email input */}
        <AppText weight="medium" className="text-ink2" style={{ fontSize: 13, marginBottom: 6 }}>
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
        <AppText weight="medium" className="text-ink2" style={{ fontSize: 13, marginBottom: 6 }}>
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
          autoComplete="password-new"
          value={password}
          onChangeText={setPassword}
          testID="password-input"
        />

        {/* Error message */}
        {error ? (
          <AppText
            testID="error-text"
            className="text-danger"
            style={{ fontSize: 13, marginBottom: 14, lineHeight: 19 }}
          >
            {error}
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
              {t('auth.signUpButton', locale)}
            </AppText>
          )}
        </TouchableOpacity>

        {/* Google / Apple sign-in */}
        <SocialAuthButtons locale={locale} onError={setError} />

        {/* Link to sign in */}
        <Link href={"/(auth)/sign-in" as never} style={{ textAlign: 'center' }}>
          <AppText
            weight="medium"
            className="text-accent"
            style={{ fontSize: 14 }}
          >
            {t('auth.toSignIn', locale)}
          </AppText>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
