import React, {
  createContext,
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
}

export interface SessionContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
});

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, locale, currency')
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
      setSession(next);
      if (next?.user) {
        const p = await fetchProfile(next.user.id);
        if (active) setProfile(p);
      } else if (active) {
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

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
    }),
    [session, profile, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
