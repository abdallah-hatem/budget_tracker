import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCapture } from '@/src/features/capture/CaptureProvider';

/**
 * Deep-link target for the home-screen widget's quick-add buttons:
 *   masareef://capture?mode=voice | type | manual
 * It isn't a real screen — it fires the requested capture action (the capture
 * surfaces are global overlays rendered by CaptureProvider, so they show over
 * whatever's beneath) and immediately redirects to the dashboard. Only reachable
 * when authenticated; the root gate sends signed-out users to sign-in first.
 */
export default function CaptureDeepLink() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { startVoice, openType, openManual } = useCapture();
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return; // run once (guards strict-mode double mount)
    fired.current = true;
    if (mode === 'type') openType();
    else if (mode === 'manual') openManual();
    else startVoice();
    router.replace('/(tabs)');
  }, [mode, startVoice, openType, openManual, router]);

  return null;
}
