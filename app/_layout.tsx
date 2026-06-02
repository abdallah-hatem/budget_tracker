import '../global.css';

import { Stack } from 'expo-router';

export default function RootLayout() {
  // NOTE: M3 will wrap this with <SessionProvider> and add the auth redirect
  // gate. Keep the global.css import as the FIRST line in this file.
  return <Stack screenOptions={{ headerShown: false }} />;
}
