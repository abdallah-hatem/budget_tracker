import React from 'react';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FONT } from '@/src/lib/font';

export interface PrimaryButtonProps {
  label: string;
  onPress?: PressableProps['onPress'];
  disabled?: boolean;
  loading?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * PrimaryButton — full-width emerald CTA button.
 * bg-accent (#2BD98E), dark ink-on-accent text (#06251A), radius 16.
 * Haptic impactAsync(Medium) on press.
 * Pressed state: scale 0.98 spring animation.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }

  async function handlePress(event: Parameters<NonNullable<PressableProps['onPress']>>[0]) {
    if (disabled || loading) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.(event);
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        animatedStyle,
        {
          backgroundColor: disabled || loading ? '#1FB877' : '#2BD98E',
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
          width: '100%',
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#06251A" />
      ) : (
        <Text
          style={{
            fontFamily: FONT.jakartaSb,
            fontSize: 16,
            color: '#06251A',
          }}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}
