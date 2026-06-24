import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import { getMinSupportedVersion } from './api';
import { isUpdateRequired } from './version';

/**
 * Returns true when the installed app version is below the remote-configured
 * minimum (app_config.min_ios_version) — i.e. the user must update. Fails OPEN:
 * unknown installed version (dev) or a failed/empty config fetch never blocks.
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

    void getMinSupportedVersion().then((min) => {
      if (active && isUpdateRequired(installed, min)) setBlocked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return blocked;
}
