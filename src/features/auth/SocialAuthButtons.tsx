import React, { useState } from 'react';
import { View } from 'react-native';
import { AppText } from '../../ui';
import { t } from '../../lib/i18n';
import type { Locale } from '../../types';
import { signInWithApple, appleAuthAvailable, type SocialResult } from './socialAuth';

// Native Apple button (Apple requires their official button style on iOS).
const Apple = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-apple-authentication');
  } catch {
    return null;
  }
})();

/**
 * Apple + Google sign-in buttons, shown on both the sign-in and sign-up screens.
 * On success the SessionProvider's onAuthStateChange drives navigation; only
 * non-cancel errors are surfaced via onError.
 */
export function SocialAuthButtons({
  locale,
  onError,
}: {
  locale: Locale;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState<null | 'apple'>(null);
  const showApple = appleAuthAvailable() && Apple;
  if (!showApple) return null;

  const handle = (provider: 'apple', fn: () => Promise<SocialResult>) => async () => {
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
    </View>
  );
}
