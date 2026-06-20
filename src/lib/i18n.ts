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
  // Email verification
  'auth.verifyTitle': { en: 'Verify your email', ar: 'فعّل بريدك الإلكتروني' },
  'auth.verifySentTo': {
    en: 'We sent a verification link to',
    ar: 'أرسلنا رابط تفعيل إلى',
  },
  'auth.verifyHint': {
    en: 'Tap the link in the email, then come back and sign in. Check your spam folder if you don’t see it.',
    ar: 'افتح الرابط في الرسالة ثم عُد وسجّل الدخول. تحقق من مجلد الرسائل غير المرغوبة إن لم تجدها.',
  },
  'auth.resend': { en: 'Resend email', ar: 'إعادة إرسال الرسالة' },
  'auth.resendIn': { en: 'Resend in', ar: 'إعادة الإرسال بعد' },
  'auth.resent': { en: 'Verification email sent again.', ar: 'تم إرسال رسالة التفعيل مرة أخرى.' },
  'auth.goToSignIn': { en: 'Back to sign in', ar: 'العودة لتسجيل الدخول' },
  'auth.emailNotConfirmed': {
    en: 'Please verify your email first — check your inbox for the link.',
    ar: 'فعّل بريدك أولًا — تحقق من الرسالة في بريدك.',
  },
  // Social sign-in
  'auth.or': { en: 'or', ar: 'أو' },
  'auth.continueGoogle': { en: 'Continue with Google', ar: 'المتابعة باستخدام Google' },
  'auth.continueApple': { en: 'Continue with Apple', ar: 'المتابعة باستخدام Apple' },

  // ── Tabs ──────────────────────────────────────────────────────────────────
  'tabs.home': { en: 'Home', ar: 'الرئيسية' },
  'tabs.capture': { en: 'Add', ar: 'إضافة' },
  'tabs.transactions': { en: 'List', ar: 'القائمة' },
  'tabs.settings': { en: 'Settings', ar: 'الإعدادات' },

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings.title': { en: 'Settings', ar: 'الإعدادات' },
  'settings.account': { en: 'Account', ar: 'الحساب' },
  'settings.language': { en: 'Language', ar: 'اللغة' },
  'settings.month_start': { en: 'Start of month', ar: 'بداية الشهر' },
  'settings.month_start_hint': {
    en: 'Your “this month” runs from this day to the same day next month (e.g. your salary day).',
    ar: 'يبدأ شهرك من هذا اليوم حتى نفس اليوم الشهر القادم (مثلاً يوم راتبك).',
  },
  // Gold assets
  'gold.section': { en: 'Gold', ar: 'الذهب' },
  'gold.value': { en: 'Gold value', ar: 'قيمة الذهب' },
  'gold.net_worth': { en: 'Net worth', ar: 'صافي الثروة' },
  'gold.as_of': { en: 'as of', ar: 'حتى' },
  'gold.outdated': { en: 'price may be outdated', ar: 'قد يكون السعر قديمًا' },
  'gold.value_unavailable': { en: 'Value unavailable', ar: 'القيمة غير متاحة' },
  'gold.add': { en: 'Add gold', ar: 'إضافة ذهب' },
  'gold.grams': { en: 'Grams', ar: 'جرامات' },
  'gold.karat': { en: 'Karat', ar: 'العيار' },
  'gold.label_optional': { en: 'Label (optional)', ar: 'وصف (اختياري)' },
  'gold.empty': {
    en: 'No gold yet — add a piece to track its value.',
    ar: 'لا يوجد ذهب بعد — أضف قطعة لتتبع قيمتها.',
  },
  'cat.section': { en: 'Categories', ar: 'التصنيفات' },
  'cat.your': { en: 'Your categories', ar: 'تصنيفاتك' },
  'cat.builtin': { en: 'Built-in', ar: 'افتراضية' },
  'cat.add': { en: 'New category', ar: 'تصنيف جديد' },
  'cat.empty': {
    en: 'No custom categories yet — add one to tag spending your way.',
    ar: 'لا توجد تصنيفات مخصصة بعد — أضف واحدًا لتصنيف مصاريفك بطريقتك.',
  },
  'cat.name': { en: 'Name', ar: 'الاسم' },
  'cat.icon': { en: 'Icon', ar: 'الأيقونة' },
  'cat.color': { en: 'Color', ar: 'اللون' },
  'cat.deleteConfirm': {
    en: 'Delete this category? Its transactions move to Other.',
    ar: 'حذف هذا التصنيف؟ ستنتقل معاملاته إلى «أخرى».',
  },
  'cat.hide': { en: 'Hide', ar: 'إخفاء' },
  'cat.hidden': { en: 'Hidden:', ar: 'مخفي:' },
  'cat.hideHomePrompt': {
    en: 'Hide this category from Home? Long-press hides; tap it under "Hidden" to bring it back.',
    ar: 'إخفاء هذا التصنيف من الرئيسية؟ يمكنك إعادته بالضغط عليه تحت «مخفي».',
  },
  'settings.langEnglish': { en: 'English', ar: 'الإنجليزية' },
  'settings.langArabic': { en: 'Arabic', ar: 'العربية' },
  'settings.signOut': { en: 'Sign out', ar: 'تسجيل الخروج' },
  'settings.signOutConfirm': {
    en: 'Sign out of your account?',
    ar: 'تسجيل الخروج من حسابك؟',
  },
  'settings.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'settings.deleteAccount': { en: 'Delete account', ar: 'حذف الحساب' },
  'settings.deleteAccountConfirm': {
    en: 'Delete your account? You will be signed out and won’t be able to sign back in.',
    ar: 'حذف حسابك؟ سيتم تسجيل خروجك ولن تتمكن من تسجيل الدخول مرة أخرى.',
  },

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
  add: { en: 'Add', ar: 'إضافة' },
  add_manually: { en: 'Add manually', ar: 'إضافة يدوية' },
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
  when: { en: 'When', ar: 'التاريخ والوقت' },

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
  'rules.title': { en: 'SMS rules', ar: 'قواعد الرسائل' },
  'rules.subtitle': {
    en: 'When a bank SMS contains a keyword, force its category and note.',
    ar: 'لما رسالة البنك تحتوي على كلمة، اضبط فئتها وملاحظتها تلقائيًا.',
  },
  'rules.keyword': { en: 'Keyword', ar: 'كلمة مفتاحية' },
  'rules.note_optional': { en: 'Note (optional)', ar: 'ملاحظة (اختياري)' },
  'rules.add': { en: 'Add rule', ar: 'أضف قاعدة' },
  'rules.delete': { en: 'Delete', ar: 'حذف' },
  'rules.empty': { en: 'No rules yet.', ar: 'لا توجد قواعد بعد.' },
  sms_token_intro: {
    en: 'Have your bank SMS logged automatically.',
    ar: 'خلّي رسائل البنك تتسجّل كمعاملات تلقائيًا.',
  },
  sms_recommended: {
    en: '✨ Set it up in the Shortcuts app',
    ar: '✨ إعداده من تطبيق الاختصارات',
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
  shortcut_guide: { en: 'Manual setup (advanced)', ar: 'الإعداد اليدوي (متقدم)' },
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
