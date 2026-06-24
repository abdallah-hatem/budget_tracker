import React, { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const BASE = '#1C2322';

/**
 * Skeleton — a single pulsing placeholder block used while data loads.
 * Opacity gently breathes (Reanimated, OTA-safe). Compose several to mimic a
 * row/card layout.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.9, { duration: 750 }), -1, true);
  }, [o]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: BASE }, style, animated]}
    />
  );
}

/** A transaction/pending-style row placeholder: avatar + two lines + amount. */
export function RowSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <Skeleton width={40} height={40} radius={14} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="32%" height={11} />
      </View>
      <Skeleton width={64} height={14} />
    </View>
  );
}

/** A vertical stack of RowSkeletons for list screens. */
export function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </View>
  );
}
