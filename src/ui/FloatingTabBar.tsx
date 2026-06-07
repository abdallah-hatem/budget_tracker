/**
 * FloatingTabBar — Midnight Emerald floating pill tab bar with center mic FAB.
 *
 * Layout (L→R): Home · Transactions · [🎙 FAB] · Pending · Settings
 *
 * The FAB is a raised 60px emerald circle that overlaps the bar top by ~16px,
 * with an accent-colored glow shadow. Tap it to start voice capture; hold it to
 * fan out a small menu (manual / type) — all driven by the global CaptureProvider
 * so there is no capture tab. The 4 regular tabs animate with spring
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
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { usePendingContext } from '@/src/features/transactions/PendingProvider';
import { useCapture } from '@/src/features/capture/CaptureProvider';
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
  /** Kept for accessibilityLabel only — not rendered visually */
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
      accessibilityLabel={label}
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
      {/* Icon only — no text label to avoid Arabic truncation */}
      <View style={{ position: 'relative' }}>
        <Ionicons
          name={iconName as keyof typeof Ionicons.glyphMap}
          size={24}
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
    </AnimatedPressable>
  );
}

// ── Center FAB: tap = mic (speak), hold = manual/type menu ───────────────────
const MENU_ITEMS = [
  { key: 'manual', icon: 'create-outline', dx: -64, en: 'Manual', ar: 'يدوي' },
  { key: 'type', icon: 'text-outline', dx: 64, en: 'Type', ar: 'كتابة' },
] as const;

function MenuButton({
  progress,
  dx,
  icon,
  label,
  labelFont,
  active,
  onPress,
}: {
  progress: SharedValue<number>;
  dx: number;
  icon: string;
  label: string;
  labelFont: string;
  active: boolean;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: [{ translateX: dx * p }, { translateY: -106 * p }, { scale: 0.4 + 0.6 * p }],
    };
  });
  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }, style]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          backgroundColor: COLORS.overlay,
          borderWidth: 1,
          borderColor: 'rgba(43,217,142,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 8,
        }}
      >
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={COLORS.accent} />
      </Pressable>
      <Text style={{ marginTop: 4, fontFamily: labelFont, fontSize: 11, color: COLORS.ink }}>
        {label}
      </Text>
    </Animated.View>
  );
}

function CenterFAB() {
  const { startVoice, openManual, openType, locale } = useCapture();
  const isAr = locale === 'ar';
  const labelFont = isAr ? FONT.readexMd : FONT.jakartaMd;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const scale = useSharedValue(1);
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withSpring(menuOpen ? 1 : 0, { damping: 15, stiffness: 200 });
  }, [menuOpen, progress]);

  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  async function onTap() {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startVoice();
  }

  async function onHold() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setMenuOpen(true);
  }

  function pick(key: string) {
    setMenuOpen(false);
    if (key === 'manual') openManual();
    else openType();
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        marginTop: -(FAB_OVERLAP + (FAB_SIZE - BAR_HEIGHT) / 2),
        justifyContent: 'flex-start',
      }}
    >
      {/* Tap-outside backdrop while the menu is open */}
      {menuOpen ? (
        <Pressable
          testID="capture-menu-backdrop"
          onPress={() => setMenuOpen(false)}
          style={{ position: 'absolute', width: 2200, height: 2200, bottom: -500, left: -1100 }}
        />
      ) : null}

      {MENU_ITEMS.map((item) => (
        <MenuButton
          key={item.key}
          progress={progress}
          dx={item.dx}
          icon={item.icon}
          label={isAr ? item.ar : item.en}
          labelFont={labelFont}
          active={menuOpen}
          onPress={() => pick(item.key)}
        />
      ))}

      <AnimatedPressable
        testID="capture-fab"
        onPress={onTap}
        onLongPress={onHold}
        onPressIn={() => {
          scale.value = withSpring(0.93, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        accessibilityRole="button"
        accessibilityLabel="Speak to add — hold for options"
        style={[
          fabStyle,
          {
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            backgroundColor: COLORS.accent,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: COLORS.accent,
            shadowOpacity: 0.5,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 12,
          },
        ]}
      >
        <Ionicons name="mic" size={28} color="#06251A" />
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
            return <CenterFAB key="fab" />;
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
