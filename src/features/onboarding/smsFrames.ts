import type { ImageSourcePropType } from 'react-native';

export interface SmsFrame {
  image: ImageSourcePropType;
  /** English caption shown under the frame. */
  capEn: string;
  /** Arabic caption. */
  capAr: string;
  /**
   * Optional highlight arrow drawn over the frame, pointing at a UI element the
   * user must tap. Coordinates are a FRACTION (0–1) of the screenshot itself
   * (not the container), so it stays correct under the image's `contain` fit.
   */
  arrow?: { xPct: number; yPct: number };
}

/**
 * Real iPhone screenshots of the SMS auto-capture setup, shown as an animated
 * cross-fade walkthrough (SmsTutorialAnimated). Files live in
 * `assets/onboarding/sms/`. If this array is emptied the onboarding screen
 * falls back to the stylized step cards (SmsTutorial).
 */
export const SMS_FRAMES: SmsFrame[] = [
  {
    image: require('@/assets/onboarding/sms/01-automation-tab.png'),
    capEn: 'In Shortcuts, open the Automation tab and tap + (top-right).',
    capAr: 'في الاختصارات، افتح تبويب «الأتمتة» واضغط + (أعلى اليمين).',
  },
  {
    image: require('@/assets/onboarding/sms/02-personal-automation.png'),
    capEn: 'Tap Personal Automation, then choose Message.',
    capAr: 'اختر «أتمتة شخصية»، ثم اختر «رسالة».',
  },
  {
    image: require('@/assets/onboarding/sms/03-message-contains.png'),
    capEn: 'Tap Message Contains → type a word your bank always sends in its SMS (e.g. EGP or جم) → Done.',
    capAr: 'اضغط «الرسالة تحتوي على» ← اكتب كلمة يرسلها بنكك دائمًا في رسائله (مثل EGP أو جم) ← تم.',
  },
  {
    image: require('@/assets/onboarding/sms/04-run-immediately.png'),
    capEn: 'Choose Run Immediately, then tap Next.',
    capAr: 'اختر «تشغيل فوري»، ثم اضغط «التالي».',
  },
  {
    image: require('@/assets/onboarding/sms/05-create-shortcut.png'),
    capEn: 'Tap Create New Shortcut.',
    capAr: 'اضغط «إنشاء اختصار جديد».',
  },
  {
    image: require('@/assets/onboarding/sms/06-add-actions.png'),
    capEn: 'Tap Search Actions at the bottom.',
    capAr: 'اضغط «بحث الإجراءات» في الأسفل.',
  },
  {
    image: require('@/assets/onboarding/sms/07-search-masareef.png'),
    capEn: 'Search “Masareef” → tap Log SMS to Masareef.',
    capAr: 'ابحث عن «Masareef» ← اختر «Log SMS to Masareef».',
  },
  {
    image: require('@/assets/onboarding/sms/08-tap-shortcut-input.png'),
    capEn: 'Tap the “Message” field, then choose “Shortcut Input” from the bar.',
    capAr: 'اضغط على حقل «Message»، ثم اختر «Shortcut Input» من الشريط.',
    // A down-arrow in the empty gap above the bar, tip landing on the "Shortcut
    // Input" button (~62% across, ~57% down the screenshot).
    arrow: { xPct: 0.62, yPct: 0.57 },
  },
  {
    image: require('@/assets/onboarding/sms/09-shortcut-input.png'),
    capEn: 'Message now reads “Shortcut Input” — tap ✓ (top-right) to save. Done!',
    capAr: 'الآن يظهر «Shortcut Input» في الرسالة — اضغط ✓ (أعلى اليمين) للحفظ. تم!',
  },
];
