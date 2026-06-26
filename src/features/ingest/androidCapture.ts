// Android bank-notification auto-capture.
//
// On Android we can't use iOS Shortcuts. Instead a NotificationListenerService
// (react-native-android-notification-listener) delivers EVERY status-bar
// notification to a Headless JS task — even when the app is backgrounded or
// killed. We forward only notifications whose text contains one of the user's
// configured keywords (e.g. "EGP", "جم" — the word their bank always includes,
// exactly like the iOS "Message Contains" filter) to the same `ingest-sms`
// endpoint the iOS App Intent uses.
//
// IMPORTANT: this module is imported by the headless task (see index.js), which
// runs in a minimal JS context. Keep it dependency-LIGHT — AsyncStorage + fetch
// only. Do NOT import the supabase client or expo-secure-store here (token
// provisioning lives in AndroidCaptureSection, which runs in the full app).

import AsyncStorage from '@react-native-async-storage/async-storage';

const CONFIG_KEY = 'android_capture_v1';

export interface AndroidCaptureConfig {
  enabled: boolean;
  /** Words that must appear in a notification for it to be forwarded. */
  keywords: string[];
  /** Raw ingest token (mirrors createIngestToken) — read by the headless task. */
  token: string | null;
}

const DEFAULT_CONFIG: AndroidCaptureConfig = {
  enabled: false,
  keywords: [],
  token: null,
};

export async function getCaptureConfig(): Promise<AndroidCaptureConfig> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AndroidCaptureConfig>;
    return {
      enabled: !!parsed.enabled,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(Boolean) : [],
      token: typeof parsed.token === 'string' ? parsed.token : null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function setCaptureConfig(
  patch: Partial<AndroidCaptureConfig>,
): Promise<AndroidCaptureConfig> {
  const current = await getCaptureConfig();
  const next: AndroidCaptureConfig = { ...current, ...patch };
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

// ---------------------------------------------------------------------------
// Headless task — runs for every notification (app may be killed).
// ---------------------------------------------------------------------------

interface AndroidNotification {
  time?: string;
  app?: string;
  title?: string;
  titleBig?: string;
  text?: string;
  subText?: string;
  bigText?: string;
}

/**
 * Registered in index.js as the headless task. Receives one notification at a
 * time as a JSON string (or object). Best-effort: NEVER throws — a crash in the
 * headless task can disable the whole listener until reboot.
 */
export const headlessNotificationListener = async ({
  notification,
}: {
  notification?: string | AndroidNotification;
}): Promise<void> => {
  try {
    if (!notification) return;
    const n: AndroidNotification =
      typeof notification === 'string' ? JSON.parse(notification) : notification;

    const cfg = await getCaptureConfig();
    if (!cfg.enabled || cfg.keywords.length === 0 || !cfg.token) return;

    // Prefer the expanded body; fall back to the collapsed text/title.
    const text = [n.title, n.titleBig, n.bigText, n.text, n.subText]
      .filter((s): s is string => !!s && s.trim().length > 0)
      .join('\n')
      .trim();
    if (!text) return;

    const hay = text.toLowerCase();
    const matched = cfg.keywords.some((k) => k && hay.includes(k.toLowerCase()));
    if (!matched) return;

    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;

    await fetch(`${url}/functions/v1/ingest-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({
        text,
        token: cfg.token,
        received_at: new Date().toISOString(),
      }),
    });
  } catch {
    /* swallow — headless tasks must never throw */
  }
};
