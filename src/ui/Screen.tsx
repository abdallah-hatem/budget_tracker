import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from './FloatingTabBar';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView */
  scroll?: boolean;
  /** Add horizontal padding 20 (default true) */
  padded?: boolean;
}

/**
 * Screen — base layout wrapper for all app screens.
 * SafeAreaView (top edge), bg-canvas, flex-1.
 * When scroll=true wraps children in a ScrollView whose paddingBottom
 * is insets.bottom + TAB_BAR_CLEARANCE so the floating tab bar never
 * overlaps the last row.
 */
export function Screen({ children, scroll = false, padded = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingStyle = padded ? { paddingHorizontal: 20 } : undefined;

  if (scroll) {
    return (
      <SafeAreaView edges={['top']} className="bg-canvas flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            paddingStyle,
            { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="bg-canvas flex-1">
      <View style={paddingStyle} className="flex-1">
        {children}
      </View>
    </SafeAreaView>
  );
}
