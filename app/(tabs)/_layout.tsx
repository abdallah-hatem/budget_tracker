import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/src/lib/i18n';
import { useSession } from '@/src/features/auth/SessionProvider';
import { PendingProvider, usePendingContext } from '@/src/features/transactions/PendingProvider';
import { MonthStartProvider } from '@/src/features/dashboard/MonthStartProvider';
import { useWidgetSync } from '@/src/features/widget/sync';
import { usePendingBadge } from '@/src/features/notifications/usePendingBadge';
import { FloatingTabBar } from '@/src/ui/FloatingTabBar';

function TabsInner() {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const { count: pendingCount } = usePendingContext();
  // Keep the iOS home-screen widget in sync with the current month.
  useWidgetSync();
  // Show the pending count on the app icon badge.
  usePendingBadge(pendingCount);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Prevent white flash between screens — match canvas colour
        sceneStyle: { backgroundColor: '#0B0F0E' },
      }}
    >
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
        name="pending"
        options={{
          title: t('pending_title', locale),
          // The custom bar handles the badge; keep native badge for fallback
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

export default function TabsLayout() {
  return (
    <MonthStartProvider>
      <PendingProvider>
        <TabsInner />
      </PendingProvider>
    </MonthStartProvider>
  );
}
