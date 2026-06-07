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
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  interpolateColor,
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
  danger: '#FF5C6C',
  ink3: '#6B7672',
  ink: '#F4F7F5',
};

// Per-option colour ramps (resting border, hover fill, solid highlight).
const TONES = {
  accent: { solid: '#2BD98E', soft: 'rgba(43,217,142,0.45)', fill: 'rgba(43,217,142,0.20)' },
  danger: { solid: '#FF5C6C', soft: 'rgba(255,92,108,0.45)', fill: 'rgba(255,92,108,0.20)' },
} as const;
type Tone = keyof typeof TONES;

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

// ── Center FAB: tap = mic (speak), press-and-hold = manual/type/cancel menu ──
// Tap the mic to record. Press-and-hold to fan out three options in an arc; keep
// holding and slide onto one, then release to pick it (release-to-click) — slide
// up-left = Manual, straight up = Cancel, up-right = Type. Release on the mic to
// leave the menu open and tap an option instead.
const HOLD_MS = 200; // hold this long to open the menu (a quick tap stays under it)
const HOVER_ENTER_Y = 40; // drag up at least this far before an option is "hovered"

const MENU_ITEMS = [
  { key: 'manual', icon: 'create-outline', dx: -86, dy: -86, tone: 'accent', en: 'Manual', ar: 'يدوي' },
  { key: 'cancel', icon: 'close', dx: 0, dy: -120, tone: 'danger', en: 'Cancel', ar: 'إلغاء' },
  { key: 'type', icon: 'text-outline', dx: 86, dy: -86, tone: 'accent', en: 'Type', ar: 'كتابة' },
] as const;

/**
 * Which option the finger is over, given its drag offset from the mic press
 * point. Indexes into MENU_ITEMS (0 Manual up-left, 1 Cancel up, 2 Type up-right)
 * or -1 for none. Pure + exported so the geometry is unit-tested on its own.
 */
export function hoveredMenuIndex(dx: number, dy: number): number {
  const up = -dy; // positive when dragging upward toward the options
  if (up < HOVER_ENTER_Y) return -1; // hasn't committed upward yet
  const angle = (Math.atan2(up, dx) * 180) / Math.PI; // 0 = right, 90 = up, 180 = left
  if (angle < 68) return 2; // Type (up-right)
  if (angle < 112) return 1; // Cancel (up)
  return 0; // Manual (up-left)
}

function MenuButton({
  index,
  progress,
  hovered,
  dx,
  dy,
  icon,
  label,
  labelFont,
  tone,
  active,
  onPress,
}: {
  index: number;
  progress: SharedValue<number>;
  hovered: SharedValue<number>;
  dx: number;
  dy: number;
  icon: string;
  label: string;
  labelFont: string;
  tone: Tone;
  active: boolean;
  onPress: () => void;
}) {
  const ramp = TONES[tone];
  // Fan-out (open) is driven by `progress`; the hover "pop" by `hovered`.
  const containerStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: [{ translateX: dx * p }, { translateY: dy * p }],
    };
  });
  const hov = useDerivedValue(() =>
    withTiming(hovered.value === index ? 1 : 0, { duration: 110 }),
  );
  const circleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const h = hov.value;
    return {
      transform: [{ scale: (0.5 + 0.5 * p) * (1 + 0.16 * h) }],
      backgroundColor: interpolateColor(h, [0, 1], [COLORS.overlay, ramp.fill]),
      borderColor: interpolateColor(h, [0, 1], [ramp.soft, ramp.solid]),
    };
  });
  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }, containerStyle]}
    >
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          circleStyle,
          {
            width: 50,
            height: 50,
            borderRadius: 25,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 8,
          },
        ]}
      >
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={ramp.solid} />
      </AnimatedPressable>
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
  const hovered = useSharedValue(-1); // -1 none, 0 manual, 1 type

  React.useEffect(() => {
    progress.value = withTiming(menuOpen ? 1 : 0, { duration: 150 });
  }, [menuOpen, progress]);

  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Gesture state in a ref so the responder callbacks never read stale values.
  const g = React.useRef({
    x: 0,
    y: 0,
    open: false,
    openedThisGesture: false,
    hover: -1,
    holdTimer: null as ReturnType<typeof setTimeout> | null,
  });

  const clearHold = React.useCallback(() => {
    if (g.current.holdTimer) {
      clearTimeout(g.current.holdTimer);
      g.current.holdTimer = null;
    }
  }, []);

  const openMenu = React.useCallback(() => {
    g.current.open = true;
    g.current.openedThisGesture = true;
    setMenuOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, []);

  const closeMenu = React.useCallback(() => {
    g.current.open = false;
    g.current.hover = -1;
    hovered.value = -1;
    setMenuOpen(false);
  }, [hovered]);

  const pick = React.useCallback(
    (index: number) => {
      const key = MENU_ITEMS[index]?.key;
      closeMenu();
      if (key === 'manual') openManual();
      else if (key === 'type') openType();
      // 'cancel' → just close (already done above)
    },
    [closeMenu, openManual, openType],
  );

  React.useEffect(() => clearHold, [clearHold]); // clear the timer on unmount

  function onGrant(e: GestureResponderEvent) {
    g.current.x = e.nativeEvent.pageX;
    g.current.y = e.nativeEvent.pageY;
    g.current.open = menuOpen; // a fresh press while already open keeps it open
    g.current.openedThisGesture = false;
    g.current.hover = -1;
    hovered.value = -1;
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
    clearHold();
    g.current.holdTimer = setTimeout(openMenu, HOLD_MS);
  }

  function onMove(e: GestureResponderEvent) {
    if (!g.current.open) return;
    const dx = e.nativeEvent.pageX - g.current.x;
    const dy = e.nativeEvent.pageY - g.current.y;
    const h = hoveredMenuIndex(dx, dy);
    if (h !== g.current.hover) {
      g.current.hover = h;
      hovered.value = h;
      if (h !== -1) Haptics.selectionAsync().catch(() => {});
    }
  }

  function onRelease() {
    clearHold();
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    if (g.current.open) {
      const h = g.current.hover;
      if (h === -1) {
        hovered.value = -1;
        // A hold that just opened the menu → leave it open so it can be tapped
        // (also the accessible path). A plain tap on the mic while it was already
        // open → dismiss.
        if (!g.current.openedThisGesture) closeMenu();
        return;
      }
      pick(h);
    } else {
      // Quick tap (released before the hold opened the menu) → record.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      startVoice();
    }
  }

  function onTerminate() {
    clearHold();
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    // Keep an already-open menu (an interrupted drag shouldn't lose it).
    if (!g.current.open) closeMenu();
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
          onPress={closeMenu}
          style={{ position: 'absolute', width: 2200, height: 2200, bottom: -500, left: -1100 }}
        />
      ) : null}

      {MENU_ITEMS.map((item, i) => (
        <MenuButton
          key={item.key}
          index={i}
          progress={progress}
          hovered={hovered}
          dx={item.dx}
          dy={item.dy}
          icon={item.icon}
          label={isAr ? item.ar : item.en}
          labelFont={labelFont}
          tone={item.tone}
          active={menuOpen}
          onPress={() => pick(i)}
        />
      ))}

      <View
        testID="capture-fab"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onTerminate}
        onResponderTerminationRequest={() => false}
        accessibilityRole="button"
        accessibilityLabel="Speak to add — hold for manual or type"
      >
        <Animated.View
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
        </Animated.View>
      </View>
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
