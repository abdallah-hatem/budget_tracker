import { useEffect } from 'react';
import { t } from '../../lib/i18n';
import type { Locale } from '../../types';

// expo-quick-actions is a NATIVE module — absent in Expo Go / web / jest. Resolve
// it defensively at module load (like useSpeechRecognition) so importing this
// hook never crashes; it just becomes a no-op when unavailable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let QA: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let routingHookImpl: ((cb?: any) => void) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  QA = require('expo-quick-actions');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  routingHookImpl = require('expo-quick-actions/router').useQuickActionRouting;
} catch {
  QA = null;
  routingHookImpl = null;
}

// Stable binding decided ONCE at module load so hook call-order never changes.
const useRouting = (routingHookImpl ?? (() => {})) as () => void;

/**
 * Home-screen icon long-press quick actions: Voice / Type / Manual / Transactions.
 * Each routes via its `params.href` (handled by useQuickActionRouting, which must
 * live in a sub-layout — we call this from app/(tabs)/_layout.tsx). The capture
 * hrefs reuse the existing masareef://capture?mode=… deep-link target.
 *
 * Native only (ships with a build, not OTA). Localized to the user's locale.
 */
export function useHomeQuickActions(locale: Locale): void {
  // Navigates to params.href when an action is selected (incl. the one that
  // cold-launched the app).
  useRouting();

  useEffect(() => {
    if (!QA?.setItems) return;
    QA.setItems([
      { id: 'voice', title: t('qa.voice', locale), icon: 'symbol:mic.fill', params: { href: '/capture?mode=voice' } },
      { id: 'type', title: t('qa.type', locale), icon: 'symbol:keyboard', params: { href: '/capture?mode=type' } },
      { id: 'manual', title: t('qa.manual', locale), icon: 'symbol:plus.circle', params: { href: '/capture?mode=manual' } },
      { id: 'list', title: t('qa.list', locale), icon: 'symbol:list.bullet', params: { href: '/(tabs)/transactions' } },
    ]).catch(() => {});
  }, [locale]);
}
