import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppText } from '../../ui';
import { t } from '../../lib/i18n';
import type { Locale } from '../../types';
import {
  signInWithApple,
  appleAuthAvailable,
  signInWithGoogle,
  googleAuthAvailable,
  type SocialResult,
} from './socialAuth';

// Native Apple button (Apple requires their official button style on iOS).
const Apple = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-apple-authentication');
  } catch {
    return null;
  }
})();

type Provider = 'apple' | 'google';

/**
 * Apple (iOS) + Google (Android) sign-in buttons, shown on both the sign-in and
 * sign-up screens. On success the SessionProvider's onAuthStateChange drives
 * navigation; only non-cancel errors are surfaced via onError. Each provider
 * auto-hides when it isn't available/configured.
 */
export function SocialAuthButtons({
  locale,
  onError,
}: {
  locale: Locale;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState<null | Provider>(null);
  const showApple = !!(appleAuthAvailable() && Apple);
  const showGoogle = googleAuthAvailable();
  if (!showApple && !showGoogle) return null;

  const handle = (provider: Provider, fn: () => Promise<SocialResult>) => async () => {
    if (busy) return;
    setBusy(provider);
    const res = await fn();
    setBusy(null);
    if (!res.ok && !res.cancelled && res.message) onError?.(res.message);
  };

  return (
    <View style={{ gap: 12, marginBottom: 22 }}>
      {/* divider */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: '#222a28' }} />
        <AppText className="text-ink3" style={{ fontSize: 12 }}>
          {t('auth.or', locale)}
        </AppText>
        <View style={{ flex: 1, height: 1, backgroundColor: '#222a28' }} />
      </View>

      {showApple ? (
        <Apple.AppleAuthenticationButton
          buttonType={Apple.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={16}
          style={{ height: 50, width: '100%' }}
          onPress={handle('apple', signInWithApple)}
        />
      ) : null}

      {showGoogle ? (
        <TouchableOpacity
          testID="google-signin"
          onPress={handle('google', signInWithGoogle)}
          disabled={busy !== null}
          style={{
            height: 50,
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: busy === 'google' ? 0.7 : 1,
          }}
        >
          {busy === 'google' ? (
            <ActivityIndicator color="#1F1F1F" />
          ) : (
            <>
              {/* Google "G" wordmark stand-in (4-color dot) */}
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: '#4285F4',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText weight="bold" style={{ fontSize: 12, color: '#FFFFFF' }}>
                  G
                </AppText>
              </View>
              <AppText weight="semibold" style={{ fontSize: 15, color: '#1F1F1F' }}>
                {t('auth.continueGoogle', locale)}
              </AppText>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
