/**
 * Notification quick-action presets.
 *
 * A quick action is a user-defined button on the SMS-pending notification. One
 * tap files the pending transaction into a preset category (with its natural
 * expense/income type) and an optional default note, and confirms it — no app
 * open, no edit sheet. The presets drive `setNotificationCategoryAsync` in
 * `useNotifications` and are read back by the notification-response handler.
 *
 * Stored locally (AsyncStorage) since they only affect this device's
 * notification category registration. Pure JS → OTA-able.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TxnType } from '@/src/types';

export interface QuickAction {
  /** Stable id; encoded into the notification action identifier as `quick:<id>`. */
  id: string;
  categorySlug: string;
  /** Derived from the category's kind at creation time. */
  type: TxnType;
  /** Default note applied on tap (may be empty). */
  note: string;
}

const KEY = 'notif_quick_actions_v1';

/** iOS surfaces only a handful of notification actions; cap the presets so the
 *  Confirm / Add note / Edit / Reject actions stay reachable. */
export const MAX_QUICK_ACTIONS = 3;

// In-memory cache so the notification-response handler can resolve a preset
// synchronously (`peekQuickActions`) without an async read in the tight
// post-tap window.
let cache: QuickAction[] | null = null;
const listeners = new Set<() => void>();

export function subscribeQuickActions(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(): void {
  for (const fn of listeners) fn();
}

function isValid(q: unknown): q is QuickAction {
  const v = q as QuickAction;
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.categorySlug === 'string' &&
    (v.type === 'expense' || v.type === 'income') &&
    typeof v.note === 'string'
  );
}

export async function getQuickActions(): Promise<QuickAction[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
    cache = Array.isArray(parsed) ? parsed.filter(isValid).slice(0, MAX_QUICK_ACTIONS) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Last-loaded cache, read synchronously by the notification handler. */
export function peekQuickActions(): QuickAction[] {
  return cache ?? [];
}

export async function setQuickActions(list: QuickAction[]): Promise<void> {
  cache = list.filter(isValid).slice(0, MAX_QUICK_ACTIONS);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* best-effort */
  }
  emit();
}

export function makeQuickActionId(): string {
  return `qa_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
