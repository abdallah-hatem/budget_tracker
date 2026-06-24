import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * Warm sibling tab screens in the background once the current screen is
 * interactive, so the FIRST switch to each isn't janky. Tabs are lazy-mounted by
 * default, so the first navigation pays the whole mount+layout cost on the JS
 * thread mid-animation (dropped frames). Preloading moves that cost onto idle
 * time after launch. Call from the INITIAL tab (the dashboard).
 *
 * No-op if the navigator doesn't expose preload (older RN), so it degrades to the
 * default lazy behaviour.
 */
export function useTabPreload(routes: string[]): void {
  const navigation = useNavigation();

  useEffect(() => {
    const nav = navigation as unknown as { preload?: (name: string) => void };
    if (typeof nav.preload !== 'function') return;
    const task = InteractionManager.runAfterInteractions(() => {
      for (const r of routes) {
        try {
          nav.preload!(r);
        } catch {
          /* ignore — falls back to lazy mount on first visit */
        }
      }
    });
    return () => task.cancel();
    // routes is a stable literal from the caller; depend only on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);
}
