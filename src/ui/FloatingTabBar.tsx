/**
 * FloatingTabBar — Midnight Emerald floating pill tab bar with center Add FAB.
 *
 * Layout (L→R): Home · Transactions · [+ FAB (capture)] · Pending · Settings
 *
 * The FAB is a raised 60px emerald circle that overlaps the bar top by ~16px,
 * with an accent-colored glow shadow. The 4 regular tabs animate with spring
 * scale+translateY on active. Pending tab shows a badge when count > 0.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { usePendingContext } from '@/src/features/transactions/PendingProvider';
import { FONT } from '@/src/lib/font';

// ── Design tokens ────────────────────────────────────────────────────────────
const COLORS = {
  overlay: '#1C2322',
  accent: '#2BD98E',
  ink3: '#6B7672',
  ink: '#F4F7F5',
};

const BAR_HEIGHT = 64;
const FAB_SIZE = 60;
const FAB_OVERLAP = 16; // how many px the FAB overlaps the bar's top edge
const HORIZONTAL_INSET = 16;
const BOTTOM_OFFSET = 12; // distance above safe-area bottom

/**
 * Minimum paddingBottom to add to scrollable content so the floating tab bar
 * (and FAB) never overlap the last row.
 * Usage: `contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}`
 */
export const TAB_BAR_CLEARANCE = 96;

// ── Tab definition (capture is the center FAB slot, not a regular tab) ───────
type TabEntry =
  | {
      kind: 'tab';
      route: string;
      iconFocused: string;
      iconUnfocused: string;
    }
  | { kind: 'fab' };

const TAB_ORDER: TabEntry[] = [
  { kind: 'tab', route: 'index', iconFocused: 'home', iconUnfocused: 'home-outline' },
  {
    kind: 'tab',
    route: 'transactions',
    iconFocused: 'list',
    iconUnfocused: 'list-outline',
  },
  { kind: 'fab' }, // center FAB slot → capture route
  {
    kind: 'tab',
    route: 'pending',
    iconFocused: 'mail-unread',
    iconUnfocused: 'mail-unread-outline',
  },
  {
    kind: 'tab',
    route: 'settings',
    iconFocused: 'settings',
    iconUnfocused: 'settings-outline',
  },
];

// ── Animated tab item ─────────────────────────────────────────────────────────
interface TabItemProps {
  route: { name: string; key: string };
  isFocused: boolean;
  label: string;
  iconFocused: string;
  iconUnfocused: string;
  showBadge?: boolean;
  badgeCount?: number;
  onPress: () => void;
  onLongPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabItem({
  isFocused,
  label,
  iconFocused,
  iconUnfocused,
  showBadge,
  badgeCount,
  onPress,
  onLongPress,
}: TabItemProps) {
  const scale = useSharedValue(isFocused ? 1.1 : 1);
  const translateY = useSharedValue(isFocused ? -3 : 0);

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.1 : 1, { damping: 14, stiffness: 220 });
    translateY.value = withSpring(isFocused ? -3 : 0, { damping: 14, stiffness: 220 });
  }, [isFocused, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const iconColor = isFocused ? COLORS.accent : COLORS.ink3;
  const iconName = isFocused ? iconFocused : iconUnfocused;

  async function handlePress() {
    await Haptics.selectionAsync();
    onPress();
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          height: BAR_HEIGHT,
        },
        animatedStyle,
      ]}
    >
      <View style={{ position: 'relative' }}>
        <Ionicons
          name={iconName as keyof typeof Ionicons.glyphMap}
          size={22}
          color={iconColor}
        />
        {showBadge && (badgeCount ?? 0) > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: COLORS.accent,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 3,
            }}
          >
            <Text
              style={{
                fontFamily: FONT.jakartaSb,
                fontSize: 9,
                color: '#06251A',
                lineHeight: 14,
              }}
            >
              {(badgeCount ?? 0) > 99 ? '99+' : String(badgeCount)}
            </Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: FONT.jakartaMd,
          fontSize: 10,
          color: iconColor,
          marginTop: 3,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// ── Center FAB ────────────────────────────────────────────────────────────────
interface CenterFABProps {
  onPress: () => void;
}

function CenterFAB({ onPress }: CenterFABProps) {
  const scale = useSharedValue(1);

  function handlePressIn() {
    scale.value = withSpring(0.93, { damping: 15, stiffness: 300 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }

  async function handlePress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        // The FAB overlaps the bar top by FAB_OVERLAP; center it vertically on bar top
        marginTop: -(FAB_OVERLAP + (FAB_SIZE - BAR_HEIGHT) / 2),
        justifyContent: 'flex-start',
        paddingTop: 0,
      }}
    >
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        style={[
          animatedStyle,
          {
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            backgroundColor: COLORS.accent,
            alignItems: 'center',
            justifyContent: 'center',
            // Accent-colored glow shadow
            shadowColor: COLORS.accent,
            shadowOpacity: 0.5,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 12,
          },
        ]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </AnimatedPressable>
    </View>
  );
}

// ── FloatingTabBar ────────────────────────────────────────────────────────────
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { count: pendingCount } = usePendingContext();

  const bottomOffset = insets.bottom + BOTTOM_OFFSET;

  // Build a quick lookup: routeName → index in state.routes
  const routeIndexMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    state.routes.forEach((r, i) => {
      map[r.name] = i;
    });
    return map;
  }, [state.routes]);

  function navigateTo(routeName: string) {
    const targetIndex = routeIndexMap[routeName];
    if (targetIndex === undefined) return;
    const route = state.routes[targetIndex];
    const isFocused = state.index === targetIndex;

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: HORIZONTAL_INSET,
        right: HORIZONTAL_INSET,
        bottom: bottomOffset,
        // Extra top space for FAB overflow
        paddingTop: FAB_OVERLAP,
        // Make the outer container transparent so FAB glow shows
        backgroundColor: 'transparent',
      }}
    >
      {/* The pill bar */}
      <View
        style={{
          height: BAR_HEIGHT,
          backgroundColor: COLORS.overlay,
          borderRadius: 32,
          flexDirection: 'row',
          alignItems: 'stretch',
          // Soft shadow on the pill bar
          shadowColor: '#000000',
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
          overflow: 'visible',
        }}
      >
        {TAB_ORDER.map((entry, slotIndex) => {
          if (entry.kind === 'fab') {
            const captureRouteIndex = routeIndexMap['capture'];
            return (
              <CenterFAB
                key="fab"
                onPress={() => {
                  const captureRoute = state.routes[captureRouteIndex];
                  const isFocused = state.index === captureRouteIndex;

                  if (captureRoute) {
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: captureRoute.key,
                      canPreventDefault: true,
                    });
                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate('capture');
                    }
                  } else {
                    navigation.navigate('capture');
                  }
                }}
              />
            );
          }

          // Regular tab
          const { route: routeName, iconFocused, iconUnfocused } = entry;
          const routeIndex = routeIndexMap[routeName];
          const route = state.routes[routeIndex];
          if (!route) return null;

          const isFocused = state.index === routeIndex;
          const descriptor = descriptors[route.key];
          const label =
            (descriptor?.options?.title as string | undefined) ??
            (descriptor?.options?.tabBarLabel as string | undefined) ??
            routeName;

          const isPending = routeName === 'pending';

          return (
            <TabItem
              key={route.key}
              route={route}
              isFocused={isFocused}
              label={label}
              iconFocused={iconFocused}
              iconUnfocused={iconUnfocused}
              showBadge={isPending && pendingCount > 0}
              badgeCount={pendingCount}
              onPress={() => navigateTo(routeName)}
              onLongPress={() => {
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                });
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
