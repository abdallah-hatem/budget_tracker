import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Pressable, FlatList, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from '@/src/ui';
import { t } from '@/src/lib/i18n';
import type { Locale } from '@/src/types';
import { SMS_FRAMES } from './smsFrames';
import { SmsTutorial } from './SmsTutorial';

const STEP_MS = 2800;
const ACCENT = '#2BD98E';

/**
 * SmsTutorialAnimated — a swipeable, auto-playing walkthrough built from the
 * real iPhone screenshots in `smsFrames.ts`. It advances on its own but the
 * user can swipe through at their own pace (which pauses auto-play; a play
 * button resumes it). Falls back to the stylized step cards (SmsTutorial) until
 * the screenshots are added. OTA-safe (plain Image + FlatList).
 */
export function SmsTutorialAnimated({ locale }: { locale: Locale }) {
  const frames = SMS_FRAMES;
  const { width: winW, height: winH } = useWindowDimensions();
  // Page width = screen minus the onboarding screen's 20pt horizontal padding.
  const pageW = winW - 40;
  // Cap the frame height so the whole step fits without vertical scrolling.
  const imageH = Math.round(winH * 0.46);

  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const listRef = useRef<FlatList>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!auto || frames.length <= 1) return;
    timer.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % frames.length;
        listRef.current?.scrollToOffset({ offset: next * pageW, animated: true });
        return next;
      });
    }, STEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, frames.length, pageW]);

  if (frames.length === 0) return <SmsTutorial locale={locale} />;

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / pageW));
  };
  const goTo = (i: number) => {
    setAuto(false);
    setIndex(i);
    listRef.current?.scrollToOffset({ offset: i * pageW, animated: true });
  };

  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 12 }}>
        <AppText weight="bold" style={{ fontSize: 22, textAlign: 'center' }}>
          {t('sms_tut.heading', locale)}
        </AppText>
        <AppText
          className="text-ink2"
          style={{ fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, paddingHorizontal: 8 }}
        >
          {t('sms_tut.sub', locale)}
        </AppText>
      </View>

      <FlatList
        ref={listRef}
        data={frames}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
        onScrollBeginDrag={() => setAuto(false)}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item, index: i }) => (
          <View style={{ width: pageW }}>
            <View
              style={{
                width: '100%',
                height: imageH,
                borderRadius: 22,
                overflow: 'hidden',
                backgroundColor: '#000',
                borderWidth: 0.5,
                borderColor: '#1F2725',
              }}
            >
              <Image source={item.image} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
            <View style={{ minHeight: 48, justifyContent: 'center', marginTop: 12, paddingHorizontal: 4 }}>
              <AppText style={{ fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
                <AppText weight="bold" className="text-accent">{i + 1}. </AppText>
                {locale === 'ar' ? item.capAr : item.capEn}
              </AppText>
            </View>
          </View>
        )}
      />

      {/* Dots + play/pause */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {frames.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={6}>
              <View
                style={{
                  width: i === index ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === index ? ACCENT : '#39423E',
                }}
              />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setAuto((a) => !a)} hitSlop={10}>
          <MaterialCommunityIcons name={auto ? 'pause' : 'play'} size={18} color="#8A938F" />
        </Pressable>
      </View>
    </View>
  );
}
