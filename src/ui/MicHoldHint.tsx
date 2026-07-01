import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/src/features/auth/SessionProvider';
import { t } from '@/src/lib/i18n';
import { FONT } from '@/src/lib/font';

// One-time coach-mark above the mic FAB, teaching that press-and-hold fans out
// the Manual / Type quick-add options. Shows once per device (persisted flag),
// then never again. Dismisses on tap or after a few seconds.
const SEEN_KEY = 'mic_hold_hint_seen_v1';

export function MicHoldHint({ bottom }: { bottom: number }) {
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const [visible, setVisible] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        if (cancelled || v === '1') return;
        // Small delay so it appears after the app settles, not mid-launch.
        showTimer = setTimeout(() => {
          setVisible(true);
          AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
          Animated.spring(anim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 6,
            tension: 80,
          }).start();
          hideTimer = setTimeout(dismiss, 6000);
        }, 1000);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(
      () => setVisible(false),
    );
  }

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        alignItems: 'center',
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
        ],
      }}
    >
      <Pressable
        testID="mic-hold-hint"
        onPress={dismiss}
        style={{
          maxWidth: 260,
          backgroundColor: '#14191A',
          borderRadius: 14,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: 'rgba(43,217,142,0.45)',
          shadowColor: '#000000',
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 12,
        }}
      >
        <Text
          style={{
            fontFamily: FONT.jakartaMd,
            fontSize: 13,
            lineHeight: 18,
            color: '#F4F7F5',
            textAlign: 'center',
          }}
        >
          {t('mic_hold_hint', locale)}
        </Text>
      </Pressable>
      {/* Downward caret pointing at the mic. */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 7,
          borderRightWidth: 7,
          borderTopWidth: 8,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: '#14191A',
          marginTop: -1,
        }}
      />
    </Animated.View>
  );
}
