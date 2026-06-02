import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';

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
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="flex-grow justify-center px-6 py-10"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text className="text-3xl font-bold mb-8 text-gray-900">
        {t('auth.signUp.title', locale)}
      </Text>

      <Text className="text-sm text-gray-600 mb-1">{t('auth.email', locale)}</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base text-gray-900"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        testID="email-input"
      />

      <Text className="text-sm text-gray-600 mb-1">{t('auth.password', locale)}</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base text-gray-900"
        secureTextEntry
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
        testID="password-input"
      />

      {error ? (
        <Text className="text-red-600 mb-4" testID="error-text">
          {error}
        </Text>
      ) : null}
      {info ? (
        <Text className="text-green-700 mb-4" testID="info-text">
          {info}
        </Text>
      ) : null}

      <TouchableOpacity
        className="bg-blue-600 rounded-lg py-3 items-center mb-4"
        disabled={busy}
        onPress={onSubmit}
        testID="submit-button"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold text-base">
            {t('auth.signUpButton', locale)}
          </Text>
        )}
      </TouchableOpacity>

      <Link href={"/(auth)/sign-in" as never} className="text-blue-600 text-center">
        {t('auth.toSignIn', locale)}
      </Link>
    </ScrollView>
  );
}
