// Native Google + Apple sign-in → Supabase. OAuth providers verify the email
// themselves, so this needs NO SMTP / confirmation email (unlike password
// sign-up). The provider returns an identity token; we hand it to Supabase via
// signInWithIdToken, which then drives the normal onAuthStateChange → session.
//
// Both SDKs are native modules (absent in Expo Go / web / jest), so they're
// lazily required and every path degrades gracefully.
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

export type SocialResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; message?: string };

// Google public client IDs (NOT secrets) — set per build env; see
// docs/social-login.md. webClientId is REQUIRED: the idToken's audience must
// match the client id configured on the Supabase Google provider.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

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

let googleConfigured = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function googleModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin');
    if (!googleConfigured) {
      mod.GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID,
      });
      googleConfigured = true;
    }
    return mod;
  } catch {
    return null;
  }
}

/** Google sign-in needs a configured web client id AND the native module.
 *  Check the env FIRST so we never load the native module (and risk a hard
 *  TurboModule "RNGoogleSignin not found" crash on a build that doesn't yet
 *  bundle it) until Google is actually configured. */
export function googleAuthAvailable(): boolean {
  if (!GOOGLE_WEB_CLIENT_ID) return false;
  return googleModule() !== null;
}

export async function signInWithGoogle(): Promise<SocialResult> {
  const mod = googleModule();
  if (!mod) return { ok: false, cancelled: false, message: 'Google sign-in unavailable' };
  const { GoogleSignin } = mod;
  try {
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    // v13+ returns { type: 'cancelled' } or { type: 'success', data: {...} };
    // older versions returned the user object directly. Handle both.
    if (res?.type === 'cancelled') return { ok: false, cancelled: true };
    const idToken = res?.data?.idToken ?? res?.idToken;
    if (!idToken) return { ok: false, cancelled: false, message: 'No idToken from Google' };
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) return { ok: false, cancelled: false, message: error.message };
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const cancelled = err.code === 'SIGN_IN_CANCELLED' || /cancel/i.test(err.message ?? '');
    return { ok: false, cancelled, message: err.message };
  }
}
