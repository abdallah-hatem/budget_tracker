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
  'settings.signOutConfirm': {
    en: 'Sign out of your account?',
    ar: 'تسجيل الخروج من حسابك؟',
  },
  'settings.cancel': { en: 'Cancel', ar: 'إلغاء' },

  // ── Accounts ──────────────────────────────────────────────────────────────
  'settings.accounts': { en: 'Accounts', ar: 'الحسابات' },
  'accounts.title': { en: 'Accounts', ar: 'الحسابات' },
  'accounts.total': { en: 'Total', ar: 'الإجمالي' },
  'accounts.add': { en: 'Add account', ar: 'إضافة حساب' },
  'accounts.name': { en: 'Name', ar: 'الاسم' },
  'accounts.starting_balance': { en: 'Starting balance', ar: 'الرصيد الابتدائي' },
  'accounts.make_default': { en: 'Make default', ar: 'تعيين كافتراضي' },
  'accounts.default': { en: 'Default', ar: 'افتراضي' },
  'accounts.set_default': { en: 'Set default', ar: 'تعيين افتراضي' },
  'accounts.edit': { en: 'Edit', ar: 'تعديل' },
  'accounts.delete': { en: 'Delete', ar: 'حذف' },
  'accounts.delete_confirm': {
    en: 'Delete this account? Its transactions stay in your totals but become unassigned.',
    ar: 'حذف هذا الحساب؟ ستبقى معاملاته ضمن إجماليّاتك لكن بدون حساب.',
  },
  'accounts.save': { en: 'Save', ar: 'حفظ' },
  'accounts.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'accounts.account': { en: 'Account', ar: 'الحساب' },
  'accounts.none': { en: 'No account', ar: 'بدون حساب' },

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
  spent_this_month: { en: 'Spent this month', ar: 'مصروفات هذا الشهر' },
  income_this_month: { en: 'Income this month', ar: 'دخل هذا الشهر' },
  income: { en: 'Income', ar: 'الدخل' },
  expense: { en: 'Expenses', ar: 'المصروفات' },
  earned_caption: { en: 'EARNED', ar: 'الدخل' },
  no_income: { en: 'No income', ar: 'لا دخل' },
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
