// Custom entry point.
//
// On Android we register a Headless JS task that receives bank notifications
// from the NotificationListenerService even when the app is backgrounded or
// killed (see src/features/ingest/androidCapture.ts). This MUST run before
// expo-router/entry so the task is registered when the OS launches the headless
// service. On iOS this block is skipped entirely (the listener is Android-only).
import { AppRegistry, Platform } from 'react-native';

if (Platform.OS === 'android') {
  // Literal name required by the native service — mirrors the library's
  // RNAndroidNotificationListenerHeadlessJsName constant. Using the literal
  // avoids ESM/CJS interop pitfalls in the entry file.
  const HEADLESS_TASK = 'RNAndroidNotificationListenerHeadlessJs';
  const { headlessNotificationListener } = require('./src/features/ingest/androidCapture');
  AppRegistry.registerHeadlessTask(HEADLESS_TASK, () => headlessNotificationListener);
}

// Boot Expo Router (both platforms). require() ensures it runs AFTER the
// headless registration above rather than being hoisted by a static import.
require('expo-router/entry');
