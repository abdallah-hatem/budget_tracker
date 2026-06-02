import { Text, View } from 'react-native';
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';

// STUB: Milestone 6 replaces this with the Dashboard.
export default function Home() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  return (
    <View className="flex-1 items-center justify-center bg-white" testID="home-stub">
      <Text className="text-gray-500">{t('home.placeholder', locale)}</Text>
    </View>
  );
}
