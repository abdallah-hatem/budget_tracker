# Masareef — App Store Submission Guide

Everything needed to create and submit the app in **App Store Connect**
(appstoreconnect.apple.com). Paste-ready copy is in code blocks.

---

## Identity (already configured)

| Thing | Value | Where users see it |
|---|---|---|
| App Store title | **Masareef – Budget Tracker** | App Store listing title (globally unique) |
| Home-screen name | **Masareef** | Label under the app icon (`app.json` `name`) |
| Bundle ID | `com.abdallah.masareef` | Nowhere (permanent technical id) |
| EAS slug | `tmp-app` | Nowhere (internal Expo project id) |
| URL scheme | `masareef://` | Nowhere (deep links) |
| Apple team | `CN24UJRFFJ` (paid, App Store) | Nowhere |
| Backend | Supabase project `masareef` (`pzyadiwfjmjsafssxshc`) | Nowhere |

> `slug` and `scheme` are internal — not shown to users and not on the App Store.
> Renaming `slug` requires renaming the Expo project; `scheme` requires a rebuild.

---

## Prerequisites checklist

- [ ] **Privacy Policy URL** — `legal/privacy.html` (host it; see below)
- [ ] **Support URL** — `legal/index.html` (host it; see below)
- [ ] Replace placeholder email `support@masareef.app` in both pages with a real inbox
- [ ] **Screenshots** — 6.7" iPhone (1290 × 2796), at least 1 (ideally 3–4)
- [ ] **Demo account** on production for App Review (sign up in the app, note the credentials)
- [ ] **Build uploaded** via `eas build --platform ios --profile production --auto-submit`

---

## 1. Create the app — My Apps → ➕ → New App

| Field | Value |
|---|---|
| Platforms | iOS |
| Name | `Masareef – Budget Tracker` *(App Store title — globally unique; ≤30 chars)* |
| Primary Language | English (U.S.) — add Arabic localization in step 5 |
| Bundle ID | `com.abdallah.masareef` |
| SKU | `masareef` |
| User Access | Full Access |

> If the bundle ID isn't in the dropdown, run the `eas build` first (it registers the
> App ID), or register it under **Certificates, Identifiers & Profiles → Identifiers → ➕**.

---

## 2. App Information

- **Subtitle** (≤30 chars): `Voice & SMS budget tracker`
- **Category:** Primary **Finance** · Secondary (optional) **Productivity**
- **Content Rights:** does **not** use third-party content
- **Age Rating:** answer **None** to all → **4+**

---

## 3. Pricing and Availability

- **Price:** Free
- **Availability:** All countries (or Egypt + target markets)

---

## 4. App Privacy

Set **"Data Not Used to Track You."** Mark these **Collected · Linked to user · App Functionality**:

| Data type | Category |
|---|---|
| Email Address | Contact Info |
| Other Financial Info (transaction amounts) | Financial Info |
| Other User Content (expense notes/descriptions) | User Content |
| User ID | Identifiers |

Everything else: **Not Collected**. Tracking: **No**. Add the Privacy Policy URL here too.

---

## 5. Version "1.0" metadata

**Promotional Text** (≤170):
```
Speak or type a purchase and Masareef files it for you — in Arabic or English. Auto-capture bank SMS, track every account, and see where your money goes.
```

**Description (English):**
```
Masareef is the effortless way to track your money in Egypt — in Arabic or English.

Just say or type what you spent (“coffee 45 pounds” / “قهوة بـ٤٥ جنيه”) and Masareef instantly understands the amount and the category for you. No forms, no fuss.

KEY FEATURES
• Voice & text capture — log expenses by speaking or typing, in Arabic or English
• Smart categories — purchases are auto-sorted (food, transport, bills, and more)
• SMS auto-capture — turn bank SMS alerts into transactions with an iOS Shortcut
• Accounts & balances — add your bank, cash, and wallets; watch each balance update live
• Clear dashboard — monthly income, spending, and a category breakdown at a glance
• Fully bilingual — Arabic and English, with right-to-left support
• Private by design — your data is yours. No ads, no tracking.

Masareef is a personal tracker — it never connects to your bank and never moves money. You stay in control.

Start tracking in seconds.
```

