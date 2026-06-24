import { supabase } from '../../lib/supabase';

/**
 * The minimum supported iOS app version from the remote app_config row.
 * Returns null on any error (caller must fail open — never block on a failed
 * fetch).
 */
export async function getMinSupportedVersion(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('min_ios_version')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  return (data.min_ios_version as string) ?? null;
}
