import React, { useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/src/features/auth/SessionProvider';
import { markSmsTutorialSeen } from '@/src/features/onboarding/onboardingStorage';
import { SmsTutorialAnimated } from '@/src/features/onboarding/SmsTutorialAnimated';
import { AppText, PrimaryButton } from '@/src/ui';
import { t } from '@/src/lib/i18n';
import type { Locale } from '@/src/types';

/**
 * Onboarding tutorial screen for SMS auto-capture. Auto-shown once to new
 * accounts (gated in app/_layout.tsx) and reachable anytime from Settings
 * (`/onboarding?from=settings`). Dismissing marks it seen for this user.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, user } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';

  const finish = useCallback(() => {
    if (user) markSmsTutorialSeen(user.id);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router, user]);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="bg-canvas flex-1">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <SmsTutorialAnimated locale={locale} />
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: 0.5,
          borderTopColor: '#1F2725',
          gap: 10,
        }}
      >
        <PrimaryButton
          label={t(fromSettings ? 'sms_tut.done' : 'sms_tut.start', locale)}
          onPress={finish}
        />
        {!fromSettings && (
          <Pressable onPress={finish} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <AppText className="text-ink2" style={{ fontSize: 14 }}>
              {t('sms_tut.skip', locale)}
            </AppText>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
