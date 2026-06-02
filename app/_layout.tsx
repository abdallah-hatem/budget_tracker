import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '@/src/features/auth/SessionProvider';
import { redirectTarget } from '@/src/features/auth/redirectTarget';

function RootNavigator() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = (segments[0] as string) === '(auth)';
    const target = redirectTarget({
      loading,
      hasSession: !!session,
      inAuthGroup,
    });
    if (target) router.replace(target as never);
  }, [loading, session, segments, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      {/* Dark status-bar content (black time/battery icons) on our light screens. */}
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}
