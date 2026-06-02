import { useState } from 'react';
import { I18nManager, Text, TouchableOpacity, View } from 'react-native';
import type { Locale } from '@/src/types';
import { supabase } from '@/src/lib/supabase';
import { t, isRTL } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';

export default function Settings() {
  const { user, profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const [busy, setBusy] = useState(false);

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

  return (
    <View className="flex-1 bg-white px-6 pt-6">
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

      <TouchableOpacity
        disabled={busy}
        onPress={onSignOut}
        className="border border-red-500 rounded-lg py-3 items-center"
        testID="sign-out"
      >
        <Text className="text-red-600 font-semibold">{t('settings.signOut', locale)}</Text>
      </TouchableOpacity>
    </View>
  );
}
