# Midnight Emerald — Design System (budget tracker redesign)

Dark-first, premium, refined-minimal. **Restraint = premium.** Grayscale everything
+ ONE emerald accent (only on hero number, active tab, primary CTA, selected chip,
positive delta). Emoji carry category personality. Aggressive type hierarchy.
Tabular figures everywhere money appears.

## 1. Color tokens (Tailwind `theme.extend.colors`)
Dark only (no light mode for v1).
```
canvas      #0B0F0E   // app background
surface     #14191A   // cards
overlay     #1C2322   // sheets/modals, elevated
border      #2A3331   // hairlines (use sparingly; prefer surface steps over borders)
ink         #F4F7F5   // primary text
ink2        #A8B2AF   // secondary text
ink3        #6B7672   // tertiary/muted
accent      #2BD98E   // emerald — the ONLY brand color
accentPress #1FB877
accentSoft  rgba(43,217,142,0.16)   // tinted bg
income      #2BD98E   // positive
expense     #F4F7F5   // neutral (NOT red) — normal expenses use ink
danger      #FF5C6C   // over-budget / destructive / errors ONLY
warning     #F5B544
```
Add to `tailwind.config.js`. Also set NativeWind class helpers (e.g. `bg-canvas`,
`text-ink`, `text-ink2`, `bg-surface`, `text-accent`, `bg-accent`).

## 2. Category emoji + color map
Each category slug → an emoji (personality) + a fixed hue (used ONLY for the
category avatar tint + donut slice, NEVER for income/expense direction).
File: `src/lib/categoryStyle.ts` → `categoryStyle(slug): { emoji: string; color: string }`.
```
food         🍔 #F97316      groceries   🛒 #22C55E
transport    🚗 #3B82F6      clothes     👕 #A855F7
bills        🧾 #EAB308      health      💊 #EC4899
entertainment 🎬 #14B8A6     education   📚 #6366F1
home         🏠 #0EA5E9      travel      ✈️ #F43F5E
shopping     🛍️ #D946EF      other_expense 💸 #64748B
salary       💰 #2BD98E      transfer_in 🔁 #14B8A6
gift         🎁 #F59E0B      refund      ↩️ #38BDF8
other_income ➕ #64748B
```

## 3. Typography (expo-google-fonts)
Install: `@expo-google-fonts/sora`, `@expo-google-fonts/plus-jakarta-sans`,
`@expo-google-fonts/readex-pro`, and `expo-font`.
- **Numbers / balances / display** → **Sora** (700/600). Tabular by default.
- **English UI text** → **Plus Jakarta Sans** (400/500/600/700).
- **Arabic UI text** → **Readex Pro** (400/500/600). Numbers stay Sora (Western digits) even in Arabic.
Load all in `app/_layout.tsx` via `useFonts`, hold the splash until loaded
(`expo-splash-screen`). Map in `tailwind.config.js` `fontFamily`:
`sora→'Sora_700Bold'` (+ `sora-sb→'Sora_600SemiBold'`), `jakarta→'PlusJakartaSans_500Medium'`
(+ `jakarta-sb`/`jakarta-b`), `readex→'ReadexPro_500Medium'`. Provide a `font.ts`
helper `uiFont(locale)` returning the jakarta/readex family for the active locale.

Type scale (size/weight): hero balance 52 Sora700 (currency symbol + decimals at
~28 ink2); H1 28/700; section 20/600; card title 16/600; body 15/400; label 12
uppercase tracking +0.5 ink3; row amount 16 Sora600 tabular right-aligned.

## 4. Money formatting
`src/lib/money.ts` → `formatMoney(amount, { locale, sign }): string` using
`Intl.NumberFormat(locale==='ar'?'ar-EG':'en-EG', { style:'currency', currency:'EGP', ... })`
BUT force Western digits + "E£"/"EGP" consistently; real Unicode minus (−, U+2212).
Helper to split into `{ symbol, integer, decimals }` for the hero. Income shows
leading `+` in accent; expense shows neutral ink (no sign unless desired). Always
`fontVariant:['tabular-nums','lining-nums']` on numbers.

## 5. Spacing / radius / depth
- Spacing 4pt grid: 4/8/12/16/20/24/32/48. Screen horizontal padding 20. Card padding 16–20. Gap 12–16.
- Radius: cards 20, sheets 28 (top), pills/chips 999, inputs 14, icon tiles 14.
- Depth (dark): NO drop shadows on cards — use surface luminance steps
  (canvas→surface→overlay). Shadows allowed only on the floating tab bar + FAB +
  the accent CTA (accent-colored glow).

