import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { FONT } from '@/src/lib/font';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * A Card whose body collapses behind a tappable header (uppercase section label +
 * chevron). Used to keep long screens (Settings) short: collapsed by default,
 * tap the header to expand. Matches the SectionLabel look.
 */
export function CollapsibleCard({
  title,
  children,
  rtl = false,
  defaultExpanded = false,
  testID,
}: {
  title: string;
  children: React.ReactNode;
  rtl?: boolean;
  defaultExpanded?: boolean;
  testID?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  }

  return (
    <Card className="mb-4">
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={toggle}
        // The header text row is thin; without this, taps in the Card's 16px
        // padding (which looks like part of the header) miss the touch target.
        // hitSlop extends the tappable area to cover the whole header band, and
        // a little vertical padding makes it taller. Pressed-opacity gives feedback.
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        style={({ pressed }) => ({
          flexDirection: rtl ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 4,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: FONT.jakartaMd,
            fontSize: 12,
            color: '#6B7672',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7672" />
      </Pressable>
      {expanded ? <View style={{ marginTop: 14 }}>{children}</View> : null}
    </Card>
  );
}
