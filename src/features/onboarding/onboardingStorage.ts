import AsyncStorage from '@react-native-async-storage/async-storage';

// One-time gating for the SMS auto-capture tutorial. Persisted per user so it
// shows once to a new account and never auto-shows again (it stays reachable
// from Settings).
const seenKey = (userId: string) => `sms_tutorial_seen_v1_${userId}`;

// Only auto-show to genuinely new accounts, so the tutorial is never pushed at
// existing users when this ships as an OTA. A brand-new sign-up has a
// just-created auth user; the window is generous to absorb email-confirm delay.
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function getSmsTutorialSeen(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(seenKey(userId))) === '1';
  } catch {
    return false;
  }
}

export function markSmsTutorialSeen(userId: string): void {
  AsyncStorage.setItem(seenKey(userId), '1').catch(() => {});
}

/** True if the auth user was created within the new-account window. */
export function isNewAccount(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < NEW_ACCOUNT_WINDOW_MS;
}
