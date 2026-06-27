// Native Apple sign-in → Supabase. OAuth providers verify the email themselves,
// so this needs NO SMTP / confirmation email (unlike password sign-up). Apple
// returns an identity token; we hand it to Supabase via signInWithIdToken, which
// then drives the normal onAuthStateChange → session.
//
// Google (Android) is implemented below via @react-native-google-signin.
// (iOS still uses Apple — the Google SDK's iOS pod build is unresolved.)
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

// ---------------------------------------------------------------------------
// Google (native @react-native-google-signin → Supabase signInWithIdToken).
// Android-only for now (the iOS pod build of this SDK is unresolved; iOS uses
// Apple). Needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (the *Web* OAuth client id —
// it's the idToken audience Supabase validates) and a Google *Android* OAuth
// client registered with this app's package + signing SHA-1. See docs/social-login.md.
// ---------------------------------------------------------------------------

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
let googleConfigured = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function googleModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}

/** Google is Android-only here, and needs the native module + a Web client id. */
export function googleAuthAvailable(): boolean {
  return Platform.OS === 'android' && GOOGLE_WEB_CLIENT_ID.length > 0 && googleModule() !== null;
}

export async function signInWithGoogle(): Promise<SocialResult> {
  const mod = googleModule();
  if (!mod || GOOGLE_WEB_CLIENT_ID.length === 0) {
    return { ok: false, cancelled: false, message: 'Google sign-in unavailable' };
  }
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = mod;
  try {
    if (!googleConfigured) {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
      googleConfigured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return { ok: false, cancelled: true }; // user dismissed the account sheet
    }
    const idToken: string | undefined = response.data?.idToken;
    if (!idToken) {
      return { ok: false, cancelled: false, message: 'No idToken from Google' };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { ok: false, cancelled: false, message: error.message };
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const cancelled =
      isErrorWithCode?.(e) && statusCodes && err.code === statusCodes.SIGN_IN_CANCELLED;
    return { ok: false, cancelled: !!cancelled, message: cancelled ? undefined : err.message };
  }
}
