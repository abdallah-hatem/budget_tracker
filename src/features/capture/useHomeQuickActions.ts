import { useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useCapture } from './CaptureProvider';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useRouting = (routingHookImpl ?? ((_cb?: any) => {})) as (cb?: (action: any) => boolean) => void;

// QuickActions.initial (the action that cold-launched the app) is re-delivered
// every time the routing effect re-runs. Handle it exactly ONCE per app process
// with a module-level guard so it can't retrigger in a loop.
let handledInitial = false;

/**
 * Home-screen icon long-press quick actions: Voice / Type / Manual / Transactions.
 *
 * Selections fire the GLOBAL capture overlays directly (voice / type / manual) or
 * navigate to the list — they do NOT route through the `/capture` deep-link.
 * Routing to `/capture` made `capture.tsx` redirect back to `/(tabs)`, which
 * remounted this layout and re-fired the never-cleared `QuickActions.initial`,
 * causing an endless screen-switching loop.
 *
 * Native only (ships with a build, not OTA). Localized to the user's locale.
 */
export function useHomeQuickActions(locale: Locale): void {
  const router = useRouter();
  const { startVoice, openType, openManual } = useCapture();

  // Return true so the router does NOT also navigate to params.href (which would
  // re-introduce the /capture bounce). Returns false only for unknown actions.
  const handle = useCallback(
    (action: { id?: string } | null | undefined): boolean => {
      if (!action) return false;
      if (QA?.initial && action === QA.initial) {
        if (handledInitial) return true; // already handled this launch → skip
        handledInitial = true;
      }
      switch (action.id) {
        case 'voice':
          startVoice();
          return true;
        case 'type':
          openType();
          return true;
        case 'manual':
          openManual();
          return true;
        case 'list':
          router.navigate('/(tabs)/transactions');
          return true;
        default:
          return false;
      }
    },
    [router, startVoice, openType, openManual],
  );

  useRouting(handle);

  useEffect(() => {
    if (!QA?.setItems) return;
    QA.setItems([
      { id: 'voice', title: t('qa.voice', locale), icon: 'symbol:mic.fill' },
      { id: 'type', title: t('qa.type', locale), icon: 'symbol:keyboard' },
      { id: 'manual', title: t('qa.manual', locale), icon: 'symbol:plus.circle' },
      { id: 'list', title: t('qa.list', locale), icon: 'symbol:list.bullet' },
    ]).catch(() => {});
  }, [locale]);
}
