import { Text, View } from 'react-native';
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';

// STUB: Milestone 5 replaces this with the voice/text capture + ConfirmSheet.
export default function Capture() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  return (
    <View className="flex-1 items-center justify-center bg-white" testID="capture-stub">
      <Text className="text-gray-500">{t('capture.placeholder', locale)}</Text>
    </View>
  );
}
