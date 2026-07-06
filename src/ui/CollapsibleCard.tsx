import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
  icon,
}: {
  title: string;
  children: React.ReactNode;
  rtl?: boolean;
  defaultExpanded?: boolean;
  testID?: string;
  /** Optional leading MaterialCommunityIcons glyph shown in an accent badge. */
  icon?: string;
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
        // hitSlop extends the tappable area to cover the whole header band; the
        // small vertical padding makes the row itself a bit taller too.
        // NOTE: keep `style` a plain OBJECT (not a `({pressed})=>…` function) —
        // NativeWind mishandles function styles on Pressable and drops
        // flexDirection, which wraps the chevron under the title.
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        style={{
          flexDirection: rtl ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 4,
        }}
      >
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 11 }}>
          {icon ? (
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                backgroundColor: 'rgba(43,217,142,0.16)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons
                name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
                size={17}
                color="#2BD98E"
              />
            </View>
          ) : null}
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
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7672" />
      </Pressable>
      {expanded ? <View style={{ marginTop: 14 }}>{children}</View> : null}
    </Card>
  );
}
