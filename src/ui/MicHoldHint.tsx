import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/src/features/auth/SessionProvider';
import { t } from '@/src/lib/i18n';
import { FONT } from '@/src/lib/font';

// One-time full-screen coach-mark teaching that press-and-hold on the mic fans
// out the Manual / Type quick-add options. Dims the screen, highlights a mic
// replica with a pulsing "hold" ring, and points an arrow at it. Shows once per
// device (persisted flag), then never again. Tap anywhere to dismiss.
const SEEN_KEY = 'mic_hold_hint_seen_v2';

const FAB = 60; // mirrors FloatingTabBar FAB_SIZE
const RING = 108;
// FAB centre distance from the screen bottom (see FloatingTabBar geometry).
const FAB_CENTER_FROM_BOTTOM = 60;

export function MicHoldHint() {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const locale = profile?.locale ?? 'en';
  const [visible, setVisible] = useState(false);

  const ring = useRef(new Animated.Value(0)).current; // pulsing ring
  const press = useRef(new Animated.Value(0)).current; // gentle mic press

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        if (cancelled || v === '1') return;
        showTimer = setTimeout(() => {
          setVisible(true);
          AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
          Animated.loop(
            Animated.timing(ring, {
              toValue: 1,
              duration: 1500,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ).start();
          Animated.loop(
            Animated.sequence([
              Animated.timing(press, { toValue: 1, duration: 700, useNativeDriver: true }),
              Animated.timing(press, { toValue: 0, duration: 700, useNativeDriver: true }),
            ]),
          ).start();
          hideTimer = setTimeout(() => setVisible(false), 9000);
        }, 900);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fabCenter = insets.bottom + FAB_CENTER_FROM_BOTTOM;
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.35] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.7, 0.35, 0] });
  const micScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setVisible(false)}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.74)' }} onPress={() => setVisible(false)}>
        {/* Pulsing "hold" ring behind the mic */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: fabCenter - RING / 2, alignItems: 'center' }}>
          <Animated.View
            style={{
              width: RING,
              height: RING,
              borderRadius: RING / 2,
              borderWidth: 2,
              borderColor: '#2BD98E',
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            }}
          />
        </View>

        {/* Highlighted mic replica */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: fabCenter - FAB / 2, alignItems: 'center' }}>
          <Animated.View
            style={{
              width: FAB,
              height: FAB,
              borderRadius: FAB / 2,
              backgroundColor: '#2BD98E',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: micScale }],
              shadowColor: '#2BD98E',
              shadowOpacity: 0.6,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 0 },
              elevation: 14,
            }}
          >
            <Ionicons name="mic" size={28} color="#06251A" />
          </Animated.View>
        </View>

        {/* Tooltip + arrow above the mic */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: fabCenter + FAB / 2 + 14, alignItems: 'center' }}>
          <View
            style={{
              maxWidth: 280,
              backgroundColor: '#14191A',
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: 'rgba(43,217,142,0.5)',
            }}
          >
            <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 14, lineHeight: 20, color: '#F4F7F5', textAlign: 'center' }}>
              {t('mic_hold_hint', locale)}
            </Text>
          </View>
          <Ionicons name="arrow-down" size={26} color="#2BD98E" style={{ marginTop: 6 }} />
        </View>

        {/* Dismiss affordance */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 40, alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            {t('tap_anywhere', locale)}
          </Text>
        </View>
      </Pressable>
    </Modal>
  );
}