## 6. Core components (`src/ui/`)
- `Screen` — SafeAreaView, `bg-canvas`, status bar light. Props: children, scroll?, padded?
- `Card` — `bg-surface rounded-[20px] p-4`.
- `AppText` — Text wrapper applying the locale UI font; variants via className.
- `Money` — renders an amount with tabular Sora; props `{ amount, sign?: 'auto'|'+'|none, size, tone:'ink'|'accent'|'ink2' }`.
- `Hero` — big balance block: tiny label, split big number (Sora 52 + ink2 symbol/decimals), delta pill.
- `CategoryAvatar` — 40×40 rounded-14 tile, category color @14% bg, emoji centered.
- `SectionLabel` — 12px uppercase ink3 tracked label.
- `Pill` / `Chip` — rounded-full, selectable (accentSoft bg + accent text when active).
- `PrimaryButton` — full-width, `bg-accent`, ink-on-accent text `#06251A`, radius 16, haptic medium on press, pressed scale 0.98.
- `SpendingDonut` — `react-native-gifted-charts` PieChart (donut), innerRadius ≈ 72% of radius, `strokeColor`=surface for gaps, center = total spent (Sora) + "SPENT" label; ≤6 slices, rest → "Other".
- `TransactionRow` — CategoryAvatar + (merchant/note 16/600, category·time 13 ink2) + right Money (income accent +, expense ink). Row ~64, hairline divider.
- `EmptyState` — soft accent icon in a circle + headline + subtext + optional CTA.
Animations: `moti` for staggered list reveals (delay index*50, fade+translateY 12)
and the hero count-up; `expo-haptics` for selection/CTA/success.

## 7. Navigation — floating tab bar + center Add FAB
Custom `tabBar` in `app/(tabs)/_layout.tsx` (a `FloatingTabBar` component in `src/ui/`):
- Floating detached pill: `bg-overlay`, radius 32, inset 16 from sides, ~24 above the
  home indicator, soft shadow (allowed here). 4 icon tabs + 1 center FAB.
- Order: **Home · Transactions · [ + FAB ] · Pending · Settings** (Add is the FAB).
  The FAB is the existing `capture` route, rendered as a raised 60px emerald circle
  with a white `+`, overlapping the bar's top edge ~16px, accent glow shadow.
- Active tab: accent icon + label, scale 1.12 + translateY −4 (spring); inactive: ink3 icon.
- Pending tab shows a badge (existing `usePendingContext().count`).
- Haptic `selectionAsync` on tab press, `impactAsync(Medium)` on FAB.
Keep the existing route files (index, capture, pending, transactions, settings); only
the tabBar presentation + per-screen styling change. (Capture stays a route opened by the FAB.)

## 8. Per-screen specs
- **Dashboard (`index`)**: month navigator (‹ June ›) as a quiet pill; **Hero** net/this-month
  big number + delta; **SpendingDonut** with center total; income vs expense as two small
  stat cards; **by-category** ranked list (CategoryAvatar + label + amount + thin progress);
  **Recent** 5 transactions (TransactionRow), "See all" → Transactions. Staggered reveal.
- **Add (`capture`)**: keep voice+text+categorize+auto-add logic. Restyle: a big centered
  amount/preview area, the text field as a clean pill input, a prominent mic, an emerald
  "Add" PrimaryButton, and the post-save banner as a sleek toast card. Keep all testIDs
  (`capture-text`, `capture-categorize`, `capture-mic`, `capture-saved`, `capture-undo`, `capture-error`).
- **Transactions**: month + category filter as chips; list **grouped by day** with a sticky
  day header + per-day subtotal; TransactionRow soft style; tap → EditTransactionSheet (overlay surface).
  Keep testIDs (`txn-row-<id>`, filters, edit sheet).
- **Pending**: same row style with a "via SMS" chip + Confirm/Edit/Reject; keep testIDs
  (`pending-row-<id>`, `pending-confirm-<id>`, `pending-edit-<id>`, `pending-reject-<id>`, `capture-saved` n/a).
- **Settings**: grouped cards (Account, Language, SMS auto-capture, Sign out); keep all
  existing testIDs (locale-en/ar, gen-token, token-value, copy-*, shortcut-guide-toggle, sign-out, etc.).
- **Auth (sign-in/up)**: dark canvas, centered, app wordmark in Sora, emerald PrimaryButton,
  clean pill inputs. Keep testIDs (email-input, password-input, submit-button, error-text).

## 9. Rules (do/don't)
- DON'T: rainbow categories for direction; red for normal expenses; pure #000/#fff; hard
  borders/drop-shadows on cards; >6 donut slices; OS-default fonts; multiple accents.
- DO: one emerald accent; tabular numbers; soft surface-step elevation; emoji categories;
  generous whitespace; haptics; keep every existing `testID` so logic tests stay green.
- Keep all business logic (auth, categorize, api, hooks, ingest) UNCHANGED — this is a
  restyle + recompose, not a rewrite. `npx tsc`, `npx jest`, `deno test` must stay green
  (update only assertions that depend on copy/markup, never logic).
