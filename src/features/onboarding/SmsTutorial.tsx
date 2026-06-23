import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from '@/src/ui';
import { t, isRTL } from '@/src/lib/i18n';
import type { Locale } from '@/src/types';

interface Props {
  locale: Locale;
}

const STEPS = ['s1', 's2', 's3', 's4', 's5'] as const;

// iOS-style mini illustration palette (a light card representing Apple's
// Shortcuts / our app screen, regardless of the dark app canvas around it).
const IOS_BG = '#F2F2F7';
const IOS_ROW = '#FFFFFF';
const IOS_INK = '#1C1C1E';
const IOS_MUTED = '#8E8E93';
const BLUE = '#007AFF';
const ORANGE = '#FF9500';
const GREEN = '#34C759';
const ACCENT = '#2BD98E';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: IOS_ROW,
        borderRadius: 8,
        paddingVertical: 7,
        paddingHorizontal: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}

function Cap({ text }: { text: string }) {
  return (
    <AppText
      style={{ fontSize: 10, color: IOS_MUTED, letterSpacing: 0.4, marginBottom: 1 }}
    >
      {text.toUpperCase()}
    </AppText>
  );
}

function IosText({ text, color = IOS_INK, flex }: { text: string; color?: string; flex?: boolean }) {
  return <AppText style={{ fontSize: 12, color, ...(flex ? { flex: 1 } : null) }}>{text}</AppText>;
}

function Illustration({ index }: { index: number }) {
  const wrap = {
    backgroundColor: IOS_BG,
    borderRadius: 12,
    padding: 9,
    gap: 6,
    marginTop: 10,
  } as const;

  if (index === 0) {
    return (
      <View style={wrap}>
        <Cap text="Masareef" />
        <Row>
          <MaterialCommunityIcons name="key-variant" size={15} color={ACCENT} />
          <IosText text="Auto-capture key" flex />
          <MaterialCommunityIcons name="check-circle" size={16} color={GREEN} />
        </Row>
      </View>
    );
  }
  if (index === 1) {
    return (
      <View style={wrap}>
        <Cap text="Shortcuts · Automation" />
        <Row>
          <MaterialCommunityIcons name="message-text-outline" size={15} color="#5E5CE6" />
          <IosText text="No automations yet" color={IOS_MUTED} flex />
        </Row>
        <Row>
          <MaterialCommunityIcons name="plus" size={15} color={BLUE} />
          <AppText style={{ fontSize: 12, color: BLUE }}>New Automation</AppText>
        </Row>
      </View>
    );
  }
  if (index === 2) {
    return (
      <View style={wrap}>
        <Cap text="When I get a message" />
        <Row>
          <IosText text="Message" color={IOS_MUTED} flex />
          <IosText text="Contains" />
        </Row>
        <Row>
          <View style={{ backgroundColor: '#E9E9EE', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 8 }}>
            <AppText weight="medium" style={{ fontSize: 12, color: IOS_INK }}>EGP</AppText>
          </View>
        </Row>
        <Row>
          <MaterialCommunityIcons name="lightning-bolt" size={14} color={ORANGE} />
          <IosText text="Run Immediately" flex />
          <MaterialCommunityIcons name="check-circle" size={15} color={GREEN} />
        </Row>
      </View>
    );
  }
  if (index === 3) {
    return (
      <View style={wrap}>
        <Row>
          <MaterialCommunityIcons name="magnify" size={14} color={IOS_MUTED} />
          <IosText text="Log SMS to Masareef" color={IOS_MUTED} flex />
        </Row>
        <Row>
          <MaterialCommunityIcons name="text-box-outline" size={14} color={ACCENT} />
          <IosText text="Message" flex />
          <MaterialCommunityIcons name="variable" size={13} color={BLUE} />
          <AppText style={{ fontSize: 12, color: BLUE }}>Shortcut Input</AppText>
        </Row>
      </View>
    );
  }
  return (
    <View style={wrap}>
      <Cap text="Masareef · Pending" />
      <Row>
        <MaterialCommunityIcons name="bell-outline" size={14} color={ORANGE} />
        <IosText text="E£ 250 · Vodafone" flex />
        <View style={{ backgroundColor: '#FFF3D6', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7 }}>
          <AppText style={{ fontSize: 10, color: '#9A6700' }}>Review</AppText>
        </View>
      </Row>
    </View>
  );
}

/**
 * SmsTutorial — the scrollable visual walkthrough for setting up SMS
 * auto-capture (the iOS Shortcuts automation). Bilingual + RTL-aware; the
 * iOS mini-screens stay LTR since they mirror Apple's UI literally.
 */
export function SmsTutorial({ locale }: Props) {
  const rtl = isRTL(locale);
  const align = rtl ? 'right' : 'left';

  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 18 }}>
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            backgroundColor: 'rgba(43,217,142,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <MaterialCommunityIcons name="message-flash-outline" size={28} color={ACCENT} />
        </View>
        <AppText weight="bold" style={{ fontSize: 22, textAlign: 'center' }}>
          {t('sms_tut.heading', locale)}
        </AppText>
        <AppText
          className="text-ink2"
          style={{ fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, paddingHorizontal: 8 }}
        >
          {t('sms_tut.sub', locale)}
        </AppText>
      </View>

      <View style={{ gap: 14 }}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={{
              backgroundColor: '#14191A',
              borderRadius: 16,
              borderWidth: 0.5,
              borderColor: '#1F2725',
              padding: 14,
            }}
          >
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: 10 }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: ACCENT,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText weight="bold" style={{ fontSize: 13, color: '#05281B' }}>
                  {i + 1}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={{ fontSize: 14, lineHeight: 20, textAlign: align }}>
                  {t(`sms_tut.${s}.t`, locale)}
                </AppText>
                <AppText
                  className="text-ink2"
                  style={{ fontSize: 12.5, lineHeight: 18, marginTop: 3, textAlign: align }}
                >
                  {t(`sms_tut.${s}.d`, locale)}
                </AppText>
              </View>
            </View>
            <Illustration index={i} />
          </View>
        ))}
      </View>
    </View>
  );
}
