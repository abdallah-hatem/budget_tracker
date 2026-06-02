import { Text, View } from 'react-native';
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';

// STUB: Milestone 6 replaces this with the filterable transactions list.
export default function Transactions() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  return (
    <View
      className="flex-1 items-center justify-center bg-white"
      testID="transactions-stub"
    >
      <Text className="text-gray-500">{t('transactions.placeholder', locale)}</Text>
    </View>
  );
}
