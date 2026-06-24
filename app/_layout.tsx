import '../global.css';
import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Sora_600SemiBold,
  Sora_700Bold,
} from '@expo-google-fonts/sora';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
} from '@expo-google-fonts/readex-pro';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { SessionProvider, useSession } from '@/src/features/auth/SessionProvider';
import { redirectTarget } from '@/src/features/auth/redirectTarget';
import { useNotifications } from '@/src/features/notifications/useNotifications';
import { CaptureProvider } from '@/src/features/capture/CaptureProvider';
import { CategoriesProvider } from '@/src/features/categories/CategoriesProvider';
import { DataSyncProvider } from '@/src/features/sync/dataSync';
import { getSmsTutorialSeen, isNewAccount } from '@/src/features/onboarding/onboardingStorage';
import { useForceUpdate } from '@/src/features/appConfig/useForceUpdate';
import { UpdateRequiredScreen } from '@/src/features/appConfig/UpdateRequiredScreen';
import { initSentry } from '@/src/lib/sentry';

// Crash/error monitoring — must run before the app renders so early crashes
// are captured (no-op in dev; see src/lib/sentry.ts).
initSentry();

// Keep splash visible while fonts load.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, user, profile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  // Force-update gate: block when the installed version is below the remote
  // minimum (app_config). Fails open. Must take precedence over everything.
  const updateRequired = useForceUpdate();

  // Register push token + wire tap-to-navigate deep-link (no-op on simulator).
  useNotifications();

  useEffect(() => {
    const inAuthGroup = (segments[0] as string) === '(auth)';
    const target = redirectTarget({
      loading,
      hasSession: !!session,
      inAuthGroup,
    });
    if (target) router.replace(target as never);
  }, [loading, session, segments, router]);

  // Show the SMS auto-capture tutorial once to a brand-new account after it
  // lands in the app. Gated on a recent created_at + a per-user "seen" flag so
  // it never gets pushed at existing users (OTA-safe). Runs at most once per
  // signed-in session; resets on sign-out.
  const onboardCheckedRef = useRef(false);
  useEffect(() => {
    if (loading || !user) {
      onboardCheckedRef.current = false;
      return;
    }
    if (onboardCheckedRef.current) return;
    if ((segments[0] as string) !== '(tabs)') return; // wait until on the app
    onboardCheckedRef.current = true;
    if (!isNewAccount(user.created_at)) return;
    void getSmsTutorialSeen(user.id).then((seen) => {
      if (!seen) router.push('/onboarding');
    });
  }, [loading, user, segments, router]);

  if (updateRequired) {
    return <UpdateRequiredScreen locale={profile?.locale ?? 'en'} />;
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#2BD98E" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    ReadexPro_400Regular,
    ReadexPro_500Medium,
    ReadexPro_600SemiBold,
    // Preload the category icon font so avatars don't flash on first paint.
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SessionProvider>
        {/* Light status-bar content (white time/battery icons) for dark canvas. */}
        <StatusBar style="light" />
        {/* Global capture engine (mic/type/manual) + its overlays, driven by the
            tab-bar FAB from any screen — so there is no capture tab. DataSync sits
            above it so a capture write can refetch whatever tab is on screen. */}
        <CategoriesProvider>
          <DataSyncProvider>
            <CaptureProvider>
              <RootNavigator />
            </CaptureProvider>
          </DataSyncProvider>
        </CategoriesProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap enables automatic error-boundary + navigation/perf instrumentation.
export default Sentry.wrap(RootLayout);
