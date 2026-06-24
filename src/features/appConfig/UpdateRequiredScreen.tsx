import React from 'react';
import { View, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText, PrimaryButton } from '@/src/ui';
import { t } from '@/src/lib/i18n';
import type { Locale } from '@/src/types';

// App Store deep link (ascAppId from eas.json). itms-apps opens the App Store app.
const STORE_URL = 'itms-apps://apps.apple.com/app/id6777166627';

/**
 * Full-screen, non-dismissible gate shown when the installed app version is
 * below the remote minimum. The only action is to open the App Store.
 */
export function UpdateRequiredScreen({ locale }: { locale: Locale }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0B100F',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 16,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: 'rgba(43,217,142,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <MaterialCommunityIcons name="arrow-up-circle" size={34} color="#2BD98E" />
      </View>
      <AppText weight="bold" style={{ fontSize: 22, textAlign: 'center' }}>
        {t('update.title', locale)}
      </AppText>
      <AppText
        className="text-ink2"
        style={{ fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 8 }}
      >
        {t('update.body', locale)}
      </AppText>
      <View style={{ width: '100%', maxWidth: 320 }}>
        <PrimaryButton label={t('update.cta', locale)} onPress={() => Linking.openURL(STORE_URL)} />
      </View>
    </View>
  );
}
