import { supabase } from '../../lib/supabase';

export interface MinSupportedVersions {
  ios: string | null;
  android: string | null;
}

/**
 * Per-platform minimum supported app version from the remote app_config row.
 * Returns nulls on any error (caller must fail open — never block on a failed
 * fetch).
 */
export async function getMinSupportedVersions(): Promise<MinSupportedVersions> {
  const { data, error } = await supabase
    .from('app_config')
    .select('min_ios_version, min_android_version')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return { ios: null, android: null };
  return {
    ios: (data.min_ios_version as string) ?? null,
    android: (data.min_android_version as string) ?? null,
  };
}
