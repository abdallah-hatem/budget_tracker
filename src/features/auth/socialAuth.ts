// Native Apple sign-in → Supabase. OAuth providers verify the email themselves,
// so this needs NO SMTP / confirmation email (unlike password sign-up). Apple
// returns an identity token; we hand it to Supabase via signInWithIdToken, which
// then drives the normal onAuthStateChange → session.
//
// NOTE: Google sign-in was removed from the current build (its SDK breaks
// `pod install` with the AppCheckCore/GoogleUtilities modular-headers error, and
// Google isn't configured yet). To re-add later: `npx expo install
// @react-native-google-signin/google-signin`, restore its config plugin in
// app.json, and re-add the helper below — see docs/social-login.md.
//
// The Apple SDK is a native module (absent in Expo Go web / jest), so it's lazily
// required and every path degrades gracefully.
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

export type SocialResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; message?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appleModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-apple-authentication');
  } catch {
    return null;
  }
}

/** Sign in with Apple is iOS-only and needs the native module present. */
export function appleAuthAvailable(): boolean {
  return Platform.OS === 'ios' && appleModule() !== null;
}

export async function signInWithApple(): Promise<SocialResult> {
  const Apple = appleModule();
  if (!Apple) return { ok: false, cancelled: false, message: 'Apple sign-in unavailable' };
  try {
    const credential = await Apple.signInAsync({
      requestedScopes: [
        Apple.AppleAuthenticationScope.FULL_NAME,
        Apple.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { ok: false, cancelled: false, message: 'No identity token from Apple' };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { ok: false, cancelled: false, message: error.message };
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // ERR_REQUEST_CANCELED → the user dismissed the native sheet.
    return { ok: false, cancelled: err.code === 'ERR_REQUEST_CANCELED', message: err.message };
  }
}
