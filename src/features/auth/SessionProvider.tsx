import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase';

export interface Profile {
  id: string;
  display_name: string | null;
  locale: 'ar' | 'en';
  currency: string;
  /** Set when the user soft-deleted their account; gates them out of the app. */
  deleted_at: string | null;
}

export interface SessionContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Optimistically patch the in-memory profile (e.g. locale) so the whole UI
   *  reacts immediately, without waiting for a refetch / app restart. */
  updateProfile: (patch: Partial<Profile>) => void;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  updateProfile: () => {},
});

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, locale, currency, deleted_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    // Profile may not exist yet right after sign-up (trigger lag); fail soft.
    return null;
  }
  return (data as Profile) ?? null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function applySession(next: Session | null) {
      if (!active) return;
      if (next?.user) {
        const p = await fetchProfile(next.user.id);
        if (!active) return;
        if (p?.deleted_at) {
          // Account was soft-deleted → refuse the session and sign out. The
          // subsequent SIGNED_OUT event re-runs applySession(null).
          setSession(null);
          setProfile(null);
          setLoading(false);
          void supabase.auth.signOut();
          return;
        }
        setSession(next);
        setProfile(p);
      } else {
        setSession(null);
        setProfile(null);
      }
      if (active) setLoading(false);
    }

    // Initial load.
    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session ?? null);
    });

    // React to future auth events (sign-in, sign-out, token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      updateProfile,
    }),
    [session, profile, loading, updateProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
