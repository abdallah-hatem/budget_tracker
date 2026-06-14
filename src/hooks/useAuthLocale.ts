import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from '../types';

// Device-level language preference for the AUTH screens (before a profile exists).
// Persisted in AsyncStorage so it survives restarts and is shared across the
// sign-in / sign-up screens. After login the profile's locale takes over; this
// value is passed as signUp metadata so a new account starts in the chosen
// language. Module-level `cached` keeps the two auth screens in sync in-session.
const KEY = 'auth_locale';
let cached: Locale | null = null;

export function useAuthLocale(): readonly [Locale, (l: Locale) => void] {
  const [locale, setLocaleState] = useState<Locale>(cached ?? 'en');

  useEffect(() => {
    if (cached) return;
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'ar' || v === 'en') {
        cached = v;
        setLocaleState(v);
      }
    }).catch(() => {});
  }, []);

  const setLocale = useCallback((l: Locale) => {
    cached = l;
    setLocaleState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  }, []);

  return [locale, setLocale] as const;
}
