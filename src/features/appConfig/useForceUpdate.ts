import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { getMinSupportedVersions } from './api';
import { isUpdateRequired } from './version';

/**
 * Returns true when the installed app version is below the remote-configured
 * minimum for the current platform (app_config.min_ios_version /
 * min_android_version). Fails OPEN: unknown installed version (dev) or a
 * failed/empty config fetch never blocks.
 *
 * Installed version comes from expo-updates' runtimeVersion (policy=appVersion),
 * so no extra native module is needed — this ships via OTA.
 */
export function useForceUpdate(): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    let installed: string | null = null;
    try {
      installed = Updates.runtimeVersion ?? null;
    } catch {
      installed = null;
    }
    if (!installed) return; // dev / unknown → never block

    void getMinSupportedVersions().then((mins) => {
      const min = Platform.OS === 'android' ? mins.android : mins.ios;
      if (active && isUpdateRequired(installed, min)) setBlocked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return blocked;
}