**Description (Arabic — add via language selector → Arabic):**
```
مصاريف هو أسهل طريقة لتتبع أموالك في مصر — بالعربية أو الإنجليزية.

فقط قُل أو اكتب ما أنفقته (“قهوة بـ٤٥ جنيه”) وسيفهم مصاريف المبلغ والفئة فورًا. بدون نماذج، بدون تعقيد.

أهم المميزات
• تسجيل بالصوت أو الكتابة — سجّل مصروفاتك بالعربية أو الإنجليزية
• فئات ذكية — تصنيف تلقائي للمشتريات (طعام، مواصلات، فواتير، والمزيد)
• التقاط الرسائل تلقائيًا — حوّل رسائل البنك إلى معاملات عبر اختصار iOS
• الحسابات والأرصدة — أضِف البنك والنقد والمحافظ وشاهد كل رصيد يتحدّث مباشرة
• لوحة واضحة — الدخل والمصروفات الشهرية وتفصيل الفئات بنظرة واحدة
• ثنائي اللغة بالكامل — العربية والإنجليزية مع دعم الكتابة من اليمين لليسار
• الخصوصية أولًا — بياناتك ملكك؛ بدون إعلانات أو تتبّع

مصاريف أداة شخصية للتتبع فقط — لا يتصل ببنكك ولا يحرّك أموالك. أنت المتحكّم.

ابدأ التتبع في ثوانٍ.
```

**Keywords** (≤100 chars):
```
budget,expense,money,spending,finance,tracker,wallet,مصاريف,ميزانية,مصروف,حساب,توفير,نقود
```

- **Support URL:** `https://abdallah-hatem.github.io/budget_tracker/`
- **Privacy Policy URL:** `https://abdallah-hatem.github.io/budget_tracker/privacy.html`
- **Marketing URL:** optional
- **Copyright:** `2026 Abdallah Hatem`
- **Screenshots:** 6.7" iPhone — capture Dashboard, Add/voice, Transactions, Accounts

---

## 6. App Review Information ⚠️ (top rejection cause)

The app requires sign-in, so reviewers need a working account.

- **Sign-in required:** Yes
- **Demo account:** create one on production and enter it here
  - User name: `review@masareef.app` *(or any real account you create)*
  - Password: `<the password you set>`
- **Notes:**
```
Masareef is a personal expense tracker (track-only; it never links to a bank or moves money).
Sign in with the demo account above. Tap "Add", type an expense like "coffee 45 pounds", and
tap categorize — the AI sets the amount and category, then it saves to the dashboard.
The optional "SMS auto-capture" feature is set up manually via an iOS Shortcut and is not
required to review the app.
Microphone + Speech Recognition are requested only for optional voice entry of expenses.
```

---

## Hosting the legal pages (free)

Files live in `legal/` (`index.html` = support, `privacy.html` = privacy).

**GitHub Pages (public repo):**
```bash
# from a fresh copy of the legal/ folder
gh repo create masareef-legal --public --source=legal --remote=origin --push
gh api -X POST repos/<owner>/masareef-legal/pages -f 'source[branch]=main' -f 'source[path]=/'
# URLs:
#   Support:  https://<owner>.github.io/masareef-legal/
#   Privacy:  https://<owner>.github.io/masareef-legal/privacy.html
```

**Or** drag-and-drop the `legal/` folder onto https://app.netlify.com/drop for instant URLs.

---

## Build & submit

```bash
# Builds on EAS cloud, then uploads the .ipa to App Store Connect / TestFlight
eas build --platform ios --profile production --auto-submit
```

`eas.json` already bakes the **production** Supabase URL + anon key into this build.
After it lands in TestFlight, attach the build to the 1.0 version and **Submit for Review**.

> "Submit" uploads the binary; going live still needs the metadata above + Apple's
> review (~1–3 days). EAS can't automate Apple's review step.
