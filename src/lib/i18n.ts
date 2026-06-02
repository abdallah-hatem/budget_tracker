import type { Locale } from '@/src/types';

/**
 * Bilingual UI strings. Every entry MUST define both `en` and `ar`.
 * Keys are dotted namespaces; resolve with `t(key, locale)`.
 *
 * Flat keys (no dots) are Milestone-6 contract keys consumed by
 * the dashboard, transaction list, and capture screens.
 */
export const STRINGS: Record<string, { en: string; ar: string }> = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  'auth.signIn.title': { en: 'Sign in', ar: 'تسجيل الدخول' },
  'auth.signUp.title': { en: 'Create account', ar: 'إنشاء حساب' },
  'auth.email': { en: 'Email', ar: 'البريد الإلكتروني' },
  'auth.password': { en: 'Password', ar: 'كلمة المرور' },
  'auth.signInButton': { en: 'Sign in', ar: 'دخول' },
  'auth.signUpButton': { en: 'Create account', ar: 'إنشاء' },
  'auth.toSignUp': { en: "Don't have an account? Sign up", ar: 'ليس لديك حساب؟ سجّل' },
  'auth.toSignIn': { en: 'Already have an account? Sign in', ar: 'لديك حساب؟ سجّل الدخول' },
  'auth.checkEmail': {
    en: 'Check your inbox to confirm your email.',
    ar: 'تحقق من بريدك لتأكيد الحساب.',
  },
  'auth.genericError': { en: 'Something went wrong.', ar: 'حدث خطأ ما.' },

  // ── Tabs ──────────────────────────────────────────────────────────────────
  'tabs.home': { en: 'Home', ar: 'الرئيسية' },
  'tabs.capture': { en: 'Add', ar: 'إضافة' },
  'tabs.transactions': { en: 'List', ar: 'القائمة' },
  'tabs.settings': { en: 'Settings', ar: 'الإعدادات' },

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings.title': { en: 'Settings', ar: 'الإعدادات' },
  'settings.account': { en: 'Account', ar: 'الحساب' },
  'settings.language': { en: 'Language', ar: 'اللغة' },
  'settings.langEnglish': { en: 'English', ar: 'الإنجليزية' },
  'settings.langArabic': { en: 'Arabic', ar: 'العربية' },
  'settings.signOut': { en: 'Sign out', ar: 'تسجيل الخروج' },

  // ── Stub placeholders (replaced by M5/M6) ─────────────────────────────────
  'home.placeholder': { en: 'Dashboard coming soon', ar: 'لوحة المعلومات قريباً' },
  'capture.placeholder': { en: 'Capture coming soon', ar: 'الإضافة قريباً' },
  'transactions.placeholder': { en: 'Transactions coming soon', ar: 'المعاملات قريباً' },

  // ── Generic ───────────────────────────────────────────────────────────────
  'common.loading': { en: 'Loading…', ar: 'جارٍ التحميل…' },

  // ── Milestone-6 contract keys (flat keys) ─────────────────────────────────
  // Dashboard screen
  dashboard_title: { en: 'Dashboard', ar: 'لوحة المعلومات' },
  net_this_month: { en: 'Net this month', ar: 'الصافي هذا الشهر' },
  income: { en: 'Income', ar: 'الدخل' },
  expense: { en: 'Expenses', ar: 'المصروفات' },
  by_category: { en: 'By category', ar: 'حسب الفئة' },
  recent: { en: 'Recent', ar: 'الأخيرة' },
  no_transactions: { en: 'No transactions yet', ar: 'لا توجد معاملات بعد' },

  // Transactions screen
  transactions_title: { en: 'Transactions', ar: 'المعاملات' },
  all_categories: { en: 'All categories', ar: 'جميع الفئات' },

  // Actions
  edit: { en: 'Edit', ar: 'تعديل' },
  delete: { en: 'Delete', ar: 'حذف' },
  save: { en: 'Save', ar: 'حفظ' },
  cancel: { en: 'Cancel', ar: 'إلغاء' },

  // Capture / edit form fields
  amount: { en: 'Amount', ar: 'المبلغ' },
  note: { en: 'Note', ar: 'ملاحظة' },

  // Month navigation
  prev_month: { en: 'Previous month', ar: 'الشهر السابق' },
  next_month: { en: 'Next month', ar: 'الشهر التالي' },

  // Loading state
  loading: { en: 'Loading…', ar: 'جارٍ التحميل…' },

  // Pending inbox (P2.3/P2.4)
  pending_title: { en: 'Pending', ar: 'قيد المراجعة' },
  pending_empty: { en: 'No pending transactions', ar: 'لا توجد معاملات قيد المراجعة' },
  confirm: { en: 'Confirm', ar: 'تأكيد' },
  reject: { en: 'Reject', ar: 'رفض' },
  via_sms: { en: 'via SMS', ar: 'عبر رسالة' },

  // SMS auto-capture / ingest token (P2.5)
  sms_capture: { en: 'SMS Auto-Capture', ar: 'التقاط الرسائل تلقائياً' },
  sms_token_intro: {
    en: 'Generate a secret token to link your iOS Shortcut.',
    ar: 'أنشئ رمزاً سرياً لربط اختصار iOS الخاص بك.',
  },
  generate_token: { en: 'Generate token', ar: 'إنشاء رمز' },
  regenerate_token: { en: 'Regenerate token', ar: 'إعادة إنشاء الرمز' },
  revoke_token: { en: 'Revoke token', ar: 'إلغاء الرمز' },
  token_shown_once: {
    en: 'Copy this token now — it won\'t be shown again.',
    ar: 'انسخ هذا الرمز الآن — لن يُعرض مجدداً.',
  },
  copy: { en: 'Copy', ar: 'نسخ' },
  copied: { en: 'Copied!', ar: 'تم النسخ!' },
  shortcut_guide: { en: 'iOS Shortcut guide', ar: 'دليل اختصار iOS' },
};

export function isRTL(locale: Locale): boolean {
  return locale === 'ar';
}

/**
 * Resolve a string for the given locale.
 * Falls back to English if the Arabic value is missing, and to the
 * key itself if the key is unknown.
 */
export function t(key: string, locale: Locale): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[locale] ?? entry.en ?? key;
}
