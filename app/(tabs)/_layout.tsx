import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';
import { usePending } from '@/src/features/transactions/usePending';

export default function TabsLayout() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const { count: pendingCount } = usePending();

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#2563eb', headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home', locale),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: t('tabs.capture', locale),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="pending"
        options={{
          title: t('pending_title', locale),
          tabBarBadge: pendingCount || undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail-unread-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('tabs.transactions', locale),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings', locale),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
