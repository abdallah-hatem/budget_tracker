import React from 'react';
import { View } from 'react-native';
import { Pill } from './Pill';
import { t } from '../lib/i18n';
import type { Locale } from '../types';

/**
 * Small EN / العربية toggle for the auth screens, where there's no profile yet
 * to read the language from. Drives the device-level auth locale.
 */
export function LanguageToggle({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (l: Locale) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pill
        testID="auth-lang-en"
        label={t('settings.langEnglish', locale)}
        active={locale === 'en'}
        onPress={() => onChange('en')}
      />
      <Pill
        testID="auth-lang-ar"
        label={t('settings.langArabic', locale)}
        active={locale === 'ar'}
        onPress={() => onChange('ar')}
      />
    </View>
  );
}
