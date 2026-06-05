import React from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING = { damping: 15, stiffness: 300 } as const;

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /**
   * STATIC style object/array. Pass a plain object — NOT a
   * `({ pressed }) => ({...})` function. NativeWind's JSX interop silently
   * drops function-style props on Pressable (dropping backgroundColor); the
   * press feedback here is a Reanimated transform instead, so the style always
   * renders. See PrimaryButton for the same approach.
   */
  style?: StyleProp<ViewStyle>;
  /** Scale applied while pressed (default 0.97). */
  activeScale?: number;
  children?: React.ReactNode;
}

/**
 * PressableScale — a Pressable with a spring scale-down on press.
 * Drop-in replacement for `<Pressable style={{...}}>` that adds tactile press
 * feedback without a function-style `style` prop.
 */
export function PressableScale({
  style,
  activeScale = 0.97,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn(event: GestureResponderEvent) {
    scale.value = withSpring(activeScale, SPRING);
    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    scale.value = withSpring(1, SPRING);
    onPressOut?.(event);
  }

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
