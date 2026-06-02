import { useState } from 'react';
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
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';
import { AppText } from '@/src/ui';
import { FONT } from '@/src/lib/font';

export default function SignUp() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setInfo(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message || t('auth.genericError', locale));
      return;
    }
    // If email confirmation is required, there is no session yet.
    if (!data.session) setInfo(t('auth.checkEmail', locale));
    // If confirmation is disabled (local dev), onAuthStateChange redirects to (tabs).
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
            Ledger
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

        {/* Error / Info messages */}
        {error ? (
          <AppText
            testID="error-text"
            className="text-danger"
            style={{ fontSize: 13, marginBottom: 14, lineHeight: 19 }}
          >
            {error}
          </AppText>
        ) : null}
        {info ? (
          <AppText
            testID="info-text"
            className="text-accent"
            style={{ fontSize: 13, marginBottom: 14, lineHeight: 19 }}
          >
            {info}
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
