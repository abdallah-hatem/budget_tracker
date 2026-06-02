export interface AuthGateState {
  /** Session/profile still resolving — do not redirect yet. */
  loading: boolean;
  /** True when a Supabase session exists. */
  hasSession: boolean;
  /** True when the current route is inside the (auth) route group. */
  inAuthGroup: boolean;
}

/**
 * Pure decision function for the auth redirect gate.
 * Returns the href to redirect to, or null to stay put.
 */
export function redirectTarget(state: AuthGateState): string | null {
  if (state.loading) return null;
  if (!state.hasSession && !state.inAuthGroup) return '/(auth)/sign-in';
  if (state.hasSession && state.inAuthGroup) return '/(tabs)';
  return null;
}
