import React, { useEffect } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { isRTL } from '../../lib/i18n';
import { FONT } from '../../lib/font';
import type { Locale } from '../../types';

/**
 * Full-screen overlay shown while the mic is listening (pulsing) or the capture
 * is being processed (spinner). Tapping anywhere while listening stops it.
 */
export function RecordingOverlay({
  visible,
  listening,
  loading,
  locale,
  onStop,
  onCancel,
}: {
  visible: boolean;
  listening: boolean;
  loading: boolean;
  locale: Locale;
  /** Finish + save the utterance. */
  onStop: () => void;
  /** Abort + discard — nothing is saved. */
  onCancel: () => void;
}) {
  const rtl = isRTL(locale);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (listening) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.22, { duration: 650 }),
          withTiming(1, { duration: 650 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [listening, pulse]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onStop}>
      <Pressable
        testID="recording-overlay"
        onPress={listening ? onStop : undefined}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(11,15,14,0.86)',
        }}
      >
        <View style={{ alignItems: 'center', gap: 22 }}>
          <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
            {listening ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: 132,
                    height: 132,
                    borderRadius: 66,
                    backgroundColor: 'rgba(43,217,142,0.18)',
                  },
                  ringStyle,
                ]}
              />
            ) : null}
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: listening ? '#2BD98E' : '#1C2322',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {loading ? (
                <ActivityIndicator color="#2BD98E" />
              ) : (
                <Ionicons name="mic" size={38} color={listening ? '#06251A' : '#A8B2AF'} />
              )}
            </View>
          </View>

          <Text style={{ fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb, fontSize: 16, color: '#F4F7F5' }}>
            {loading
              ? rtl
                ? 'جارٍ الإضافة…'
                : 'Adding…'
              : rtl
                ? 'استماع…'
                : 'Listening…'}
          </Text>

          {listening ? (
            <View style={{ alignItems: 'center', gap: 18 }}>
              <Text style={{ fontFamily: rtl ? FONT.readex : FONT.jakarta, fontSize: 13, color: '#A8B2AF' }}>
                {rtl ? 'اضغط في أي مكان للإضافة' : 'Tap anywhere to add'}
              </Text>
              {/* Discard — nested Pressable, so it does NOT trigger the stop-on-tap. */}
              <Pressable
                testID="recording-cancel"
                onPress={onCancel}
                hitSlop={10}
                style={{
                  flexDirection: rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 7,
                  paddingHorizontal: 18,
                  paddingVertical: 11,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,92,108,0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,92,108,0.45)',
                }}
              >
                <Ionicons name="close" size={16} color="#FF5C6C" />
                <Text style={{ fontFamily: rtl ? FONT.readexSb : FONT.jakartaSb, fontSize: 14, color: '#FF5C6C' }}>
                  {rtl ? 'إلغاء' : 'Cancel'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}
