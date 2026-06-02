# Budget Tracker — Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase-1 MVP of a bilingual (Arabic/English) budget tracker: sign in, capture an income/expense by voice or text, have Claude categorize it into a fixed category set, confirm it, and see it on a dashboard + transactions list. EGP only, track-only (no budget limits), no SMS yet.

**Architecture:** Expo (SDK 54, Expo Router, NativeWind v4) app talking directly to Supabase (Postgres + Auth + Row-Level Security) for CRUD, and to a Supabase Edge Function `categorize` that calls Claude Haiku (`claude-haiku-4-5`) with strict tool-use to return `{type, amount, currency, category_slug, note, confidence}`. The Anthropic key lives only in the Edge Function. In-app captures are confirmed inline and saved as `status='confirmed'`; the `pending` status exists in the schema for Phase-2 SMS but is unused here.

**Tech Stack:** Expo SDK 54 · Expo Router · TypeScript · NativeWind v4.2.1 + Tailwind 3.4.17 · expo-speech-recognition (dev build required) · Supabase (local via Docker CLI) · @supabase/supabase-js · Deno Edge Functions · @anthropic-ai/sdk (claude-haiku-4-5) · Jest + @testing-library/react-native · deno test.

**Scope:** This is **Phase 1 only**. Phase 2 (iOS Shortcut SMS ingestion: `ingest_tokens`, `ingest-sms` function, Pending inbox) and Phase 3 (budget limits, multi-currency, social login) are separate plans. See the spec: `docs/superpowers/specs/2026-06-02-budget-tracker-design.md`.

**Milestone order (each builds on the previous):**
1. Project Scaffold & Tooling
2. Supabase Local Stack, Schema, RLS, Seed, Types
3. Supabase Client, Auth, Navigation Shell, i18n, Settings
4. `categorize` Edge Function (Claude Haiku, strict tool-use)
5. Voice/Text Capture vertical slice
6. Dashboard + Transactions list

---

## Reconciliation Decisions (read before executing)

These resolve cross-milestone overlaps. Where a task body disagrees with this list, **this list wins**.

1. **Transactions filter (M5 ↔ M6):** the canonical type is `TransactionFilter { from?: string; to?: string; category_slug?: string; status?: TxnStatus }` in `src/features/transactions/api.ts` (M5). `listTransactions` applies, in order, `eq(category_slug) → eq(status) → gte(occurred_at, from) → lt(occurred_at, to) → order(occurred_at desc)`. M5 does **not** compute month ranges; M6's `monthRange()` produces `from`/`to`. (Already fixed in the M5 task.)
2. **`Profile` type:** lives in `src/features/auth/SessionProvider.tsx` (M3). It is **not** in `src/types/index.ts`. Any other consumer imports it from `SessionProvider`.
3. **`app/_layout.tsx`:** M1 **creates** it (minimal `Stack`, with `import '../global.css'` as the first line). M3 **modifies** the same file to wrap `SessionProvider` + the auth redirect gate — M3 must EDIT, keeping the `global.css` import first; it must not recreate from scratch.
4. **Default Expo template `(tabs)` group:** the SDK-54 template ships `app/(tabs)/index.tsx` + `app/(tabs)/explore.tsx` + a tab `_layout.tsx`. M3 owns this group: it must **delete** `app/(tabs)/explore.tsx` (and any default screen not in `{index, capture, transactions, settings}`) and create the locked four screens + `_layout.tsx`.
5. **i18n `STRINGS` (M3) must contain every key M6 consumes:** `dashboard_title, net_this_month, income, expense, by_category, recent, no_transactions, transactions_title, all_categories, edit, delete, save, cancel, amount, note, prev_month, next_month, loading` — plus M3's own auth/settings keys — each with `en` + `ar`. M6 render-tests assert specific English strings, so keep them stable.
6. **The 17 category slugs are duplicated across three runtimes** and must stay identical: `src/lib/categories.ts` (M2), `supabase/functions/_shared/categories.ts` (M4), `supabase/seed.sql` (M2). Each file carries a "MUST MATCH" header comment; M2's `categories.test.ts` and M4's `shared_test.ts` each pin the exact set. There is no automated cross-runtime diff — sync by convention.
7. **`expo-speech-recognition` package name:** if `npx expo install` resolves the scoped `@jamsch/expo-speech-recognition` instead of the bare name, use the **actually-installed** name consistently in: `app.json` plugin id (M1), the Jest manual mock path (M1/M5), and the `useSpeechRecognition` import (M5).
8. **Strict tool-use header (M4):** the categorize function uses `client.beta.messages.create` with `anthropic-beta: structured-outputs-2025-11-13`. If `claude-haiku-4-5` ever rejects strict mode, fall back to non-beta `client.messages.create` with `tool_choice: { type: 'tool', name: 'record_transaction' }`; the output-mapping/coercion layer tolerates the difference.
9. **Arabic category labels:** `supabase/seed.sql` (M2) is the source of truth for `name_en`/`name_ar`. M6's render-test label assertions (e.g. `'Food & Drink'`, `'طعام وشراب'`, `'Salary'`) must match the seed exactly — if a label is changed in the seed, update `categories.ts` and the affected M6 test assertions together.

---

## Milestone 1: Project Scaffold & Tooling

This milestone stands up the Expo SDK 54 + Expo Router TypeScript app **at the repo root** (which already contains `.git/` and `docs/`), wires in NativeWind v4.2.1 + Tailwind CSS 3.4.17 across all five config files, registers the `expo-speech-recognition` config plugin with the required permission strings, sets up Jest (`jest-expo` + `@testing-library/react-native`) with a passing NativeWind smoke test, and documents the mandatory dev-build workflow. After this milestone the app boots via `npx expo start` (dev client) and `npm test` passes.

**Locked contract notes honored here:** Expo SDK 54, Expo Router, NativeWind **v4.2.1** + tailwindcss **^3.4.17** (NOT v5/v4); Reanimated v4 ships its own worklets plugin so we add **only** `'react-native-reanimated/plugin'` (last); `expo-speech-recognition` is installed via `npx expo install` and **requires a dev build** (Expo Go will not work). `app/_layout.tsx` is created here as a **minimal `Stack`** that imports `../global.css`; **M3 will extend it** to wrap `SessionProvider` and add the auth redirect gate. This milestone does **not** create `src/types`, `src/lib`, `supabase/`, or any feature code — those are owned by later milestones.

---

### Task 1.1: Scaffold the Expo app at the repo root without clobbering `.git`/`docs`

`create-expo-app` refuses to run in a non-empty directory, so we scaffold into a temporary sibling directory, then move its contents into the repo root and delete the temp directory. We never touch `.git/` or `docs/`.

**Files:**
- Create (via generator): `package.json`, `app.json`, `tsconfig.json`, `app/_layout.tsx`, `app/(tabs)/`, `app/+not-found.tsx`, `assets/`, `expo-env.d.ts`, etc. (full Expo Router default template tree)
- Preserve untouched: `.git/`, `docs/`

**Steps:**

- [ ] **Step 1: Confirm the repo root is clean and only contains `.git` + `docs`.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  ls -A1
  ```
  Expected output (order may vary):
  ```
  .git
  docs
  ```
  If anything else is present, STOP and reconcile before scaffolding.

- [ ] **Step 2: Scaffold the default Expo Router TypeScript template into a temp dir.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx create-expo-app@latest tmp-app --template default --yes
  ```
  This creates `tmp-app/` containing a TypeScript Expo Router project (Expo SDK 54). It installs node_modules inside `tmp-app/`. Expected tail of output:
  ```
  ✅ Your project is ready!
  ```
  Verify the SDK version:
  ```bash
  node -e "console.log(require('/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/tmp-app/package.json').dependencies.expo)"
  ```
  Expected: a value beginning with `~54.` (e.g. `~54.0.0`). If it is not SDK 54, STOP and re-run with an explicit SDK 54 template before continuing.

- [ ] **Step 3: Move all of `tmp-app/`'s contents (including dotfiles, excluding `.` and `..`) into the repo root.**
  We enable `dotglob` so hidden files like `.gitignore` move too, but `tmp-app` has no `.git` so there is no risk to the real `.git/`.
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/tmp-app
  setopt dotglob 2>/dev/null || shopt -s dotglob
  mv -n -- * ../
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  ls -A1
  ```
  Expected to now include the moved project files plus the originals, e.g.:
  ```
  .git
  .gitignore
  app
  app.json
  assets
  docs
  expo-env.d.ts
  node_modules
  package.json
  scripts
  tsconfig.json
  tmp-app
  ```
  `mv -n` (no-clobber) guarantees nothing already at the root (`.git`, `docs`) is overwritten. If `mv` reports it skipped a path that you actually need, resolve it manually.

- [ ] **Step 4: Remove the now-empty temp directory and confirm `.git` + `docs` are intact.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  rmdir tmp-app
  ls -A1 docs/ && git -C . rev-parse --is-inside-work-tree
  ```
  Expected: `docs/` still lists its `superpowers` subtree and the final line prints `true`. If `rmdir` fails because `tmp-app` is non-empty, list its remaining contents (`ls -A1 tmp-app`) and move them out before retrying.

- [ ] **Step 5: Sanity-check the project structure produced by the template.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  find app -maxdepth 2 -type f | sort
  test -f app/_layout.tsx && echo "root layout present"
  ```
  Expected: a root `app/_layout.tsx` exists and prints `root layout present`. (The default template also ships an `app/(tabs)/` group and `app/+not-found.tsx`; M3 will reshape the `(tabs)` group and add `(auth)`, so we leave it for now.)

- [ ] **Step 6: Commit the raw scaffold.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  git add -A
  git commit -m "chore: scaffold Expo SDK 54 + Expo Router TypeScript app at repo root"
  ```

---

### Task 1.2: Install NativeWind v4.2.1, Tailwind 3.4.17, Reanimated, and speech recognition

We pin NativeWind and Tailwind to the locked versions and use `npx expo install` for the React-Native-native dependencies so Metro/SDK alignment is correct.

**Files:**
- Modify: `package.json` (dependencies + devDependencies)

**Steps:**

- [ ] **Step 1: Install NativeWind v4.2.1 and Tailwind 3.4.17 (exact/compatible pins).**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npm install nativewind@4.2.1
  npm install --save-dev tailwindcss@^3.4.17 prettier-plugin-tailwindcss@^0.5.11
  ```
  Verify the resolved versions:
  ```bash
  node -e "const p=require('/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/package.json');console.log('nativewind',p.dependencies.nativewind);console.log('tailwindcss',p.devDependencies.tailwindcss)"
  ```
  Expected:
  ```
  nativewind 4.2.1
  tailwindcss ^3.4.17
  ```
  If `tailwindcss` resolved to a `4.x` line, STOP — it must be the 3.4.x line.

- [ ] **Step 2: Install the RN-native peers via `expo install` so versions match SDK 54.**
  `react-native-reanimated` and `react-native-safe-area-context` are NativeWind peers; `expo install` picks the SDK-54-compatible versions.
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx expo install react-native-reanimated react-native-safe-area-context
  ```
  Verify Reanimated is the v4 line (it ships its own worklets plugin, which is why babel must NOT add `react-native-worklets/plugin`):
  ```bash
  node -e "console.log(require('/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/package.json').dependencies['react-native-reanimated'])"
  ```
  Expected: a value on the `~4.` line (e.g. `~4.0.0`). If it is on the `3.x` line, STOP — the babel/worklets guidance below assumes Reanimated v4.

- [ ] **Step 3: Install `expo-speech-recognition` via the SDK-54 compatible line.**
  Per the locked contract, install with `npx expo install` (this resolves the SDK-54-compatible release of the jamsch module and registers its config plugin name as `expo-speech-recognition`).
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx expo install expo-speech-recognition
  ```
  Verify it landed in dependencies:
  ```bash
  node -e "const d=require('/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/package.json').dependencies;console.log('expo-speech-recognition', d['expo-speech-recognition'])"
  ```
  Expected: a non-undefined version string. If `expo install` resolved the scoped `@jamsch/expo-speech-recognition` name instead, note the real installed name and use that exact name as the app.json plugin id in Task 1.4 Step 1.

- [ ] **Step 4: Commit the dependency additions.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  git add -A
  git commit -m "chore: add nativewind 4.2.1, tailwind 3.4.17, reanimated, speech-recognition deps"
  ```

---

### Task 1.3: Write the five NativeWind config files + import `global.css` in the root layout

This is config, not testable logic, so the steps are concrete file contents plus a verification step. We will write/overwrite `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, and `nativewind-env.d.ts`, and edit `app/_layout.tsx` to import the CSS.

**Files:**
- Create/Modify: `babel.config.js`
- Create/Modify: `metro.config.js`
- Create/Modify: `tailwind.config.js`
- Create: `global.css`
- Create: `nativewind-env.d.ts`
- Modify: `app/_layout.tsx`
- Modify: `app.json` (ensure `web.bundler` is `metro`)
- Modify: `tsconfig.json` (ensure `nativewind-env.d.ts` is picked up)

**Steps:**

- [ ] **Step 1: Write `babel.config.js`.**
  `babel-preset-expo` gets `jsxImportSource: 'nativewind'`, the `nativewind/babel` preset is added, and `react-native-reanimated/plugin` is the **last** plugin. We deliberately do NOT add `react-native-worklets/plugin` — Reanimated v4 includes worklets internally and adding both throws a duplicate-plugin error.
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/babel.config.js`
  ```javascript
  module.exports = function (api) {
    api.cache(true);
    return {
      presets: [
        ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
        'nativewind/babel',
      ],
      plugins: [
        // Reanimated v4 bundles its own worklets plugin; this must be LAST
        // and we must NOT also add 'react-native-worklets/plugin'.
        'react-native-reanimated/plugin',
      ],
    };
  };
  ```

- [ ] **Step 2: Write `metro.config.js`.**
  Wrap the default Expo Metro config with NativeWind, pointing at `./global.css`.
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/metro.config.js`
  ```javascript
  const { getDefaultConfig } = require('expo/metro-config');
  const { withNativeWind } = require('nativewind/metro');

  const config = getDefaultConfig(__dirname);

  module.exports = withNativeWind(config, { input: './global.css' });
  ```

- [ ] **Step 3: Write `tailwind.config.js` with content globs covering `app/`, `src/`, and `components/`.**
  We add `src/` and `components/` now even though they don't all exist yet, so styles in later milestones' files are not purged.
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/tailwind.config.js`
  ```javascript
  /** @type {import('tailwindcss').Config} */
  module.exports = {
    content: [
      './app/**/*.{js,jsx,ts,tsx}',
      './src/**/*.{js,jsx,ts,tsx}',
      './components/**/*.{js,jsx,ts,tsx}',
    ],
    presets: [require('nativewind/preset')],
    theme: {
      extend: {},
    },
    plugins: [],
  };
  ```

- [ ] **Step 4: Write `global.css` with the three Tailwind directives.**
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/global.css`
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```

- [ ] **Step 5: Write `nativewind-env.d.ts` so `className` on RN components type-checks.**
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/nativewind-env.d.ts`
  ```typescript
  /// <reference types="nativewind/types" />
  ```

- [ ] **Step 6: Replace `app/_layout.tsx` with a minimal root layout that imports `../global.css`.**
  This is the root layout. M3 will extend this exact file to wrap `SessionProvider` and add the auth redirect gate — for now it is a bare `Stack` with the CSS import at the very top.
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/app/_layout.tsx`
  ```tsx
  import '../global.css';

  import { Stack } from 'expo-router';

  export default function RootLayout() {
    // NOTE: M3 will wrap this with <SessionProvider> and add the auth redirect
    // gate. Keep the global.css import as the FIRST line in this file.
    return <Stack screenOptions={{ headerShown: false }} />;
  }
  ```

- [ ] **Step 7: Ensure `app.json` declares the Metro web bundler.**
  Read `app.json` and confirm `expo.web.bundler` is `"metro"` (the SDK 54 default template already sets this). If the `web` key is missing, add:
  ```json
  "web": {
    "bundler": "metro"
  }
  ```
  under the `expo` object. (Permission/plugin edits to `app.json` happen in Task 1.4.)

- [ ] **Step 8: Ensure `tsconfig.json` includes the NativeWind types declaration.**
  Read `tsconfig.json`. The default Expo template extends `expo/tsconfig.base` and uses an `include` of `["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]`. Confirm the glob picks up `nativewind-env.d.ts` (it does via `**/*.ts`). If the template uses a narrower `include`, add `"nativewind-env.d.ts"` to the array.

- [ ] **Step 9: Type-check to confirm config files compile and `nativewind/types` resolves.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx tsc --noEmit
  ```
  Expected: no output and exit code 0 (no type errors). If `tsc` complains that `className` is unknown on RN components, re-check that `nativewind-env.d.ts` exists and is included.

- [ ] **Step 10: Commit the NativeWind configuration.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  git add -A
  git commit -m "feat: configure NativeWind v4 (babel/metro/tailwind/global.css) and import css in root layout"
  ```

---

### Task 1.4: Register the `expo-speech-recognition` config plugin with permission strings

The library ships native code via a config plugin and must be registered in `app.json` with iOS microphone/speech usage strings and the Android speech-service package allow-list. This is what forces the dev build.

**Files:**
- Modify: `app.json`

**Steps:**

- [ ] **Step 1: Read `app.json` and locate the `expo.plugins` array.**
  The default SDK 54 template already lists `expo-router` (and usually `expo-splash-screen`) in `expo.plugins`. We append the speech-recognition plugin entry. Use the **exact plugin id that was actually installed** in Task 1.2 Step 3 (normally `"expo-speech-recognition"`).

- [ ] **Step 2: Add the plugin entry with permission strings to `expo.plugins`.**
  Append this array element to `expo.plugins` (keep the existing `expo-router` / `expo-splash-screen` entries):
  ```json
  [
    "expo-speech-recognition",
    {
      "microphonePermission": "Allow $(PRODUCT_NAME) to use the microphone to capture spoken expenses.",
      "speechRecognitionPermission": "Allow $(PRODUCT_NAME) to use speech recognition to transcribe spoken expenses.",
      "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox"]
    }
  ]
  ```
  These map to `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` (iOS) and the Android `RECORD_AUDIO` permission / `<queries>` package list, all injected by the plugin during prebuild.

- [ ] **Step 3: Validate the app config resolves with the plugin registered.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx expo config --type public > /dev/null && echo "app config OK"
  ```
  Expected: `app config OK` (exit 0). If `expo config` errors with "Failed to resolve plugin for module 'expo-speech-recognition'", the installed package name differs — fix the plugin id in Step 2 to match the actual installed name from Task 1.2.

- [ ] **Step 4: Confirm the iOS permission strings are present in the resolved config.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx expo config --type public --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);const i=c.ios&&c.ios.infoPlist||{};console.log('mic:', i.NSMicrophoneUsageDescription||'(set at prebuild)');console.log('speech:', i.NSSpeechRecognitionUsageDescription||'(set at prebuild)');})"
  ```
  Expected: prints the two usage strings, OR `(set at prebuild)` for each (some config plugins inject Info.plist keys only during `prebuild`, not in the resolved public config — either result is acceptable; the authoritative check is Task 1.6 Step 3 which inspects the generated `Info.plist`).

- [ ] **Step 5: Commit the plugin registration.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  git add -A
  git commit -m "feat: register expo-speech-recognition config plugin with mic/speech permissions"
  ```

---

### Task 1.5: Set up Jest + Testing Library and a passing NativeWind smoke test (TDD)

We follow TDD: add the test infra and a smoke test that asserts a NativeWind-styled `<Text>` mounts, run it (red until config is right), then make it pass. We also mock the native speech module globally so no test ever touches native code.

**Files:**
- Modify: `package.json` (devDependencies + `jest` key + `test` script)
- Create: `jest.config.js`
- Create: `jest-setup.ts`
- Create: `__tests__/smoke.test.tsx`

**Steps:**

- [ ] **Step 1: Install Jest tooling via `expo install` (for `jest-expo`) and npm for the rest.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx expo install jest-expo
  npm install --save-dev jest @testing-library/react-native @types/jest react-test-renderer
  ```
  Verify:
  ```bash
  node -e "const d=require('/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/package.json').devDependencies;console.log('jest-expo',d['jest-expo'],'| rntl',d['@testing-library/react-native'])"
  ```
  Expected: both print non-undefined versions.

- [ ] **Step 2: Add the `test` script to `package.json`.**
  Edit `package.json` `scripts` to add:
  ```json
  "test": "jest"
  ```
  (Keep the existing `start`, `android`, `ios`, `web`, `lint` scripts.)

- [ ] **Step 3: Write `jest.config.js`.**
  We use the `jest-expo` preset and a `transformIgnorePatterns` that allows Babel to transpile the RN/Expo/NativeWind/Reanimated/speech packages (they ship untranspiled). A `setupFilesAfterEnv` loads our setup file.
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/jest.config.js`
  ```javascript
  /** @type {import('jest').Config} */
  module.exports = {
    preset: 'jest-expo',
    setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
    transformIgnorePatterns: [
      'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop|react-native-reanimated|expo-speech-recognition|@jamsch/.*))',
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  };
  ```

- [ ] **Step 4: Write `jest-setup.ts`.**
  `@testing-library/react-native` v12.4+ auto-extends Jest matchers, but we import the matchers explicitly to be safe, and we mock the native speech module so no test loads native code. (M5 owns the real speech hook + its own focused mock; this global mock just keeps the module importable in any test that transitively pulls it in.)
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/jest-setup.ts`
  ```typescript
  import '@testing-library/react-native/extend-expect';

  // Keep the native speech-recognition module importable under Jest (it ships
  // native code). M5 provides the behavioral mock for the real hook; this is a
  // minimal stand-in so unrelated tests can import the module without crashing.
  jest.mock('expo-speech-recognition', () => ({
    ExpoSpeechRecognitionModule: {
      requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
      getPermissionsAsync: jest.fn(async () => ({ granted: true })),
      getSupportedLocales: jest.fn(async () => ({ locales: [], installedLocales: [] })),
      supportsOnDeviceRecognition: jest.fn(() => false),
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
    },
    useSpeechRecognitionEvent: jest.fn(),
    addSpeechRecognitionListener: jest.fn(() => ({ remove: jest.fn() })),
  }));
  ```

- [ ] **Step 5: Write the failing smoke test.**
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/__tests__/smoke.test.tsx`
  ```tsx
  import React from 'react';
  import { Text, View } from 'react-native';
  import { render, screen } from '@testing-library/react-native';

  function StyledHello() {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-lg font-bold text-black">Budget Tracker</Text>
      </View>
    );
  }

  describe('NativeWind smoke test', () => {
    it('renders a className-styled Text and mounts it', () => {
      render(<StyledHello />);
      expect(screen.getByText('Budget Tracker')).toBeOnTheScreen();
    });
  });
  ```

- [ ] **Step 6: Run the test and watch it go red if config is wrong, then green.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npm test
  ```
  Expected on first run **before** config is correct (FAIL) — e.g. `Cannot find module 'jest-setup.ts'`, a `transformIgnorePatterns` SyntaxError from an untranspiled NativeWind/Reanimated file, or `toBeOnTheScreen is not a function`. Iterate on `jest.config.js` / `jest-setup.ts` until you reach:
  ```
  PASS  __tests__/smoke.test.tsx
    NativeWind smoke test
      ✓ renders a className-styled Text and mounts it
  Tests:       1 passed, 1 total
  ```
  Expected final: **PASS**, 1 test passing.

- [ ] **Step 7: Commit the test infrastructure + passing smoke test.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  git add -A
  git commit -m "test: add jest-expo + RNTL setup and passing NativeWind smoke test"
  ```

---

### Task 1.6: `.gitignore`, `.env.example`, dev-build docs, and final verification

Finalize ignore rules, the env template, document the mandatory dev build, and verify `npm test` passes and `npx expo start` boots.

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `README.dev.md` (dev-build instructions)

**Steps:**

- [ ] **Step 1: Overwrite `.gitignore` with a complete RN/Expo + secrets ruleset.**
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/.gitignore`
  ```gitignore
  # dependencies
  node_modules/

  # Expo
  .expo/
  dist/
  web-build/
  expo-env.d.ts

  # Native build dirs (regenerated by prebuild / dev build)
  /ios/
  /android/

  # Metro
  .metro-health-check*

  # Env / secrets
  .env
  .env.*.local
  .env*.local
  supabase/functions/.env

  # Supabase local artifacts
  supabase/.temp/
  supabase/.branches/

  # macOS / editor
  .DS_Store
  *.log
  npm-debug.*
  yarn-debug.*
  yarn-error.*

  # Testing
  coverage/

  # TypeScript
  *.tsbuildinfo
  ```
  Note: `.env.example` is intentionally NOT ignored (only `.env` and local variants are). `expo-env.d.ts` is generated and ignored; `nativewind-env.d.ts` is hand-authored and committed.

- [ ] **Step 2: Create `.env.example`.**
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/.env.example`
  ```dotenv
  # Supabase — copy to .env and fill in. Both keys are EXPO_PUBLIC_* so they are
  # inlined into the app bundle at build time (the anon/publishable key is
  # RLS-protected and safe to ship; never put the service-role key here).
  #
  # A physical iPhone must use the Mac's LAN IP (e.g. http://192.168.x.x:54321),
  # NOT localhost/127.0.0.1. The iOS simulator may use http://127.0.0.1:54321.
  EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-publishable-key
  ```

- [ ] **Step 3: Write `README.dev.md` documenting the mandatory dev build.**
  Path: `/Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/README.dev.md`
  ```markdown
  # Dev Build Required (no Expo Go)

  This app uses `expo-speech-recognition`, which ships native code via a config
  plugin. **Expo Go cannot run it.** You must build and run a development build.

  ## First-time iOS dev build

  ```bash
  npm install
  npx expo run:ios       # builds the native iOS app + installs the dev client
  ```

  On subsequent runs you can just start the bundler against the dev client:

  ```bash
  npx expo start --dev-client
  ```

  ## Why a dev build?

  - `expo-speech-recognition` injects `NSMicrophoneUsageDescription`,
    `NSSpeechRecognitionUsageDescription` (iOS) and `RECORD_AUDIO` / speech
    service queries (Android) at prebuild — these only exist in a custom native
    build, not in Expo Go.
  - NativeWind is build-time only and works in any build; the speech dependency
    is what forces the dev build from day one.

  ## Physical iPhone + local Supabase

  - A physical device must reach the Mac via its **LAN IP**
    (`http://192.168.x.x:54321`), not `localhost`. Same Wi-Fi; allow the port
    through the macOS firewall. The simulator may use `127.0.0.1`.
  - Local Supabase is plain HTTP — add an App Transport Security (ATS) exception
    for the LAN host in the dev build, or front it with an HTTPS tunnel.

  ## Regenerating native dirs

  `/ios` and `/android` are gitignored and regenerated. To recreate them:

  ```bash
  npx expo prebuild --clean
  ```
  ```

- [ ] **Step 4: Verify `npm test` still passes after all config changes.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npm test
  ```
  Expected:
  ```
  PASS  __tests__/smoke.test.tsx
  Tests:       1 passed, 1 total
  ```

- [ ] **Step 5: Verify the bundler boots (Metro starts and resolves the entry without errors).**
  Start Metro headless with a timeout (it stays resident, so we time-box it) and confirm it reaches the "waiting on" ready state without a config/transform error:
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  ( npx expo start --dev-client --port 8081 & sleep 25; kill %1 2>/dev/null ) 2>&1 | tee /tmp/expo-boot.log | tail -30
  grep -Eq "Waiting on|Metro waiting|exp://|Logs for your project" /tmp/expo-boot.log && echo "BOOT OK" || echo "BOOT CHECK FAILED — inspect /tmp/expo-boot.log"
  ```
  Expected: `BOOT OK`, and the log shows the Metro dev server URL with **no** errors about `withNativeWind`, `nativewind/babel`, a duplicate Reanimated/worklets plugin, or a missing `global.css`. If it fails, read `/tmp/expo-boot.log`, fix the offending config file, and re-run. (We intentionally do not run a full `expo run:ios` native build here — that is the developer's first-time step documented in `README.dev.md`; this milestone verifies the bundler/config only.)

- [ ] **Step 6: Final type-check across the project.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  npx tsc --noEmit && echo "TYPECHECK OK"
  ```
  Expected: `TYPECHECK OK`.

- [ ] **Step 7: Commit the ignore rules, env template, and dev docs.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  git add -A
  git commit -m "chore: add .gitignore, .env.example, and dev-build documentation"
  ```

- [ ] **Step 8: Confirm the working tree is clean and the milestone is green.**
  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
  git status --short && git log --oneline -7
  ```
  Expected: empty `git status` (clean tree) and a log showing the six commits from this milestone. Milestone 1 is complete: the Expo SDK 54 + Expo Router app boots, NativeWind v4 is wired across all five config files, the speech plugin is registered, and `npm test` passes.

---

## Milestone 2: Supabase Local Stack, Schema, RLS, Seed, Types

This milestone stands up the local Supabase stack (Postgres + Auth + Studio in Docker via the Supabase CLI), writes the database schema (`profiles`, `categories`, `transactions`) with indexes, RLS policies, and a profile-on-signup trigger, seeds the bilingual category set, and creates the two shared source-of-truth modules every other milestone imports: `src/types/index.ts` and `src/lib/categories.ts`. The category list in `categories.ts` is TDD-locked against the contract slug set, and the seed SQL mirrors that same set exactly. We finish with a documented RLS integration check proving user A's data is invisible to anon/user B.

> Prerequisite (M1 done): `package.json`, `tsconfig.json`, `jest.config.js` + jest setup, and the Expo scaffold already exist at the repo root. The Supabase CLI must be installed (`brew install supabase/tap/supabase` or `npx supabase`) and **Docker Desktop must be running** — `supabase start` boots Postgres/Auth/Studio/Kong containers and will fail with a clear error if the Docker daemon is down.

---

### Task 2.1: Initialize the Supabase local stack

**Files:**
- Create: `supabase/config.toml` (generated by `supabase init`)
- Create: `supabase/.gitignore` (generated by `supabase init`)
- Create: `supabase/seed.sql` (created empty here, filled in Task 2.4)
- Modify: `.env.example` (add the local Supabase URL + anon key placeholders), `.gitignore` (ignore `.env`)

- [ ] **Step 1: Confirm Docker is running.** `supabase start` requires a live Docker daemon. Verify before anything else.

  ```bash
  docker info >/dev/null 2>&1 && echo "Docker OK" || echo "Docker NOT running — start Docker Desktop first"
  ```

  Expected output: `Docker OK`. If it prints the failure message, open Docker Desktop and wait for it to finish starting, then re-run.

- [ ] **Step 2: Initialize Supabase.** From the repo root, run the non-interactive init. This creates `supabase/config.toml`, `supabase/.gitignore`, and `supabase/seed.sql`. The `--with-vscode-settings=false` / generator flags are skipped here to keep it minimal; answer `N` if prompted to generate VS Code settings.

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && supabase init
  ```

  Expected output (one of):
  ```
  Finished supabase init.
  ```
  (If it reports `Project already initialized`, that is fine — the files exist.)

  Verify the structure:

  ```bash
  ls -1 /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase
  ```

  Expected output includes:
  ```
  .gitignore
  config.toml
  ```

- [ ] **Step 3: Verify the default seed config in `config.toml`.** The generated `config.toml` already enables seeding from `./seed.sql` on `db reset`. Confirm the `[db.seed]` block exists so our seed runs automatically.

  ```bash
  grep -nA3 '\[db.seed\]' /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/config.toml
  ```

  Expected output (paths shown relative to the `supabase/` dir):
  ```
  [db.seed]
  enabled = true
  sql_paths = ['./seed.sql']
  ```

  If the block is missing or `enabled = false`, edit `config.toml` to contain exactly:

  ```toml
  [db.seed]
  enabled = true
  sql_paths = ['./seed.sql']
  ```

- [ ] **Step 4: Start the stack (boots Docker containers).**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && supabase start
  ```

  This pulls images on first run (can take a few minutes). Expected tail of output:
  ```
  Started supabase local development setup.

           API URL: http://127.0.0.1:54321
       GraphQL URL: http://127.0.0.1:54321/graphql/v1
            DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        Studio URL: http://127.0.0.1:54323
      Inbucket URL: http://127.0.0.1:54324
        JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
          anon key: eyJhbGciOiJ...
  service_role key: eyJhbGciOiJ...
  ```

- [ ] **Step 5: Read the connection values via `supabase status`.** `supabase status` re-prints the `API URL`, `anon key`, and `service_role key`. These are what populate `.env`.

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && supabase status
  ```

  Expected: the same `API URL`, `anon key`, `service_role key` lines as above.

  > **Device note (document, do not configure now):** a physical iPhone cannot reach `127.0.0.1` — it must use the Mac's LAN IP (e.g. `http://192.168.1.20:54321`). The iOS Simulator can use `127.0.0.1`. Find the LAN IP with `ipconfig getifaddr en0`. Local Supabase serves plain HTTP, so the dev build needs an ATS exception (handled in M1/M3 app config), or use a tunnel.

- [ ] **Step 6: Update `.env.example`.** Document the env keys the app reads (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Append/overwrite `.env.example` so it contains exactly:

  ```bash
  # Supabase local stack — values come from `supabase status`.
  # Simulator: use 127.0.0.1. Physical iPhone: use your Mac LAN IP (ipconfig getifaddr en0).
  EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  EXPO_PUBLIC_SUPABASE_ANON_KEY=paste-anon-key-from-supabase-status
  ```

  Create the real (gitignored) `.env` by copying and pasting the actual anon key from Step 5:

  ```bash
  cp /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/.env.example /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/.env
  ```
  Then edit `.env` and replace `paste-anon-key-from-supabase-status` with the real `anon key` from `supabase status`.

- [ ] **Step 7: Ensure `.env` is gitignored.** Confirm `.gitignore` (created by M1) ignores `.env`; add it if absent.

  ```bash
  grep -qxF '.env' /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/.gitignore && echo "already ignored" || printf '\n# Local secrets\n.env\n' >> /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/.gitignore
  ```

  Expected: `already ignored`, or the lines get appended.

- [ ] **Step 8: Commit.**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && git add supabase/config.toml supabase/.gitignore .env.example .gitignore && git commit -m "chore(supabase): init local stack config and env example"
  ```

---

### Task 2.2: Database schema — migration `0001_init.sql`

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Create the migration file** at `supabase/migrations/0001_init.sql` with the full schema (tables, constraints, FKs, indexes). RLS and the trigger are added in Tasks 2.3 and 2.4 but live in the **same** migration file (one `0001_init.sql` applied by `db reset`). Write the tables-and-indexes portion first; we extend the same file below.

  ```sql
  -- 0001_init.sql — Budget Tracker schema (Phase 1)
  -- Tables: profiles, categories, transactions. + indexes, RLS, profile-on-signup trigger.
  -- NOTE: ingest_tokens is Phase 2 and intentionally NOT created here.

  -- ---------------------------------------------------------------------------
  -- profiles : one row per auth user, keyed on auth.users.id
  -- ---------------------------------------------------------------------------
  create table public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    display_name text,
    locale       text not null default 'en' check (locale in ('ar', 'en')),
    currency     text not null default 'EGP',
    created_at   timestamptz not null default now()
  );

  -- ---------------------------------------------------------------------------
  -- categories : global, seeded, read-only to users. Bilingual labels.
  -- ---------------------------------------------------------------------------
  create table public.categories (
    slug       text primary key,
    name_en    text not null,
    name_ar    text not null,
    kind       text not null check (kind in ('expense', 'income')),
    icon       text not null,
    color      text not null,
    sort_order int  not null
  );

  -- ---------------------------------------------------------------------------
  -- transactions : per-user core table
  -- ---------------------------------------------------------------------------
  create table public.transactions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    type          text not null check (type in ('expense', 'income')),
    amount        numeric(14, 2) not null check (amount > 0),
    currency      text not null default 'EGP',
    category_slug text not null references public.categories (slug),
    note          text,
    raw_text      text,
    source        text not null check (source in ('voice', 'text', 'sms')),
    status        text not null default 'confirmed' check (status in ('pending', 'confirmed')),
    confidence    numeric(3, 2),
    occurred_at   timestamptz not null default now(),
    created_at    timestamptz not null default now()
  );

  -- Indexes tuned for the dashboard (per-user time window) and category filtering.
  create index transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc);
  create index transactions_user_category_idx on public.transactions (user_id, category_slug);
  ```

- [ ] **Step 2: Verify the SQL is syntactically valid against the running DB** by applying it standalone (this also confirms the migration is picked up). We do a full `db reset` after the trigger/RLS are added; for now just lint the file exists and is non-empty.

  ```bash
  wc -l /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/migrations/0001_init.sql
  ```

  Expected: a line count > 40. (Full apply + verification happens in Task 2.4 Step 5, after RLS + trigger + seed are in place.)

- [ ] **Step 3: Commit.**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && git add supabase/migrations/0001_init.sql && git commit -m "feat(db): add profiles, categories, transactions schema + indexes"
  ```

---

### Task 2.3: Row-Level Security policies

**Files:**
- Modify: `supabase/migrations/0001_init.sql` (append RLS section)

- [ ] **Step 1: Append the RLS section to `supabase/migrations/0001_init.sql`.** Enable RLS on `profiles` and `transactions`; wrap `auth.uid()` in a sub-`select` (initPlan caching — the Supabase-recommended performance pattern). `categories` gets RLS enabled with a read-only SELECT policy for `anon` + `authenticated` and **no** write policies (so it is effectively read-only to all clients; only the seed/service role writes it).

  Append exactly:

  ```sql

  -- ---------------------------------------------------------------------------
  -- Row-Level Security
  -- ---------------------------------------------------------------------------

  -- profiles: owner-only, keyed on id ( = auth.uid() )
  alter table public.profiles enable row level security;

  create policy "profiles_select_own"
    on public.profiles for select
    to authenticated
    using ( (select auth.uid()) = id );

  create policy "profiles_insert_own"
    on public.profiles for insert
    to authenticated
    with check ( (select auth.uid()) = id );

  create policy "profiles_update_own"
    on public.profiles for update
    to authenticated
    using ( (select auth.uid()) = id )
    with check ( (select auth.uid()) = id );

  create policy "profiles_delete_own"
    on public.profiles for delete
    to authenticated
    using ( (select auth.uid()) = id );

  -- transactions: owner-only, keyed on user_id
  alter table public.transactions enable row level security;

  create policy "transactions_select_own"
    on public.transactions for select
    to authenticated
    using ( (select auth.uid()) = user_id );

  create policy "transactions_insert_own"
    on public.transactions for insert
    to authenticated
    with check ( (select auth.uid()) = user_id );

  create policy "transactions_update_own"
    on public.transactions for update
    to authenticated
    using ( (select auth.uid()) = user_id )
    with check ( (select auth.uid()) = user_id );

  create policy "transactions_delete_own"
    on public.transactions for delete
    to authenticated
    using ( (select auth.uid()) = user_id );

  -- categories: global read-only reference data.
  -- RLS on with a permissive SELECT for anon + authenticated, and NO write policy
  -- (so reads work for everyone, writes are denied to all client roles).
  alter table public.categories enable row level security;

  create policy "categories_select_all"
    on public.categories for select
    to anon, authenticated
    using ( true );
  ```

- [ ] **Step 2: Sanity-check the policy names are unique and the file parses** (rough lint — full apply in 2.4).

  ```bash
  grep -c 'create policy' /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/migrations/0001_init.sql
  ```

  Expected: `9` (4 profiles + 4 transactions + 1 categories).

- [ ] **Step 3: Commit.**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && git add supabase/migrations/0001_init.sql && git commit -m "feat(db): enable RLS with owner-only policies + categories read-only"
  ```

---

### Task 2.4: Profile-on-signup trigger + bilingual category seed, then apply

**Files:**
- Modify: `supabase/migrations/0001_init.sql` (append trigger section)
- Create: `supabase/seed.sql`

- [ ] **Step 1: Append the profile-on-signup trigger to `supabase/migrations/0001_init.sql`.** The function is `security definer` with `set search_path = ''` (mandatory hardening so the `supabase_auth_admin` role, which fires the trigger, can write to `public.profiles`; the empty search_path blocks search-path hijacking, which is why every table is schema-qualified). It pulls an optional `display_name` and `locale` from `raw_user_meta_data` if the client passed them at sign-up, defaulting locale to `en`.

  Append exactly:

  ```sql

  -- ---------------------------------------------------------------------------
  -- Auto-create a profiles row when a new auth user is created.
  -- SECURITY DEFINER so the supabase_auth_admin role can insert into public.profiles.
  -- search_path = '' (hardening) -> everything is schema-qualified below.
  -- ---------------------------------------------------------------------------
  create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    insert into public.profiles (id, display_name, locale)
    values (
      new.id,
      new.raw_user_meta_data ->> 'display_name',
      coalesce(new.raw_user_meta_data ->> 'locale', 'en')
    );
    return new;
  end;
  $$;

  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  ```

- [ ] **Step 2: Create the bilingual category seed at `supabase/seed.sql`.** This MIRRORS the contract slug list exactly (12 expense + 5 income = 17 rows) and is the source of truth that `src/lib/categories.ts` must match (Task 2.5 TDD enforces it). Arabic names are correct, idiomatic Egyptian/MSA finance labels. Icons use Material Community Icon names (used later by the UI); colors are hex tokens. `sort_order` is monotonic within each kind.

  ```sql
  -- seed.sql — global category reference data (bilingual). Runs on `supabase db reset`.
  -- Source of truth mirrored by src/lib/categories.ts (kept in sync via a unit test).

  insert into public.categories (slug, name_en, name_ar, kind, icon, color, sort_order) values
    -- Expense
    ('food',          'Food & Drink',       'طعام وشراب',     'expense', 'food',                '#F97316', 10),
    ('groceries',     'Groceries',          'بقالة',          'expense', 'cart',                '#22C55E', 20),
    ('transport',     'Transport',          'مواصلات',        'expense', 'car',                 '#3B82F6', 30),
    ('clothes',       'Clothes',            'ملابس',          'expense', 'tshirt-crew',         '#EC4899', 40),
    ('bills',         'Bills & Utilities',  'فواتير ومرافق',  'expense', 'file-document',       '#EAB308', 50),
    ('health',        'Health',             'صحة',            'expense', 'heart-pulse',         '#EF4444', 60),
    ('entertainment', 'Entertainment',      'ترفيه',          'expense', 'movie-open',          '#A855F7', 70),
    ('education',     'Education',           'تعليم',          'expense', 'school',              '#06B6D4', 80),
    ('home',          'Home',               'منزل',           'expense', 'home',                '#14B8A6', 90),
    ('travel',        'Travel',             'سفر',            'expense', 'airplane',            '#0EA5E9', 100),
    ('shopping',      'Shopping',           'تسوق',           'expense', 'shopping',            '#F43F5E', 110),
    ('other_expense', 'Other',              'أخرى',           'expense', 'dots-horizontal',     '#94A3B8', 120),
    -- Income
    ('salary',        'Salary',             'راتب',           'income',  'cash-multiple',       '#16A34A', 10),
    ('transfer_in',   'Transfer In',        'تحويل وارد',     'income',  'bank-transfer-in',    '#0D9488', 20),
    ('gift',          'Gift',               'هدية',           'income',  'gift',                '#D946EF', 30),
    ('refund',        'Refund',             'استرداد',        'income',  'cash-refund',         '#10B981', 40),
    ('other_income',  'Other',              'أخرى',           'income',  'dots-horizontal',     '#64748B', 50);
  ```

- [ ] **Step 3: Confirm the seed has exactly 17 category rows split 12/5.**

  ```bash
  grep -cE "^  ?\('" /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/seed.sql
  ```

  Expected: `17`.

- [ ] **Step 4: Apply everything with `supabase db reset`.** This drops the local DB, replays `migrations/0001_init.sql`, then runs `seed.sql`. This is the canonical "apply schema" command.

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && supabase db reset
  ```

  Expected tail:
  ```
  Applying migration 0001_init.sql...
  Seeding data from supabase/seed.sql...
  Finished supabase db reset on branch main.
  ```
  (No error lines.) If migration SQL has an error, the command prints the failing statement — fix `0001_init.sql` and re-run.

- [ ] **Step 5: Verify schema + seed landed correctly** by querying the local DB directly (psql via the DB URL from `supabase status`, port 54322).

  ```bash
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select kind, count(*) from public.categories group by kind order by kind;"
  ```

  Expected output:
  ```
    kind   | count
  ---------+-------
   expense |    12
   income  |     5
  (2 rows)
  ```

  Verify RLS is enabled on the right tables:

  ```bash
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select relname, relrowsecurity from pg_class where relname in ('profiles','transactions','categories') order by relname;"
  ```

  Expected: all three `relrowsecurity = t`.

  Verify the trigger exists:

  ```bash
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select tgname from pg_trigger where tgname = 'on_auth_user_created';"
  ```

  Expected: one row, `on_auth_user_created`.

- [ ] **Step 6: Commit.**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && git add supabase/migrations/0001_init.sql supabase/seed.sql && git commit -m "feat(db): add profile-on-signup trigger and bilingual category seed"
  ```

---

### Task 2.5: Shared types + categories module (TDD)

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/categories.ts`
- Test: `src/lib/__tests__/categories.test.ts`

This is the contract's source-of-truth TypeScript. TDD is **required**: the test pins the slug set and kinds to the contract, guaranteeing `categories.ts` never drifts from `seed.sql`.

- [ ] **Step 1: Write the shared types** at `src/types/index.ts` — verbatim from the locked contract (M2 owns this file; all other milestones import from it).

  ```ts
  // src/types/index.ts — shared domain types (source of truth; do not redefine elsewhere).

  export type TxnType = 'expense' | 'income';
  export type TxnSource = 'voice' | 'text' | 'sms';
  export type TxnStatus = 'pending' | 'confirmed';
  export type CategoryKind = 'expense' | 'income';
  export type Locale = 'ar' | 'en';

  export interface Category {
    slug: string;
    name_en: string;
    name_ar: string;
    kind: CategoryKind;
    icon: string;
    color: string;
    sort_order: number;
  }

  export interface Transaction {
    id: string;
    user_id: string;
    type: TxnType;
    amount: number;
    currency: string;
    category_slug: string;
    note: string | null;
    raw_text: string | null;
    source: TxnSource;
    status: TxnStatus;
    confidence: number | null;
    occurred_at: string;
    created_at: string;
  }

  export interface ParsedTransaction {
    type: TxnType;
    amount: number;
    currency: string;
    category_slug: string;
    note: string;
    confidence: number;
    occurred_at?: string;
  }

  export type NewTransaction = Omit<Transaction, 'id' | 'created_at'>;
  ```

- [ ] **Step 2: Write the failing test** at `src/lib/__tests__/categories.test.ts`. It asserts (a) the exact expense slug set, (b) the exact income slug set, (c) every category's `kind` matches the bucket it came from, (d) helper behavior, (e) `categorySlugs()` returns all 17. This is the guard that keeps `categories.ts` in lockstep with `seed.sql` and the contract.

  ```ts
  // src/lib/__tests__/categories.test.ts
  import {
    CATEGORIES,
    categoryBySlug,
    expenseCategories,
    incomeCategories,
    categorySlugs,
  } from '../categories';

  // The contract's slug sets (source of truth).
  const EXPENSE_SLUGS = [
    'food', 'groceries', 'transport', 'clothes', 'bills', 'health',
    'entertainment', 'education', 'home', 'travel', 'shopping', 'other_expense',
  ];
  const INCOME_SLUGS = [
    'salary', 'transfer_in', 'gift', 'refund', 'other_income',
  ];

  describe('categories source of truth', () => {
    it('has exactly the contract expense slugs', () => {
      expect(new Set(expenseCategories().map((c) => c.slug))).toEqual(
        new Set(EXPENSE_SLUGS),
      );
    });

    it('has exactly the contract income slugs', () => {
      expect(new Set(incomeCategories().map((c) => c.slug))).toEqual(
        new Set(INCOME_SLUGS),
      );
    });

    it('categorySlugs() returns all 17 slugs', () => {
      const slugs = categorySlugs();
      expect(slugs).toHaveLength(17);
      expect(new Set(slugs)).toEqual(
        new Set([...EXPENSE_SLUGS, ...INCOME_SLUGS]),
      );
    });

    it('every expense category has kind "expense"', () => {
      expenseCategories().forEach((c) => expect(c.kind).toBe('expense'));
    });

    it('every income category has kind "income"', () => {
      incomeCategories().forEach((c) => expect(c.kind).toBe('income'));
    });

    it('CATEGORIES has no duplicate slugs', () => {
      const slugs = CATEGORIES.map((c) => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('every category has a non-empty Arabic and English name', () => {
      CATEGORIES.forEach((c) => {
        expect(c.name_en.length).toBeGreaterThan(0);
        expect(c.name_ar.length).toBeGreaterThan(0);
      });
    });

    it('categoryBySlug returns the matching category', () => {
      const c = categoryBySlug('food');
      expect(c).toBeDefined();
      expect(c?.name_en).toBe('Food & Drink');
      expect(c?.kind).toBe('expense');
    });

    it('categoryBySlug returns undefined for an unknown slug', () => {
      expect(categoryBySlug('not_a_real_slug')).toBeUndefined();
    });
  });
  ```

- [ ] **Step 3: Run the test — expect FAIL** (module does not exist yet).

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && npx jest src/lib/__tests__/categories.test.ts
  ```

  Expected: FAIL — `Cannot find module '../categories'` (the implementation file does not exist).

- [ ] **Step 4: Implement `src/lib/categories.ts`** so the rows MIRROR `seed.sql` exactly (same slug/name_en/name_ar/kind/icon/color/sort_order, in the same order). Helpers as per the contract.

  ```ts
  // src/lib/categories.ts — in-app mirror of supabase/seed.sql (kept in sync by tests).
  import type { Category } from '../types';

  export const CATEGORIES: Category[] = [
    // Expense
    { slug: 'food',          name_en: 'Food & Drink',      name_ar: 'طعام وشراب',    kind: 'expense', icon: 'food',            color: '#F97316', sort_order: 10 },
    { slug: 'groceries',     name_en: 'Groceries',         name_ar: 'بقالة',         kind: 'expense', icon: 'cart',            color: '#22C55E', sort_order: 20 },
    { slug: 'transport',     name_en: 'Transport',         name_ar: 'مواصلات',       kind: 'expense', icon: 'car',             color: '#3B82F6', sort_order: 30 },
    { slug: 'clothes',       name_en: 'Clothes',           name_ar: 'ملابس',         kind: 'expense', icon: 'tshirt-crew',     color: '#EC4899', sort_order: 40 },
    { slug: 'bills',         name_en: 'Bills & Utilities', name_ar: 'فواتير ومرافق', kind: 'expense', icon: 'file-document',   color: '#EAB308', sort_order: 50 },
    { slug: 'health',        name_en: 'Health',            name_ar: 'صحة',           kind: 'expense', icon: 'heart-pulse',     color: '#EF4444', sort_order: 60 },
    { slug: 'entertainment', name_en: 'Entertainment',     name_ar: 'ترفيه',         kind: 'expense', icon: 'movie-open',      color: '#A855F7', sort_order: 70 },
    { slug: 'education',     name_en: 'Education',          name_ar: 'تعليم',         kind: 'expense', icon: 'school',          color: '#06B6D4', sort_order: 80 },
    { slug: 'home',          name_en: 'Home',              name_ar: 'منزل',          kind: 'expense', icon: 'home',            color: '#14B8A6', sort_order: 90 },
    { slug: 'travel',        name_en: 'Travel',            name_ar: 'سفر',           kind: 'expense', icon: 'airplane',        color: '#0EA5E9', sort_order: 100 },
    { slug: 'shopping',      name_en: 'Shopping',          name_ar: 'تسوق',          kind: 'expense', icon: 'shopping',        color: '#F43F5E', sort_order: 110 },
    { slug: 'other_expense', name_en: 'Other',             name_ar: 'أخرى',          kind: 'expense', icon: 'dots-horizontal', color: '#94A3B8', sort_order: 120 },
    // Income
    { slug: 'salary',        name_en: 'Salary',            name_ar: 'راتب',          kind: 'income',  icon: 'cash-multiple',   color: '#16A34A', sort_order: 10 },
    { slug: 'transfer_in',   name_en: 'Transfer In',       name_ar: 'تحويل وارد',    kind: 'income',  icon: 'bank-transfer-in', color: '#0D9488', sort_order: 20 },
    { slug: 'gift',          name_en: 'Gift',              name_ar: 'هدية',          kind: 'income',  icon: 'gift',            color: '#D946EF', sort_order: 30 },
    { slug: 'refund',        name_en: 'Refund',            name_ar: 'استرداد',       kind: 'income',  icon: 'cash-refund',     color: '#10B981', sort_order: 40 },
    { slug: 'other_income',  name_en: 'Other',             name_ar: 'أخرى',          kind: 'income',  icon: 'dots-horizontal', color: '#64748B', sort_order: 50 },
  ];

  const BY_SLUG: Record<string, Category> = Object.fromEntries(
    CATEGORIES.map((c) => [c.slug, c]),
  );

  export function categoryBySlug(slug: string): Category | undefined {
    return BY_SLUG[slug];
  }

  export function expenseCategories(): Category[] {
    return CATEGORIES.filter((c) => c.kind === 'expense').sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }

  export function incomeCategories(): Category[] {
    return CATEGORIES.filter((c) => c.kind === 'income').sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }

  export function categorySlugs(): string[] {
    return CATEGORIES.map((c) => c.slug);
  }
  ```

- [ ] **Step 5: Run the test — expect PASS.**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && npx jest src/lib/__tests__/categories.test.ts
  ```

  Expected: PASS — all tests green (9 passing).

- [ ] **Step 6: Cross-check `categories.ts` vs `seed.sql` slug sets match** (belt-and-suspenders, catches a hand-edit drift the unit test can't see because it doesn't read SQL).

  ```bash
  diff <(grep -oE "slug: '[a-z_]+'" /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/src/lib/categories.ts | grep -oE "'[a-z_]+'" | tr -d "'" | sort) <(grep -oE "^  ?\('[a-z_]+'" /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/seed.sql | grep -oE "'[a-z_]+'" | tr -d "'" | sort) && echo "SLUGS MATCH"
  ```

  Expected: `SLUGS MATCH` (no diff output).

- [ ] **Step 7: Commit.**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && git add src/types/index.ts src/lib/categories.ts src/lib/__tests__/categories.test.ts && git commit -m "feat(types): add shared domain types and category source-of-truth module"
  ```

---

### Task 2.6: RLS integration check (document + script)

**Files:**
- Create: `supabase/tests/rls_check.sql`

This is a SQL-based integration check proving data isolation: insert a transaction as user A (via the service role / `postgres` superuser, setting `user_id = A`), then attempt to read it while impersonating anon and user B's JWT claims, and assert zero rows are visible. We use Postgres's `set local role` + `request.jwt.claims` to simulate the `authenticated` role with a specific `auth.uid()`, which is exactly how Supabase's RLS evaluates `auth.uid()` (it reads `current_setting('request.jwt.claims')`).

- [ ] **Step 1: Create `supabase/tests/rls_check.sql`.** It runs entirely in one transaction, creates two fake auth users (A and B), inserts a category-valid transaction for A, then switches to the `authenticated` role impersonating B and asserts B sees nothing, and impersonating anon asserts anon sees nothing. `assert` raises on failure.

  ```sql
  -- supabase/tests/rls_check.sql
  -- Proves transactions RLS isolation: user B and anon cannot read user A's rows.
  -- Run with:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_check.sql
  -- Wrapped in a transaction + rollback so it leaves no residue.

  begin;

  -- Two fake auth users (insert directly as superuser; the on_auth_user_created
  -- trigger will also create their profiles rows).
  insert into auth.users (id, instance_id, aud, role, email)
  values
    ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev'),
    ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev');

  -- Seed one transaction owned by user A (insert as superuser, bypasses RLS).
  insert into public.transactions (user_id, type, amount, category_slug, source, status)
  values ('00000000-0000-0000-0000-00000000000a', 'expense', 50.00, 'food', 'text', 'confirmed');

  -- ---- Impersonate user B (authenticated role + B's JWT claims) ----
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

  do $$
  declare visible int;
  begin
    select count(*) into visible from public.transactions;
    assert visible = 0, format('FAIL: user B can see %s of user A''s transactions (expected 0)', visible);
    raise notice 'PASS: user B sees 0 of user A''s transactions';
  end $$;

  reset role;

  -- ---- Impersonate anon (no JWT) ----
  set local role anon;
  set local request.jwt.claims = '';

  do $$
  declare visible int;
  begin
    select count(*) into visible from public.transactions;
    assert visible = 0, format('FAIL: anon can see %s transactions (expected 0)', visible);
    raise notice 'PASS: anon sees 0 transactions';

    -- anon CAN read categories (read-only reference data).
    select count(*) into visible from public.categories;
    assert visible = 17, format('FAIL: anon sees %s categories (expected 17)', visible);
    raise notice 'PASS: anon can read 17 categories';
  end $$;

  reset role;

  -- ---- Confirm user A still sees their own row ----
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

  do $$
  declare visible int;
  begin
    select count(*) into visible from public.transactions;
    assert visible = 1, format('FAIL: user A sees %s of their own transactions (expected 1)', visible);
    raise notice 'PASS: user A sees their own 1 transaction';
  end $$;

  reset role;

  rollback;  -- leave the DB clean
  ```

- [ ] **Step 2: Run the RLS check against the local DB.** `-v ON_ERROR_STOP=1` makes any failed `assert` abort with a non-zero exit code.

  ```bash
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/tests/rls_check.sql
  ```

  Expected output (NOTICE lines, then ROLLBACK, exit 0):
  ```
  NOTICE:  PASS: user B sees 0 of user A's transactions
  NOTICE:  PASS: anon sees 0 transactions
  NOTICE:  PASS: anon can read 17 categories
  NOTICE:  PASS: user A sees their own 1 transaction
  ROLLBACK
  ```

  If any `assert` fails, psql prints `FAIL: ...` and exits non-zero — that means an RLS policy is wrong; revisit Task 2.3.

- [ ] **Step 3: Document the manual RLS verification in the run instructions.** Add a short note to the repo (e.g. as a comment block already at the top of `rls_check.sql`, which we have). Confirm the file is tracked:

  ```bash
  ls -1 /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/tests/rls_check.sql
  ```

  Expected: the path prints (file exists).

- [ ] **Step 4: Commit.**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && git add supabase/tests/rls_check.sql && git commit -m "test(db): add RLS isolation integration check"
  ```

---

### Task 2.7: Milestone verification

**Files:** none (verification only)

- [ ] **Step 1: Full clean apply from scratch** to prove migration + seed are reproducible.

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && supabase db reset
  ```

  Expected: `Applying migration 0001_init.sql...` → `Seeding data from supabase/seed.sql...` → `Finished supabase db reset` with no errors.

- [ ] **Step 2: Re-run the RLS check post-reset.**

  ```bash
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/tests/rls_check.sql
  ```

  Expected: the four `PASS:` NOTICE lines, then `ROLLBACK`, exit 0.

- [ ] **Step 3: Run the JS unit test once more (clean).**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && npx jest src/lib/__tests__/categories.test.ts
  ```

  Expected: PASS (9 tests).

- [ ] **Step 4: Confirm the trigger creates a profile on signup** (smoke test the trigger end-to-end via the Auth admin API or psql). Quick psql proof: insert a user and check the profile appears.

  ```bash
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "begin; insert into auth.users (id, instance_id, aud, role, email) values ('00000000-0000-0000-0000-0000000000ff','00000000-0000-0000-0000-000000000000','authenticated','authenticated','trig@test.dev'); select id, locale, currency from public.profiles where id = '00000000-0000-0000-0000-0000000000ff'; rollback;"
  ```

  Expected: one profiles row with `locale = en`, `currency = EGP`.

- [ ] **Step 5: Final milestone commit (no-op if clean).**

  ```bash
  cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker && git status --short
  ```

  Expected: clean working tree (all M2 work committed). Milestone 2 complete: local stack running, schema + RLS + trigger applied via `supabase db reset`, bilingual seed loaded, shared `src/types/index.ts` and `src/lib/categories.ts` in place and TDD-locked to the contract, RLS isolation proven.

---

## Milestone 3: Supabase Client, Auth, Navigation Shell, i18n, Settings

This milestone wires the running app to Supabase Auth, adds bilingual string infrastructure (i18n), a session context, an auth redirect gate in the root layout, the email sign-in / sign-up screens, the four-tab navigation shell, a working Settings screen (email, locale toggle, sign out), and placeholder stub screens for Home / Capture / Transactions that M5 and M6 will replace.

**Assumptions (owned by earlier milestones — import, never redefine):**
- M1 produced `package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `jest.config.js` + jest setup, `.env.example`, and a `app/_layout.tsx` ROOT layout that already imports `../global.css`. The `@/*` path alias maps to the repo root (so `@/src/...` and `@/app/...` resolve). `jest-expo` + `@testing-library/react-native` are configured.
- M2 produced `src/types/index.ts` (the shared types) and `src/lib/categories.ts`.
- The Supabase env vars `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are documented in `.env.example` (M1) and present in a local `.env`.

If `tsconfig.json` does not yet alias `@/*` to the repo root, Task 3.0 verifies and fixes it before anything else.

---

### Task 3.0: Install Milestone-3 runtime deps & confirm path alias

**Files:**
- Modify: `package.json` (via `npx expo install`)
- Modify: `tsconfig.json` (only if the `@/*` alias is missing)
- Test: none (verification task)

- [ ] **Step 1: Install Supabase + AsyncStorage at SDK-54-compatible versions.**
  Run from the repo root:
  ```bash
  npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
  ```
  Expected: both packages added to `package.json` `dependencies`; Expo prints the resolved versions and no peer-dependency errors.

- [ ] **Step 2: Confirm the `@/*` path alias resolves to the repo root.**
  Read `tsconfig.json`. It MUST contain (inside `compilerOptions`):
  ```json
  "baseUrl": ".",
  "paths": { "@/*": ["./*"] }
  ```
  If `paths` is missing or points elsewhere, edit `tsconfig.json` so that `@/src/types` resolves to `src/types/index.ts` and `@/src/lib/supabase` resolves to `src/lib/supabase.ts`. Do not change any other compiler option.

- [ ] **Step 3: Verify imports type-check.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: exits 0 (no errors). M2's `src/types/index.ts` and `src/lib/categories.ts` already compile; this just confirms the alias works.

- [ ] **Step 4: Commit.**
  ```bash
  git add package.json package-lock.json tsconfig.json
  git commit -m "chore(m3): add supabase-js + async-storage; confirm @/* path alias"
  ```

---

### Task 3.1: i18n strings, `t()`, and `isRTL()` (TDD — REQUIRED)

**Files:**
- Create: `src/lib/i18n.ts`
- Test: `src/lib/__tests__/i18n.test.ts`

- [ ] **Step 1: Write the failing test.**
  Create `src/lib/__tests__/i18n.test.ts`:
  ```ts
  import { t, isRTL, STRINGS } from '@/src/lib/i18n';

  describe('isRTL', () => {
    it('is true for Arabic', () => {
      expect(isRTL('ar')).toBe(true);
    });
    it('is false for English', () => {
      expect(isRTL('en')).toBe(false);
    });
  });

  describe('t', () => {
    it('returns the English string for a known key', () => {
      expect(t('settings.title', 'en')).toBe('Settings');
    });
    it('returns the Arabic string for a known key', () => {
      expect(t('settings.title', 'ar')).toBe('الإعدادات');
    });
    it('falls back to the key itself when the key is unknown', () => {
      // @ts-expect-error testing runtime fallback for an unknown key
      expect(t('does.not.exist', 'en')).toBe('does.not.exist');
    });
    it('falls back to English when the Arabic value is missing', () => {
      // every STRINGS entry must define both, so assert that invariant here
      for (const key of Object.keys(STRINGS)) {
        expect(typeof STRINGS[key].en).toBe('string');
        expect(typeof STRINGS[key].ar).toBe('string');
        expect(STRINGS[key].en.length).toBeGreaterThan(0);
        expect(STRINGS[key].ar.length).toBeGreaterThan(0);
      }
    });
  });
  ```

- [ ] **Step 2: Run the test — Expected: FAIL (module not found).**
  ```bash
  npx jest src/lib/__tests__/i18n.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/src/lib/i18n'`.

- [ ] **Step 3: Implement `src/lib/i18n.ts`.**
  ```ts
  import type { Locale } from '@/src/types';

  /**
   * Bilingual UI strings. Every entry MUST define both `en` and `ar`.
   * Keys are dotted namespaces; resolve with `t(key, locale)`.
   */
  export const STRINGS: Record<string, { en: string; ar: string }> = {
    // Auth
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

    // Tabs
    'tabs.home': { en: 'Home', ar: 'الرئيسية' },
    'tabs.capture': { en: 'Add', ar: 'إضافة' },
    'tabs.transactions': { en: 'List', ar: 'القائمة' },
    'tabs.settings': { en: 'Settings', ar: 'الإعدادات' },

    // Settings
    'settings.title': { en: 'Settings', ar: 'الإعدادات' },
    'settings.account': { en: 'Account', ar: 'الحساب' },
    'settings.language': { en: 'Language', ar: 'اللغة' },
    'settings.langEnglish': { en: 'English', ar: 'الإنجليزية' },
    'settings.langArabic': { en: 'Arabic', ar: 'العربية' },
    'settings.signOut': { en: 'Sign out', ar: 'تسجيل الخروج' },

    // Stub placeholders (replaced by M5/M6)
    'home.placeholder': { en: 'Dashboard coming soon', ar: 'لوحة المعلومات قريباً' },
    'capture.placeholder': { en: 'Capture coming soon', ar: 'الإضافة قريباً' },
    'transactions.placeholder': { en: 'Transactions coming soon', ar: 'المعاملات قريباً' },

    // Generic
    'common.loading': { en: 'Loading…', ar: 'جارٍ التحميل…' },
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
  ```

- [ ] **Step 4: Run the test — Expected: PASS.**
  ```bash
  npx jest src/lib/__tests__/i18n.test.ts
  ```
  Expected: PASS — all assertions green.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/lib/i18n.ts src/lib/__tests__/i18n.test.ts
  git commit -m "feat(m3): add i18n STRINGS, t(), isRTL() with tests"
  ```

---

### Task 3.2: Supabase client (`src/lib/supabase.ts`)

**Files:**
- Create: `src/lib/supabase.ts`
- Test: none (thin integration glue; covered indirectly by Task 3.4's mock)

- [ ] **Step 1: Implement `src/lib/supabase.ts`.**
  Exactly the locked-contract config: `AsyncStorage` storage, `autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`, plus the `AppState` autoRefresh start/stop wiring.
  ```ts
  import 'react-native-url-polyfill/auto';
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import { createClient } from '@supabase/supabase-js';
  import { AppState } from 'react-native';

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env and fill in your Supabase values. ' +
        'A physical iPhone must use the Mac LAN IP, not localhost.',
    );
  }

  export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // Tells Supabase Auth to continuously refresh the session automatically while
  // the app is in the foreground, and to stop when backgrounded.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
  ```
  Note: `react-native-url-polyfill` ships transitively with `@supabase/supabase-js` for React Native; if `npx tsc` reports it missing, run `npx expo install react-native-url-polyfill` and re-run.

- [ ] **Step 2: Type-check.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: exits 0.

- [ ] **Step 3: Smoke-import in Node to confirm the env guard works.**
  ```bash
  EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=test \
    node -e "require('ts-node/register'); console.log('client module loads')" 2>/dev/null || echo "ts-node optional; tsc check above is authoritative"
  ```
  Expected: either prints `client module loads` or the optional-ts-node fallback line. The authoritative check is `tsc` in Step 2.

- [ ] **Step 4: Commit.**
  ```bash
  git add src/lib/supabase.ts
  git commit -m "feat(m3): add supabase client with AsyncStorage + AppState autoRefresh"
  ```

---

### Task 3.3: Pure auth-state mapper `redirectTarget` (TDD — REQUIRED)

A tiny pure function the redirect gate uses, isolated so it can be unit-tested without rendering navigation.

**Files:**
- Create: `src/features/auth/redirectTarget.ts`
- Test: `src/features/auth/__tests__/redirectTarget.test.ts`

- [ ] **Step 1: Write the failing test.**
  Create `src/features/auth/__tests__/redirectTarget.test.ts`:
  ```ts
  import { redirectTarget } from '@/src/features/auth/redirectTarget';

  describe('redirectTarget', () => {
    it('returns null while loading (no decision yet)', () => {
      expect(redirectTarget({ loading: true, hasSession: false, inAuthGroup: false })).toBeNull();
      expect(redirectTarget({ loading: true, hasSession: true, inAuthGroup: true })).toBeNull();
    });

    it('sends an unauthenticated user out of a protected group to sign-in', () => {
      expect(
        redirectTarget({ loading: false, hasSession: false, inAuthGroup: false }),
      ).toBe('/(auth)/sign-in');
    });

    it('leaves an unauthenticated user already in the auth group alone', () => {
      expect(
        redirectTarget({ loading: false, hasSession: false, inAuthGroup: true }),
      ).toBeNull();
    });

    it('sends an authenticated user sitting on an auth screen into the tabs', () => {
      expect(
        redirectTarget({ loading: false, hasSession: true, inAuthGroup: true }),
      ).toBe('/(tabs)');
    });

    it('leaves an authenticated user already inside the app alone', () => {
      expect(
        redirectTarget({ loading: false, hasSession: true, inAuthGroup: false }),
      ).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run the test — Expected: FAIL (module not found).**
  ```bash
  npx jest src/features/auth/__tests__/redirectTarget.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/src/features/auth/redirectTarget'`.

- [ ] **Step 3: Implement `src/features/auth/redirectTarget.ts`.**
  ```ts
  export interface AuthGateState {
    /** Session/profile still resolving — do not redirect yet. */
    loading: boolean;
    /** True when a Supabase session exists. */
    hasSession: boolean;
    /** True when the current route is inside the (auth) route group. */
    inAuthGroup: boolean;
  }

  /**
   * Pure decision function for the auth redirect gate.
   * Returns the href to redirect to, or null to stay put.
   */
  export function redirectTarget(state: AuthGateState): string | null {
    if (state.loading) return null;
    if (!state.hasSession && !state.inAuthGroup) return '/(auth)/sign-in';
    if (state.hasSession && state.inAuthGroup) return '/(tabs)';
    return null;
  }
  ```

- [ ] **Step 4: Run the test — Expected: PASS.**
  ```bash
  npx jest src/features/auth/__tests__/redirectTarget.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/auth/redirectTarget.ts src/features/auth/__tests__/redirectTarget.test.ts
  git commit -m "feat(m3): add pure redirectTarget auth-state mapper with tests"
  ```

---

### Task 3.4: SessionProvider + `useSession()` (TDD — mock supabase)

**Files:**
- Create: `src/features/auth/SessionProvider.tsx`
- Test: `src/features/auth/__tests__/SessionProvider.test.tsx`

- [ ] **Step 1: Write the failing test (mocks `@/src/lib/supabase`).**
  Create `src/features/auth/__tests__/SessionProvider.test.tsx`:
  ```tsx
  import React from 'react';
  import { Text } from 'react-native';
  import { render, screen, waitFor } from '@testing-library/react-native';
  import { SessionProvider, useSession } from '@/src/features/auth/SessionProvider';

  // ---- Mock the supabase client module ----
  const mockGetSession = jest.fn();
  const mockOnAuthStateChange = jest.fn();
  const mockUnsubscribe = jest.fn();
  const mockProfileMaybeSingle = jest.fn();

  jest.mock('@/src/lib/supabase', () => ({
    supabase: {
      auth: {
        getSession: (...args: unknown[]) => mockGetSession(...args),
        onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: (...args: unknown[]) => mockProfileMaybeSingle(...args),
          }),
        }),
      }),
    },
  }));

  function Probe() {
    const { loading, user, profile, session } = useSession();
    return (
      <>
        <Text testID="loading">{String(loading)}</Text>
        <Text testID="email">{user?.email ?? 'none'}</Text>
        <Text testID="locale">{profile?.locale ?? 'none'}</Text>
        <Text testID="hasSession">{String(!!session)}</Text>
      </>
    );
  }

  const fakeSession = {
    user: { id: 'user-1', email: 'a@b.com' },
    access_token: 'tok',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  it('starts loading then resolves to no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    expect(screen.getByTestID('loading').props.children).toBe('true');

    await waitFor(() => {
      expect(screen.getByTestID('loading').props.children).toBe('false');
    });
    expect(screen.getByTestID('email').props.children).toBe('none');
    expect(screen.getByTestID('hasSession').props.children).toBe('false');
  });

  it('loads the session user and the profile row', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession }, error: null });
    mockProfileMaybeSingle.mockResolvedValue({
      data: { id: 'user-1', display_name: 'A', locale: 'ar', currency: 'EGP' },
      error: null,
    });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestID('loading').props.children).toBe('false');
    });
    expect(screen.getByTestID('email').props.children).toBe('a@b.com');
    expect(screen.getByTestID('locale').props.children).toBe('ar');
    expect(screen.getByTestID('hasSession').props.children).toBe('true');
  });

  it('subscribes to auth changes and unsubscribes on unmount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    const { unmount } = render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalled());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
  ```
  Note: `getByTestID` above is intentionally the RNTL accessor `getByTestId`; if your RNTL version exposes it as `getByTestId`, rename accordingly. (RNTL exports `getByTestId`.) Use `getByTestId` if the test runner reports `getByTestID is not a function`.

- [ ] **Step 2: Run the test — Expected: FAIL (module not found).**
  ```bash
  npx jest src/features/auth/__tests__/SessionProvider.test.tsx
  ```
  Expected: FAIL — `Cannot find module '@/src/features/auth/SessionProvider'`.

- [ ] **Step 3: Implement `src/features/auth/SessionProvider.tsx`.**
  ```tsx
  import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
  } from 'react';
  import type { Session, User } from '@supabase/supabase-js';
  import { supabase } from '@/src/lib/supabase';

  export interface Profile {
    id: string;
    display_name: string | null;
    locale: 'ar' | 'en';
    currency: string;
  }

  export interface SessionContextValue {
    session: Session | null;
    user: User | null;
    profile: Profile | null;
    loading: boolean;
  }

  const SessionContext = createContext<SessionContextValue>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  });

  async function fetchProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, locale, currency')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      // Profile may not exist yet right after sign-up (trigger lag); fail soft.
      return null;
    }
    return (data as Profile) ?? null;
  }

  export function SessionProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let active = true;

      async function applySession(next: Session | null) {
        if (!active) return;
        setSession(next);
        if (next?.user) {
          const p = await fetchProfile(next.user.id);
          if (active) setProfile(p);
        } else if (active) {
          setProfile(null);
        }
        if (active) setLoading(false);
      }

      // Initial load.
      supabase.auth.getSession().then(({ data }) => {
        void applySession(data.session ?? null);
      });

      // React to future auth events (sign-in, sign-out, token refresh).
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        void applySession(nextSession);
      });

      return () => {
        active = false;
        subscription.unsubscribe();
      };
    }, []);

    const value = useMemo<SessionContextValue>(
      () => ({
        session,
        user: session?.user ?? null,
        profile,
        loading,
      }),
      [session, profile, loading],
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
  }

  export function useSession(): SessionContextValue {
    return useContext(SessionContext);
  }
  ```

- [ ] **Step 4: Run the test — Expected: PASS.**
  ```bash
  npx jest src/features/auth/__tests__/SessionProvider.test.tsx
  ```
  Expected: PASS. (If RNTL reports `getByTestID is not a function`, replace the three `getByTestID` calls in the test with `getByTestId` and re-run.)

- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/auth/SessionProvider.tsx src/features/auth/__tests__/SessionProvider.test.tsx
  git commit -m "feat(m3): add SessionProvider + useSession (loads profile, mocked test)"
  ```

---

### Task 3.5: Root layout auth gate (extends M1's `app/_layout.tsx`)

**Files:**
- Modify: `app/_layout.tsx`
- Test: none directly (the decision logic is covered by Task 3.3's `redirectTarget` test)

- [ ] **Step 1: Read the current `app/_layout.tsx`.**
  It should currently import `../global.css` and render a `<Stack />` (M1). Confirm the `import '../global.css';` line exists; keep it.

- [ ] **Step 2: Replace `app/_layout.tsx` with the SessionProvider-wrapped gated layout.**
  ```tsx
  import '../global.css';
  import { useEffect } from 'react';
  import { Stack, useRouter, useSegments } from 'expo-router';
  import { ActivityIndicator, View } from 'react-native';
  import { SessionProvider, useSession } from '@/src/features/auth/SessionProvider';
  import { redirectTarget } from '@/src/features/auth/redirectTarget';

  function RootNavigator() {
    const { session, loading } = useSession();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
      const inAuthGroup = segments[0] === '(auth)';
      const target = redirectTarget({
        loading,
        hasSession: !!session,
        inAuthGroup,
      });
      if (target) router.replace(target as never);
    }, [loading, session, segments, router]);

    if (loading) {
      return (
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator />
        </View>
      );
    }

    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    );
  }

  export default function RootLayout() {
    return (
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    );
  }
  ```

- [ ] **Step 3: Type-check.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: exits 0. (The `(auth)` and `(tabs)` group files are created in later tasks; if `tsc` flags the unresolved screen names, that is fine for typecheck — it only resolves once those files exist. Re-run after Task 3.8.)

- [ ] **Step 4: Commit.**
  ```bash
  git add app/_layout.tsx
  git commit -m "feat(m3): wrap root layout in SessionProvider + redirect gate"
  ```

---

### Task 3.6: Auth screens — sign-in & sign-up

**Files:**
- Create: `app/(auth)/_layout.tsx`
- Create: `app/(auth)/sign-in.tsx`
- Create: `app/(auth)/sign-up.tsx`
- Test: none (UI; auth calls are integration-tested manually against local Supabase)

- [ ] **Step 1: Create the auth group layout `app/(auth)/_layout.tsx`.**
  ```tsx
  import { Stack } from 'expo-router';

  export default function AuthLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
  }
  ```

- [ ] **Step 2: Create `app/(auth)/sign-in.tsx`.**
  ```tsx
  import { useState } from 'react';
  import {
    ActivityIndicator,
    Text,
    TextInput,
    TouchableOpacity,
    View,
  } from 'react-native';
  import { Link } from 'expo-router';
  import { supabase } from '@/src/lib/supabase';
  import { t } from '@/src/lib/i18n';
  import { useSession } from '@/src/features/auth/SessionProvider';

  export default function SignIn() {
    const { profile } = useSession();
    const locale = profile?.locale ?? 'en';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit() {
      setError(null);
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setError(error.message || t('auth.genericError', locale));
      // On success, onAuthStateChange fires and the root gate redirects to (tabs).
    }

    return (
      <View className="flex-1 justify-center px-6 bg-white">
        <Text className="text-3xl font-bold mb-8 text-gray-900">
          {t('auth.signIn.title', locale)}
        </Text>

        <Text className="text-sm text-gray-600 mb-1">{t('auth.email', locale)}</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base text-gray-900"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="email-input"
        />

        <Text className="text-sm text-gray-600 mb-1">{t('auth.password', locale)}</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base text-gray-900"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          testID="password-input"
        />

        {error ? (
          <Text className="text-red-600 mb-4" testID="error-text">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className="bg-blue-600 rounded-lg py-3 items-center mb-4"
          disabled={busy}
          onPress={onSubmit}
          testID="submit-button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">
              {t('auth.signInButton', locale)}
            </Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/sign-up" className="text-blue-600 text-center">
          {t('auth.toSignUp', locale)}
        </Link>
      </View>
    );
  }
  ```

- [ ] **Step 3: Create `app/(auth)/sign-up.tsx`.**
  ```tsx
  import { useState } from 'react';
  import {
    ActivityIndicator,
    Text,
    TextInput,
    TouchableOpacity,
    View,
  } from 'react-native';
  import { Link } from 'expo-router';
  import { supabase } from '@/src/lib/supabase';
  import { t } from '@/src/lib/i18n';
  import { useSession } from '@/src/features/auth/SessionProvider';

  export default function SignUp() {
    const { profile } = useSession();
    const locale = profile?.locale ?? 'en';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit() {
      setError(null);
      setInfo(null);
      setBusy(true);
      const { data, error } = await supabase.auth.signUp({ email, password });
      setBusy(false);
      if (error) {
        setError(error.message || t('auth.genericError', locale));
        return;
      }
      // If email confirmation is required, there is no session yet.
      if (!data.session) setInfo(t('auth.checkEmail', locale));
      // If confirmation is disabled (local dev), onAuthStateChange redirects to (tabs).
    }

    return (
      <View className="flex-1 justify-center px-6 bg-white">
        <Text className="text-3xl font-bold mb-8 text-gray-900">
          {t('auth.signUp.title', locale)}
        </Text>

        <Text className="text-sm text-gray-600 mb-1">{t('auth.email', locale)}</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base text-gray-900"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          testID="email-input"
        />

        <Text className="text-sm text-gray-600 mb-1">{t('auth.password', locale)}</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base text-gray-900"
          secureTextEntry
          autoComplete="password-new"
          value={password}
          onChangeText={setPassword}
          testID="password-input"
        />

        {error ? (
          <Text className="text-red-600 mb-4" testID="error-text">
            {error}
          </Text>
        ) : null}
        {info ? (
          <Text className="text-green-700 mb-4" testID="info-text">
            {info}
          </Text>
        ) : null}

        <TouchableOpacity
          className="bg-blue-600 rounded-lg py-3 items-center mb-4"
          disabled={busy}
          onPress={onSubmit}
          testID="submit-button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">
              {t('auth.signUpButton', locale)}
            </Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/sign-in" className="text-blue-600 text-center">
          {t('auth.toSignIn', locale)}
        </Link>
      </View>
    );
  }
  ```

- [ ] **Step 4: Type-check.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: exits 0.

- [ ] **Step 5: Commit.**
  ```bash
  git add "app/(auth)/_layout.tsx" "app/(auth)/sign-in.tsx" "app/(auth)/sign-up.tsx"
  git commit -m "feat(m3): add email sign-in / sign-up screens (NativeWind)"
  ```

---

### Task 3.7: Tabs navigation shell + stub screens

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx` (stub — M6 replaces)
- Create: `app/(tabs)/capture.tsx` (stub — M5 replaces)
- Create: `app/(tabs)/transactions.tsx` (stub — M6 replaces)
- Test: none (stubs)

- [ ] **Step 1: Confirm `@expo/vector-icons` is available (ships with Expo SDK 54).**
  ```bash
  node -e "require.resolve('@expo/vector-icons'); console.log('icons ok')"
  ```
  Expected: prints `icons ok`. If it errors, run `npx expo install @expo/vector-icons`.

- [ ] **Step 2: Create `app/(tabs)/_layout.tsx`.**
  ```tsx
  import { Tabs } from 'expo-router';
  import { Ionicons } from '@expo/vector-icons';
  import { t } from '@/src/lib/i18n';
  import { useSession } from '@/src/features/auth/SessionProvider';

  export default function TabsLayout() {
    const { profile } = useSession();
    const locale = profile?.locale ?? 'en';

    return (
      <Tabs screenOptions={{ tabBarActiveTintColor: '#2563eb', headerShown: true }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home', locale),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="capture"
          options={{
            title: t('tabs.capture', locale),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="add-circle-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: t('tabs.transactions', locale),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('tabs.settings', locale),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    );
  }
  ```

- [ ] **Step 3: Create stub `app/(tabs)/index.tsx` (Home — replaced by M6).**
  ```tsx
  import { Text, View } from 'react-native';
  import { t } from '@/src/lib/i18n';
  import { useSession } from '@/src/features/auth/SessionProvider';

  // STUB: Milestone 6 replaces this with the Dashboard.
  export default function Home() {
    const { profile } = useSession();
    const locale = profile?.locale ?? 'en';
    return (
      <View className="flex-1 items-center justify-center bg-white" testID="home-stub">
        <Text className="text-gray-500">{t('home.placeholder', locale)}</Text>
      </View>
    );
  }
  ```

- [ ] **Step 4: Create stub `app/(tabs)/capture.tsx` (Capture — replaced by M5).**
  ```tsx
  import { Text, View } from 'react-native';
  import { t } from '@/src/lib/i18n';
  import { useSession } from '@/src/features/auth/SessionProvider';

  // STUB: Milestone 5 replaces this with the voice/text capture + ConfirmSheet.
  export default function Capture() {
    const { profile } = useSession();
    const locale = profile?.locale ?? 'en';
    return (
      <View className="flex-1 items-center justify-center bg-white" testID="capture-stub">
        <Text className="text-gray-500">{t('capture.placeholder', locale)}</Text>
      </View>
    );
  }
  ```

- [ ] **Step 5: Create stub `app/(tabs)/transactions.tsx` (List — replaced by M6).**
  ```tsx
  import { Text, View } from 'react-native';
  import { t } from '@/src/lib/i18n';
  import { useSession } from '@/src/features/auth/SessionProvider';

  // STUB: Milestone 6 replaces this with the filterable transactions list.
  export default function Transactions() {
    const { profile } = useSession();
    const locale = profile?.locale ?? 'en';
    return (
      <View
        className="flex-1 items-center justify-center bg-white"
        testID="transactions-stub"
      >
        <Text className="text-gray-500">{t('transactions.placeholder', locale)}</Text>
      </View>
    );
  }
  ```

- [ ] **Step 6: Type-check.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: exits 0. The root layout's `(auth)` / `(tabs)` screen names now resolve.

- [ ] **Step 7: Commit.**
  ```bash
  git add "app/(tabs)/_layout.tsx" "app/(tabs)/index.tsx" "app/(tabs)/capture.tsx" "app/(tabs)/transactions.tsx"
  git commit -m "feat(m3): add four-tab navigation shell + M5/M6 stub screens"
  ```

---

### Task 3.8: Settings screen (email, locale toggle, sign out)

**Files:**
- Create: `app/(tabs)/settings.tsx`
- Test: none directly (locale-update + sign-out are integration-tested manually; the pure i18n is covered by Task 3.1)

- [ ] **Step 1: Create `app/(tabs)/settings.tsx`.**
  Shows the signed-in email, an `ar`/`en` toggle that writes `profiles.locale` and applies `I18nManager` RTL, and a sign-out button.
  ```tsx
  import { useState } from 'react';
  import { I18nManager, Text, TouchableOpacity, View } from 'react-native';
  import type { Locale } from '@/src/types';
  import { supabase } from '@/src/lib/supabase';
  import { t, isRTL } from '@/src/lib/i18n';
  import { useSession } from '@/src/features/auth/SessionProvider';

  export default function Settings() {
    const { user, profile } = useSession();
    const locale: Locale = profile?.locale ?? 'en';
    const [busy, setBusy] = useState(false);

    async function setLocale(next: Locale) {
      if (!user || next === locale) return;
      setBusy(true);
      // Persist on the profile row (RLS restricts to the current user).
      await supabase.from('profiles').update({ locale: next }).eq('id', user.id);
      // Apply RTL direction; takes full effect after the next reload.
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(isRTL(next));
      setBusy(false);
      // SessionProvider will pick up the new locale on the next auth/profile refresh;
      // for an immediate switch, M6 can add a profile-refetch helper. The toggle UI
      // below still reflects the chosen value optimistically via `selected`.
    }

    async function onSignOut() {
      setBusy(true);
      await supabase.auth.signOut();
      // onAuthStateChange fires SIGNED_OUT -> root gate redirects to (auth)/sign-in.
      setBusy(false);
    }

    const selected = locale;

    return (
      <View className="flex-1 bg-white px-6 pt-6">
        <Text className="text-2xl font-bold text-gray-900 mb-6">
          {t('settings.title', locale)}
        </Text>

        <Text className="text-sm uppercase text-gray-400 mb-1">
          {t('settings.account', locale)}
        </Text>
        <Text className="text-base text-gray-900 mb-6" testID="settings-email">
          {user?.email ?? '—'}
        </Text>

        <Text className="text-sm uppercase text-gray-400 mb-2">
          {t('settings.language', locale)}
        </Text>
        <View className="flex-row gap-3 mb-8">
          <TouchableOpacity
            disabled={busy}
            onPress={() => setLocale('en')}
            className={
              selected === 'en'
                ? 'flex-1 items-center py-3 rounded-lg bg-blue-600'
                : 'flex-1 items-center py-3 rounded-lg bg-gray-100'
            }
            testID="locale-en"
          >
            <Text className={selected === 'en' ? 'text-white font-semibold' : 'text-gray-800'}>
              {t('settings.langEnglish', locale)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={busy}
            onPress={() => setLocale('ar')}
            className={
              selected === 'ar'
                ? 'flex-1 items-center py-3 rounded-lg bg-blue-600'
                : 'flex-1 items-center py-3 rounded-lg bg-gray-100'
            }
            testID="locale-ar"
          >
            <Text className={selected === 'ar' ? 'text-white font-semibold' : 'text-gray-800'}>
              {t('settings.langArabic', locale)}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          disabled={busy}
          onPress={onSignOut}
          className="border border-red-500 rounded-lg py-3 items-center"
          testID="sign-out"
        >
          <Text className="text-red-600 font-semibold">{t('settings.signOut', locale)}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  ```

- [ ] **Step 2: Type-check.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: exits 0.

- [ ] **Step 3: Commit.**
  ```bash
  git add "app/(tabs)/settings.tsx"
  git commit -m "feat(m3): add settings screen (email, locale toggle, sign out)"
  ```

---

### Task 3.9: Full milestone verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite.**
  ```bash
  npx jest
  ```
  Expected: PASS — all M1/M2 tests plus the new `i18n`, `redirectTarget`, and `SessionProvider` suites green.

- [ ] **Step 2: Type-check the whole project.**
  ```bash
  npx tsc --noEmit
  ```
  Expected: exits 0.

- [ ] **Step 3: Lint (if M1 configured a lint script).**
  ```bash
  npx expo lint || echo "no lint script configured; skipping"
  ```
  Expected: clean, or the skip line.

- [ ] **Step 4: Manual smoke (dev build, requires local Supabase running from M2).**
  Start the local stack (`supabase start`) and the dev build (`npx expo run:ios`). Verify:
  - Launching while signed out lands on `/(auth)/sign-in`.
  - Sign up (local email confirmation disabled) → lands on `/(tabs)` Home stub.
  - All four tabs render their stub/Settings screens.
  - Settings shows the email; toggling `العربية` writes `profiles.locale`; Sign out returns to sign-in.
  This is a manual gate; do not block the commit on it in CI.

- [ ] **Step 5: Final commit (if anything changed during verification).**
  ```bash
  git add -A
  git commit -m "chore(m3): verification pass for auth/nav/i18n shell" || echo "nothing to commit"
  ```

---

## Milestone 4: categorize Edge Function (Claude Haiku, strict tool-use)

This milestone builds the `categorize` Supabase Edge Function (Deno) that turns a natural-language utterance ("spent 50 EGP on coffee" / "اشتريت قهوة بـ ٥٠ جنيه") into a structured `ParsedTransaction` using Claude `claude-haiku-4-5` with a single **strict tool** `record_transaction`. The function is `verify_jwt = true` (called by authenticated app users via `supabase.functions.invoke('categorize')` in M5).

**Design for testability (critical):** `categorize()` accepts an optional injected message-creator (`createMessage`). The default is the real Anthropic SDK (`npm:@anthropic-ai/sdk@0.69.0`), but Deno tests pass a stub returning a known `tool_use` block, so tests **never** hit the network or need a real API key.

**Prerequisites / assumptions:**
- M2 has run `supabase init`, producing `supabase/config.toml` (this milestone only *appends* a `[functions.categorize]` block to it).
- M2 owns `src/types/index.ts` (`ParsedTransaction`, `Locale`, `TxnType`) and `src/lib/categories.ts`. The Edge Function lives in Deno and does **not** import from `src/`; it has its own `_shared/categories.ts` whose slug list MUST stay byte-for-byte in sync with `src/lib/categories.ts` and `supabase/seed.sql` (a comment in each file states this).
- Deno is installed locally (verified: `deno 2.7.x`). The Supabase CLI is installed (M1/M2).

**Slug source of truth (17 slugs, exact):**
expense: `food, groceries, transport, clothes, bills, health, entertainment, education, home, travel, shopping, other_expense`
income: `salary, transfer_in, gift, refund, other_income`

---

### Task 4.1: `_shared` helpers — categories enum + CORS

**Files:**
- Create: `supabase/functions/_shared/categories.ts`
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/deno.json`
- Test: `supabase/functions/tests/shared_test.ts`

- [ ] **Step 1: Create the Deno config so tests/functions resolve `jsr:@std` and format consistently.**

  Create `supabase/functions/deno.json`:

  ```json
  {
    "imports": {
      "@std/assert": "jsr:@std/assert@1"
    },
    "fmt": {
      "lineWidth": 100,
      "semiColons": true,
      "singleQuote": false
    },
    "lint": {
      "rules": {
        "tags": ["recommended"]
      }
    }
  }
  ```

- [ ] **Step 2: Write the failing test for the shared category enum first (TDD — pure data).**

  Create `supabase/functions/tests/shared_test.ts`:

  ```ts
  import { assert, assertEquals } from "@std/assert";
  import { CATEGORY_SLUGS } from "../_shared/categories.ts";
  import { corsHeaders } from "../_shared/cors.ts";

  Deno.test("CATEGORY_SLUGS contains exactly the 17 source-of-truth slugs", () => {
    const expected = [
      // expense (12)
      "food",
      "groceries",
      "transport",
      "clothes",
      "bills",
      "health",
      "entertainment",
      "education",
      "home",
      "travel",
      "shopping",
      "other_expense",
      // income (5)
      "salary",
      "transfer_in",
      "gift",
      "refund",
      "other_income",
    ];
    assertEquals(CATEGORY_SLUGS.length, 17);
    assertEquals([...CATEGORY_SLUGS].sort(), [...expected].sort());
  });

  Deno.test("CATEGORY_SLUGS has no duplicates", () => {
    assertEquals(new Set(CATEGORY_SLUGS).size, CATEGORY_SLUGS.length);
  });

  Deno.test("corsHeaders allows the headers functions.invoke sends", () => {
    assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
    const allowed = corsHeaders["Access-Control-Allow-Headers"].toLowerCase();
    assert(allowed.includes("authorization"));
    assert(allowed.includes("apikey"));
    assert(allowed.includes("x-client-info"));
    assert(allowed.includes("content-type"));
  });
  ```

- [ ] **Step 3: Run the test — Expected: FAIL (modules do not exist yet).**

  ```bash
  deno test --allow-none supabase/functions/tests/shared_test.ts
  ```

  Expected output (abridged):
  ```
  error: Module not found "file:///.../supabase/functions/_shared/categories.ts".
  ```
  (FAIL — the `_shared` modules are not created yet.)

- [ ] **Step 4: Create `supabase/functions/_shared/categories.ts` (minimal impl to pass).**

  ```ts
  // Edge-Function copy of the category slugs.
  // SOURCE OF TRUTH: this list MUST stay byte-for-byte identical (same slugs, same
  // grouping) to BOTH:
  //   - src/lib/categories.ts        (CATEGORIES[].slug, owned by M2)
  //   - supabase/seed.sql            (categories rows, owned by M2)
  // If you add/rename/remove a category, update all three in the same commit.

  /** Expense category slugs (12). */
  export const EXPENSE_SLUGS = [
    "food",
    "groceries",
    "transport",
    "clothes",
    "bills",
    "health",
    "entertainment",
    "education",
    "home",
    "travel",
    "shopping",
    "other_expense",
  ] as const;

  /** Income category slugs (5). */
  export const INCOME_SLUGS = [
    "salary",
    "transfer_in",
    "gift",
    "refund",
    "other_income",
  ] as const;

  /** All 17 valid category slugs, used as the strict-tool `category_slug` enum. */
  export const CATEGORY_SLUGS: string[] = [...EXPENSE_SLUGS, ...INCOME_SLUGS];

  /** Fallback slug for an unrecognised / missing expense category. */
  export const FALLBACK_EXPENSE_SLUG = "other_expense";

  /** Fallback slug for an unrecognised / missing income category. */
  export const FALLBACK_INCOME_SLUG = "other_income";
  ```

- [ ] **Step 5: Create `supabase/functions/_shared/cors.ts`.**

  ```ts
  // CORS headers shared by all Edge Functions in this project.
  // Includes every header that supabase-js `functions.invoke` attaches so that the
  // browser/native preflight (OPTIONS) succeeds.
  export const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  ```

- [ ] **Step 6: Run the test — Expected: PASS.**

  ```bash
  deno test --allow-none supabase/functions/tests/shared_test.ts
  ```

  Expected output (abridged):
  ```
  running 3 tests from ./supabase/functions/tests/shared_test.ts
  CATEGORY_SLUGS contains exactly the 17 source-of-truth slugs ... ok
  CATEGORY_SLUGS has no duplicates ... ok
  corsHeaders allows the headers functions.invoke sends ... ok

  ok | 3 passed | 0 failed
  ```

- [ ] **Step 7: Commit.**

  ```bash
  git add supabase/functions/_shared/categories.ts supabase/functions/_shared/cors.ts supabase/functions/deno.json supabase/functions/tests/shared_test.ts
  git commit -m "feat(edge): add shared category-slug enum and CORS headers for edge functions"
  ```

---

### Task 4.2: `categorize()` core — strict tool-use, injectable transport

**Files:**
- Create: `supabase/functions/_shared/categorize.ts`
- Test: `supabase/functions/tests/categorize_test.ts`

This is the pure logic core. TDD is **required**. The function builds the Anthropic request and maps `tool_use.input` → `ParsedTransaction`. A `CreateMessage` function is injected so tests supply a fake response.

- [ ] **Step 1: Write the failing test FIRST. It injects a fake `createMessage`, so no network and no API key.**

  Create `supabase/functions/tests/categorize_test.ts`:

  ```ts
  import { assert, assertEquals } from "@std/assert";
  import {
    type AnthropicMessageResponse,
    categorize,
    type CreateMessage,
  } from "../_shared/categorize.ts";

  // Build a fake Anthropic Messages response whose only content block is a
  // tool_use for `record_transaction` with the given input object.
  function fakeToolUse(
    input: Record<string, unknown>,
  ): AnthropicMessageResponse {
    return {
      id: "msg_test",
      type: "message",
      role: "assistant",
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_test",
          name: "record_transaction",
          input,
        },
      ],
    };
  }

  // A spy createMessage that records the request body and returns a canned response.
  function stub(
    response: AnthropicMessageResponse,
  ): { create: CreateMessage; calls: unknown[] } {
    const calls: unknown[] = [];
    const create: CreateMessage = (body) => {
      calls.push(body);
      return Promise.resolve(response);
    };
    return { create, calls };
  }

  Deno.test("maps a well-formed English tool_use to ParsedTransaction", async () => {
    const { create, calls } = stub(
      fakeToolUse({
        type: "expense",
        amount: 50,
        currency: "EGP",
        category_slug: "food",
        note: "coffee",
        confidence: 0.94,
      }),
    );

    const parsed = await categorize("spent 50 EGP on coffee", "en", "fake-key", {
      createMessage: create,
    });

    assertEquals(parsed, {
      type: "expense",
      amount: 50,
      currency: "EGP",
      category_slug: "food",
      note: "coffee",
      confidence: 0.94,
    });

    // Verify the request we sent Claude: model, max_tokens, forced single tool.
    const body = calls[0] as Record<string, unknown>;
    assertEquals(body.model, "claude-haiku-4-5");
    assertEquals(body.max_tokens, 256);
    assertEquals(body.tool_choice, {
      type: "tool",
      name: "record_transaction",
    });
    const tools = body.tools as Array<Record<string, unknown>>;
    assertEquals(tools.length, 1);
    assertEquals(tools[0].name, "record_transaction");
    assertEquals(tools[0].strict, true);
    const schema = tools[0].input_schema as Record<string, unknown>;
    assertEquals(schema.additionalProperties, false);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    // category_slug is an enum of the 17 slugs.
    assertEquals((props.category_slug.enum as string[]).length, 17);
    assert((props.category_slug.enum as string[]).includes("food"));
    assertEquals(props.type.enum, ["expense", "income"]);
  });

  Deno.test("maps an Arabic utterance and passes occurred_at through", async () => {
    const { create } = stub(
      fakeToolUse({
        type: "expense",
        amount: 50,
        currency: "EGP",
        category_slug: "food",
        note: "قهوة",
        confidence: 0.9,
        occurred_at: "2026-06-01T10:00:00.000Z",
      }),
    );

    const parsed = await categorize("اشتريت قهوة بـ ٥٠ جنيه", "ar", "fake-key", {
      createMessage: create,
    });

    assertEquals(parsed.note, "قهوة");
    assertEquals(parsed.category_slug, "food");
    assertEquals(parsed.occurred_at, "2026-06-01T10:00:00.000Z");
  });

  Deno.test("unknown slug falls back to other_expense for an expense", async () => {
    const { create } = stub(
      fakeToolUse({
        type: "expense",
        amount: 30,
        currency: "EGP",
        category_slug: "rocket_fuel", // not in the enum
        note: "mystery",
        confidence: 0.4,
      }),
    );

    const parsed = await categorize("spent 30 on something weird", "en", "k", {
      createMessage: create,
    });

    assertEquals(parsed.category_slug, "other_expense");
  });

  Deno.test("unknown slug falls back to other_income for income", async () => {
    const { create } = stub(
      fakeToolUse({
        type: "income",
        amount: 1000,
        currency: "EGP",
        category_slug: "mystery_money",
        note: "bonus",
        confidence: 0.5,
      }),
    );

    const parsed = await categorize("got 1000", "en", "k", {
      createMessage: create,
    });

    assertEquals(parsed.type, "income");
    assertEquals(parsed.category_slug, "other_income");
  });

  Deno.test("missing/zero amount -> amount 0 and confidence 0", async () => {
    const { create } = stub(
      fakeToolUse({
        type: "expense",
        // no amount field at all
        currency: "EGP",
        category_slug: "food",
        note: "coffee",
        confidence: 0.8,
      }),
    );

    const parsed = await categorize("bought coffee", "en", "k", {
      createMessage: create,
    });

    assertEquals(parsed.amount, 0);
    assertEquals(parsed.confidence, 0);
  });

  Deno.test("currency defaults to EGP and note defaults to empty string", async () => {
    const { create } = stub(
      fakeToolUse({
        type: "expense",
        amount: 12,
        category_slug: "transport",
        confidence: 0.7,
        // no currency, no note
      }),
    );

    const parsed = await categorize("uber 12", "en", "k", {
      createMessage: create,
    });

    assertEquals(parsed.currency, "EGP");
    assertEquals(parsed.note, "");
  });

  Deno.test("invalid type defaults to expense and clamps confidence to [0,1]", async () => {
    const { create } = stub(
      fakeToolUse({
        type: "spend", // invalid
        amount: 5,
        currency: "EGP",
        category_slug: "food",
        note: "gum",
        confidence: 5, // out of range
      }),
    );

    const parsed = await categorize("gum 5", "en", "k", {
      createMessage: create,
    });

    assertEquals(parsed.type, "expense");
    assertEquals(parsed.confidence, 1);
  });

  Deno.test("throws when the response has no tool_use block", async () => {
    const { create } = stub({
      id: "msg_test",
      type: "message",
      role: "assistant",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "I cannot do that." }],
    });

    let threw = false;
    try {
      await categorize("hi", "en", "k", { createMessage: create });
    } catch (_e) {
      threw = true;
    }
    assert(threw, "expected categorize to throw when no tool_use block present");
  });
  ```

- [ ] **Step 2: Run the test — Expected: FAIL (module not found).**

  ```bash
  deno test --allow-none supabase/functions/tests/categorize_test.ts
  ```

  Expected (abridged):
  ```
  error: Module not found "file:///.../supabase/functions/_shared/categorize.ts".
  ```
  (FAIL.)

- [ ] **Step 3: Create `supabase/functions/_shared/categorize.ts` (full implementation).**

  ```ts
  // Shared categorization core. Calls Claude `claude-haiku-4-5` with a single
  // strict tool `record_transaction`, then maps the parsed tool_use.input to a
  // ParsedTransaction. Designed with an injectable `createMessage` transport so
  // unit tests can supply a fake response (no network, no API key).
  import Anthropic from "npm:@anthropic-ai/sdk@0.69.0";
  import {
    CATEGORY_SLUGS,
    FALLBACK_EXPENSE_SLUG,
    FALLBACK_INCOME_SLUG,
  } from "./categories.ts";

  // --- Local mirrors of M2 shared types (Deno cannot import from src/). ---
  // Kept structurally identical to ParsedTransaction / Locale / TxnType in
  // src/types/index.ts (owned by M2). If those change, update here too.
  export type Locale = "ar" | "en";
  export type TxnType = "expense" | "income";

  export interface ParsedTransaction {
    type: TxnType;
    amount: number;
    currency: string;
    category_slug: string;
    note: string;
    confidence: number;
    occurred_at?: string;
  }

  // --- Minimal structural shape of the Anthropic Messages response we rely on. ---
  // We intentionally type only the fields we read so a fake response in tests is
  // trivial to construct.
  export interface AnthropicToolUseBlock {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
  }
  export interface AnthropicTextBlock {
    type: "text";
    text: string;
  }
  export type AnthropicContentBlock =
    | AnthropicToolUseBlock
    | AnthropicTextBlock
    | { type: string; [k: string]: unknown };

  export interface AnthropicMessageResponse {
    id: string;
    type: "message";
    role: "assistant";
    stop_reason: string | null;
    content: AnthropicContentBlock[];
  }

  // The request body we hand to the transport (loosely typed: it is Anthropic's
  // MessageCreateParams, but we keep it `Record` so tests can introspect it).
  export type CreateMessage = (
    body: Record<string, unknown>,
  ) => Promise<AnthropicMessageResponse>;

  export interface CategorizeOptions {
    /** Inject a fake transport in tests. Defaults to the real Anthropic SDK. */
    createMessage?: CreateMessage;
  }

  const TOOL_NAME = "record_transaction";

  /** JSON Schema for the single forced tool. */
  function toolInputSchema() {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["expense", "income"],
          description:
            "Whether money left the user (expense) or came in (income).",
        },
        amount: {
          type: "number",
          description:
            "The numeric amount, positive. Convert Arabic-Indic digits (٠-٩) to "
            + "Western digits. If no amount is present, use 0.",
        },
        currency: {
          type: "string",
          description:
            "ISO-ish currency code. Map EGP / جنيه / ج.م / pounds to 'EGP'. "
            + "Default 'EGP' if unspecified.",
        },
        category_slug: {
          type: "string",
          enum: CATEGORY_SLUGS,
          description:
            "Best-fit category slug. Use other_expense / other_income when unsure.",
        },
        note: {
          type: "string",
          description:
            "A very short human label for the item (e.g. 'coffee', 'قهوة').",
        },
        confidence: {
          type: "number",
          description: "Your confidence in this parse, from 0 to 1.",
        },
        occurred_at: {
          type: "string",
          description:
            "Optional ISO-8601 timestamp of when it happened, if the text states "
            + "a date/time. Omit if not stated.",
        },
      },
      required: ["type", "amount", "currency", "category_slug", "note", "confidence"],
    };
  }

  function systemPrompt(locale: Locale): string {
    const lang = locale === "ar" ? "Arabic" : "English";
    return [
      "You categorize a single personal-finance utterance or SMS into ONE fixed",
      "category. The user's text is most likely in " + lang + ", but it may mix",
      "Arabic and English. You MUST respond by calling the record_transaction tool",
      "exactly once and nothing else. Pick the single best category_slug from the",
      "allowed enum; when genuinely unsure use other_expense (for spending) or",
      "other_income (for money received). Amounts are in Egyptian Pounds (EGP) by",
      "default. Convert Arabic-Indic digits to Western digits.",
    ].join(" ");
  }

  /** Build the Anthropic Messages request body (shared by real + fake transports). */
  export function buildRequestBody(
    text: string,
    locale: Locale,
  ): Record<string, unknown> {
    return {
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: systemPrompt(locale),
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Record the user's parsed financial transaction. Call this exactly "
            + "once with your best structured extraction of type, amount, currency, "
            + "category, a short note, and your confidence.",
          strict: true,
          input_schema: toolInputSchema(),
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: text }],
    };
  }

  /** Default transport: the real Anthropic SDK using strict tool use. */
  function realTransport(apiKey: string): CreateMessage {
    const client = new Anthropic({ apiKey });
    return async (body) => {
      // Strict tool use requires the structured-outputs beta header. We pass it
      // via the per-request `betas` option on the beta.messages endpoint.
      // deno-lint-ignore no-explicit-any
      const res = await (client as any).beta.messages.create({
        ...body,
        betas: ["structured-outputs-2025-11-13"],
      });
      return res as AnthropicMessageResponse;
    };
  }

  // --- Field coercion helpers ---
  function coerceType(v: unknown): TxnType {
    return v === "income" ? "income" : "expense";
  }

  function coerceAmount(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n;
  }

  function coerceConfidence(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function coerceCurrency(v: unknown): string {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    return "EGP";
  }

  function coerceNote(v: unknown): string {
    return typeof v === "string" ? v : "";
  }

  function coerceSlug(v: unknown, type: TxnType): string {
    if (typeof v === "string" && CATEGORY_SLUGS.includes(v)) return v;
    return type === "income" ? FALLBACK_INCOME_SLUG : FALLBACK_EXPENSE_SLUG;
  }

  function coerceOccurredAt(v: unknown): string | undefined {
    return typeof v === "string" && v.trim().length > 0 ? v : undefined;
  }

  function findToolUse(
    res: AnthropicMessageResponse,
  ): AnthropicToolUseBlock | undefined {
    const blocks = Array.isArray(res?.content) ? res.content : [];
    return blocks.find(
      (b): b is AnthropicToolUseBlock =>
        b?.type === "tool_use" && b.name === TOOL_NAME,
    );
  }

  /**
   * Categorize a finance utterance into a ParsedTransaction.
   *
   * @param text   Raw user/SMS text.
   * @param locale 'ar' | 'en' — hint for the system prompt.
   * @param apiKey Anthropic API key (ignored when a fake transport is injected).
   * @param opts   { createMessage } to inject a fake transport in tests.
   */
  export async function categorize(
    text: string,
    locale: Locale,
    apiKey: string,
    opts: CategorizeOptions = {},
  ): Promise<ParsedTransaction> {
    const transport = opts.createMessage ?? realTransport(apiKey);
    const res = await transport(buildRequestBody(text, locale));

    const toolUse = findToolUse(res);
    if (!toolUse) {
      throw new Error("Claude did not return a record_transaction tool_use block");
    }

    const input = toolUse.input ?? {};
    const type = coerceType(input.type);
    const amount = coerceAmount(input.amount);
    // Per spec: if there is no usable amount, force amount 0 AND confidence 0.
    const confidence = amount === 0 ? 0 : coerceConfidence(input.confidence);

    const parsed: ParsedTransaction = {
      type,
      amount,
      currency: coerceCurrency(input.currency),
      category_slug: coerceSlug(input.category_slug, type),
      note: coerceNote(input.note),
      confidence,
    };

    const occurredAt = coerceOccurredAt(input.occurred_at);
    if (occurredAt) parsed.occurred_at = occurredAt;

    return parsed;
  }
  ```

- [ ] **Step 4: Run the test — Expected: PASS.**

  ```bash
  deno test --allow-none supabase/functions/tests/categorize_test.ts
  ```

  Expected (abridged):
  ```
  running 8 tests from ./supabase/functions/tests/categorize_test.ts
  maps a well-formed English tool_use to ParsedTransaction ... ok
  maps an Arabic utterance and passes occurred_at through ... ok
  unknown slug falls back to other_expense for an expense ... ok
  unknown slug falls back to other_income for income ... ok
  missing/zero amount -> amount 0 and confidence 0 ... ok
  currency defaults to EGP and note defaults to empty string ... ok
  invalid type defaults to expense and clamps confidence to [0,1] ... ok
  throws when the response has no tool_use block ... ok

  ok | 8 passed | 0 failed
  ```

  Note: `--allow-none` is sufficient because the test injects a fake transport — the real Anthropic SDK constructor in `realTransport` is never reached. (Deno lazily evaluates the dynamic `npm:` import only when the module graph needs it; the import statement is resolved at type level but no network/env access occurs in tests.) If the npm import causes a resolution prompt on first run, use `deno test --allow-env --allow-net=registry.npmjs.org supabase/functions/tests/categorize_test.ts` once to cache it, then re-run with `--allow-none`.

- [ ] **Step 5: Format, lint, and commit.**

  ```bash
  deno fmt supabase/functions/_shared/categorize.ts supabase/functions/tests/categorize_test.ts
  deno lint supabase/functions/_shared/categorize.ts
  git add supabase/functions/_shared/categorize.ts supabase/functions/tests/categorize_test.ts
  git commit -m "feat(edge): add categorize core with strict tool-use and injectable transport"
  ```

---

### Task 4.3: `categorize` HTTP handler (Deno.serve)

**Files:**
- Create: `supabase/functions/categorize/index.ts`
- Test: `supabase/functions/tests/handler_test.ts`

The handler is extracted into a pure `handleCategorize(req, deps)` function so it can be tested by calling it with a `Request` object and an injected `categorizeFn` + `apiKey`, with zero network. `index.ts` then wires the real deps into `Deno.serve`.

- [ ] **Step 1: Write the failing handler test FIRST.**

  Create `supabase/functions/tests/handler_test.ts`:

  ```ts
  import { assert, assertEquals } from "@std/assert";
  import {
    handleCategorize,
    type HandlerDeps,
  } from "../categorize/index.ts";
  import type { ParsedTransaction } from "../_shared/categorize.ts";

  const SAMPLE: ParsedTransaction = {
    type: "expense",
    amount: 50,
    currency: "EGP",
    category_slug: "food",
    note: "coffee",
    confidence: 0.94,
  };

  function deps(over: Partial<HandlerDeps> = {}): HandlerDeps {
    return {
      apiKey: "test-key",
      categorizeFn: () => Promise.resolve(SAMPLE),
      ...over,
    };
  }

  function postReq(body: unknown): Request {
    return new Request("http://localhost/categorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  Deno.test("OPTIONS preflight returns 204 with CORS headers", async () => {
    const res = await handleCategorize(
      new Request("http://localhost/categorize", { method: "OPTIONS" }),
      deps(),
    );
    assertEquals(res.status, 204);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  Deno.test("non-POST method returns 405", async () => {
    const res = await handleCategorize(
      new Request("http://localhost/categorize", { method: "GET" }),
      deps(),
    );
    assertEquals(res.status, 405);
  });

  Deno.test("happy path returns 200 { parsed } with CORS", async () => {
    const res = await handleCategorize(
      postReq({ text: "spent 50 EGP on coffee", locale: "en" }),
      deps(),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
    const json = await res.json();
    assertEquals(json, { parsed: SAMPLE });
  });

  Deno.test("locale defaults to 'en' when omitted", async () => {
    let seenLocale: string | undefined;
    const res = await handleCategorize(
      postReq({ text: "coffee 50" }),
      deps({
        categorizeFn: (_t, locale) => {
          seenLocale = locale;
          return Promise.resolve(SAMPLE);
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(seenLocale, "en");
  });

  Deno.test("missing/blank text returns 400", async () => {
    const res = await handleCategorize(postReq({ text: "   " }), deps());
    assertEquals(res.status, 400);
    const json = await res.json();
    assert(typeof json.error === "string");
  });

  Deno.test("oversized text (> 2000 chars) returns 413", async () => {
    const big = "a".repeat(2001);
    const res = await handleCategorize(postReq({ text: big }), deps());
    assertEquals(res.status, 413);
    const json = await res.json();
    assert(typeof json.error === "string");
  });

  Deno.test("missing ANTHROPIC_API_KEY returns 500", async () => {
    const res = await handleCategorize(
      postReq({ text: "coffee 50", locale: "en" }),
      deps({ apiKey: "" }),
    );
    assertEquals(res.status, 500);
    const json = await res.json();
    assert(typeof json.error === "string");
  });

  Deno.test("invalid JSON body returns 400", async () => {
    const req = new Request("http://localhost/categorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await handleCategorize(req, deps());
    assertEquals(res.status, 400);
  });

  Deno.test("categorize throwing returns 502", async () => {
    const res = await handleCategorize(
      postReq({ text: "coffee 50", locale: "en" }),
      deps({
        categorizeFn: () => Promise.reject(new Error("claude exploded")),
      }),
    );
    assertEquals(res.status, 502);
    const json = await res.json();
    assert(typeof json.error === "string");
  });
  ```

- [ ] **Step 2: Run the test — Expected: FAIL (module not found).**

  ```bash
  deno test --allow-none supabase/functions/tests/handler_test.ts
  ```

  Expected (abridged):
  ```
  error: Module not found "file:///.../supabase/functions/categorize/index.ts".
  ```
  (FAIL.)

- [ ] **Step 3: Create `supabase/functions/categorize/index.ts`.**

  ```ts
  // Edge Function: categorize
  // POST { text: string, locale?: 'ar' | 'en' } -> 200 { parsed: ParsedTransaction }
  // verify_jwt = true (see supabase/config.toml) — only authenticated app users.
  import { corsHeaders } from "../_shared/cors.ts";
  import {
    categorize,
    type Locale,
    type ParsedTransaction,
  } from "../_shared/categorize.ts";

  const MAX_TEXT_LENGTH = 2000;

  /** Injectable dependencies so the handler is unit-testable without network. */
  export interface HandlerDeps {
    apiKey: string;
    categorizeFn: (
      text: string,
      locale: Locale,
      apiKey: string,
    ) => Promise<ParsedTransaction>;
  }

  function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  /** Pure request handler — call directly from tests. */
  export async function handleCategorize(
    req: Request,
    deps: HandlerDeps,
  ): Promise<Response> {
    // CORS preflight.
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json({ error: "Method not allowed. Use POST." }, 405);
    }

    // Parse JSON body.
    let body: { text?: unknown; locale?: unknown };
    try {
      body = await req.json();
    } catch (_e) {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const text = typeof body.text === "string" ? body.text : "";
    if (text.trim().length === 0) {
      return json({ error: "Field 'text' is required." }, 400);
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return json(
        { error: `Field 'text' exceeds ${MAX_TEXT_LENGTH} characters.` },
        413,
      );
    }

    const locale: Locale = body.locale === "ar" ? "ar" : "en";

    // Guard the API key (missing secret -> 500).
    if (!deps.apiKey) {
      return json({ error: "Server misconfigured: ANTHROPIC_API_KEY not set." }, 500);
    }

    // Call Claude.
    try {
      const parsed = await deps.categorizeFn(text, locale, deps.apiKey);
      return json({ parsed }, 200);
    } catch (_e) {
      return json({ error: "Failed to categorize text." }, 502);
    }
  }

  // Wire real dependencies into the runtime server.
  Deno.serve((req) =>
    handleCategorize(req, {
      apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      categorizeFn: (text, locale, apiKey) => categorize(text, locale, apiKey),
    })
  );
  ```

- [ ] **Step 4: Run the test — Expected: PASS.**

  ```bash
  deno test --allow-none supabase/functions/tests/handler_test.ts
  ```

  Expected (abridged):
  ```
  running 9 tests from ./supabase/functions/tests/handler_test.ts
  OPTIONS preflight returns 204 with CORS headers ... ok
  non-POST method returns 405 ... ok
  happy path returns 200 { parsed } with CORS ... ok
  locale defaults to 'en' when omitted ... ok
  missing/blank text returns 400 ... ok
  oversized text (> 2000 chars) returns 413 ... ok
  missing ANTHROPIC_API_KEY returns 500 ... ok
  invalid JSON body returns 400 ... ok
  categorize throwing returns 502 ... ok

  ok | 9 passed | 0 failed
  ```

- [ ] **Step 5: Run the entire Edge test suite at once and format/lint.**

  ```bash
  deno test --allow-none supabase/functions/tests/
  deno fmt supabase/functions/categorize/index.ts supabase/functions/tests/handler_test.ts
  deno lint supabase/functions/categorize/index.ts
  ```

  Expected (abridged):
  ```
  ok | 20 passed | 0 failed
  ```

- [ ] **Step 6: Commit.**

  ```bash
  git add supabase/functions/categorize/index.ts supabase/functions/tests/handler_test.ts
  git commit -m "feat(edge): add categorize HTTP handler with cors, 413/500/502 guards"
  ```

---

### Task 4.4: Function config, secrets, and local-serve docs

**Files:**
- Modify: `supabase/config.toml` (append `[functions.categorize]` block)
- Create: `supabase/functions/.env.example`
- Modify: `.gitignore` (ignore `supabase/functions/.env`)
- Create: `supabase/functions/README.md`

- [ ] **Step 1: Append the function config to `supabase/config.toml`.**

  Add this block to the END of `supabase/config.toml` (M2 created the base file via `supabase init`; do not touch the rest of it):

  ```toml
  [functions.categorize]
  enabled = true
  verify_jwt = true
  ```

  `verify_jwt = true` means only authenticated users (with a valid Supabase JWT) can invoke it — `supabase.functions.invoke('categorize')` in M5 auto-attaches the user's JWT.

- [ ] **Step 2: Create the secrets template `supabase/functions/.env.example`.**

  ```bash
  # Local secrets for `supabase functions serve`.
  # Copy this file to supabase/functions/.env (gitignored) and fill in a real key.
  #   cp supabase/functions/.env.example supabase/functions/.env
  # Get an Anthropic API key from https://console.anthropic.com/.
  ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ```

- [ ] **Step 3: Ensure the real `.env` is gitignored.**

  Append to `.gitignore` (create the line if not already present from M1):

  ```gitignore
  # Supabase Edge Function local secrets (never commit)
  supabase/functions/.env
  ```

  Verify the real env file would be ignored (it must NOT appear in the output):

  ```bash
  printf 'ANTHROPIC_API_KEY=sk-ant-local-test\n' > supabase/functions/.env
  git status --porcelain supabase/functions/.env
  ```

  Expected output: **(empty)** — git ignores the file. If a line like `?? supabase/functions/.env` appears, the `.gitignore` entry is wrong; fix it before continuing.

- [ ] **Step 4: Create `supabase/functions/README.md` documenting the serve workflow.**

  ```markdown
  # Edge Functions

  ## categorize

  `POST /functions/v1/categorize` — `verify_jwt = true`.

  **Request:** `{ "text": string, "locale"?: "ar" | "en" }`
  **Response (200):** `{ "parsed": ParsedTransaction }`

  Status codes: `400` bad/empty/invalid-JSON body, `405` non-POST,
  `413` text longer than 2000 chars, `500` missing `ANTHROPIC_API_KEY`,
  `502` upstream (Claude) failure.

  Calls Claude `claude-haiku-4-5` (`max_tokens: 256`) with one strict tool
  `record_transaction` whose `category_slug` is an enum of the 17 category slugs.

  ## Local development

  1. Provide the secret (gitignored):

     ```bash
     cp supabase/functions/.env.example supabase/functions/.env
     # edit supabase/functions/.env -> real ANTHROPIC_API_KEY
     ```

  2. Start the function runtime (reads `supabase/functions/.env` automatically):

     ```bash
     supabase functions serve categorize
     ```

  3. Invoke it. `verify_jwt = true`, so you need a JWT. Locally the anon key works
     as a bearer for a quick smoke test:

     ```bash
     curl -i -X POST http://127.0.0.1:54321/functions/v1/categorize \
       -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
       -H "apikey: $SUPABASE_ANON_KEY" \
       -H "Content-Type: application/json" \
       -d '{"text":"spent 50 EGP on coffee","locale":"en"}'
     ```

     Expected: `200` with `{ "parsed": { "type": "expense", "amount": 50, ... } }`.

  > A physical iPhone must use the Mac LAN IP (e.g. `http://192.168.x.x:54321`),
  > not `localhost`. Same Wi-Fi; allow port 54321 through the macOS firewall.

  ## Production secrets

  Local `.env` is dev-only. For deployed functions set the secret separately:

  ```bash
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  supabase functions deploy categorize
  ```

  ## Tests

  Pure Deno tests with an injected fake Anthropic transport (no network, no key):

  ```bash
  deno test --allow-none supabase/functions/tests/
  ```
  ```

- [ ] **Step 5: Verify config.toml is valid and re-run the full suite.**

  ```bash
  grep -A2 '\[functions.categorize\]' supabase/config.toml
  deno test --allow-none supabase/functions/tests/
  ```

  Expected: the grep prints the `[functions.categorize]` block with `verify_jwt = true`; tests show `ok | 20 passed | 0 failed`.

- [ ] **Step 6: Commit (do NOT stage the real `.env`).**

  ```bash
  git add supabase/config.toml supabase/functions/.env.example supabase/functions/README.md .gitignore
  git status --short    # confirm supabase/functions/.env is NOT listed
  git commit -m "chore(edge): configure categorize verify_jwt, secrets template, and serve docs"
  ```

---

### Task 4.5: Manual smoke test against the local stack (verification only)

**Files:** none (verification step; nothing committed).

This confirms the wiring end-to-end against real Supabase + Claude before M5 builds the client. Requires Docker running and a real `ANTHROPIC_API_KEY` in `supabase/functions/.env`.

- [ ] **Step 1: Start the local stack and the function (two terminals).**

  ```bash
  supabase start
  supabase functions serve categorize
  ```

  Capture the anon key printed by `supabase start` (or `supabase status`) into a shell var:

  ```bash
  export SUPABASE_ANON_KEY="$(supabase status -o env | grep ANON_KEY | cut -d= -f2 | tr -d '\"')"
  ```

- [ ] **Step 2: English smoke test.**

  ```bash
  curl -s -X POST http://127.0.0.1:54321/functions/v1/categorize \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"text":"spent 50 EGP on coffee","locale":"en"}'
  ```

  Expected (values may vary slightly, slug/type/amount should match):
  ```json
  {"parsed":{"type":"expense","amount":50,"currency":"EGP","category_slug":"food","note":"coffee","confidence":0.9}}
  ```

- [ ] **Step 2b: Arabic smoke test.**

  ```bash
  curl -s -X POST http://127.0.0.1:54321/functions/v1/categorize \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"text":"اشتريت قهوة بـ ٥٠ جنيه","locale":"ar"}'
  ```

  Expected: `type` `expense`, `amount` `50`, `category_slug` `food`, `currency` `EGP`.

- [ ] **Step 3: Guard checks (oversized + missing key).**

  Oversized (expect HTTP 413):
  ```bash
  python3 -c "print('a'*2001)" | xargs -0 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://127.0.0.1:54321/functions/v1/categorize \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" -d "{\"text\":\"{}\"}"
  ```
  Expected: `413`.

  Missing-key (temporarily blank the key, expect HTTP 500): stop the serve process, set `ANTHROPIC_API_KEY=` (empty) in `supabase/functions/.env`, re-run `supabase functions serve categorize`, then:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:54321/functions/v1/categorize \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" -d '{"text":"coffee 50"}'
  ```
  Expected: `500`. **Restore the real key afterward.**

- [ ] **Step 4: Record the result.** If all four checks behave as expected, the `categorize` function is ready for M5 to consume via `supabase.functions.invoke('categorize', { body: { text, locale } })`. No commit for this task.

---

## Milestone 5: Voice/Text Capture vertical slice

This milestone builds the full in-app capture flow: a transactions data-access layer, a client wrapper for the `categorize` Edge Function, a pure `ParsedTransaction -> NewTransaction` mapper, a speech-recognition hook around `expo-speech-recognition`, an editable `ConfirmSheet`, and the wired-up `app/(tabs)/capture.tsx` screen.

**Imports from earlier milestones (DO NOT redefine — import them):**
- `supabase` from `src/lib/supabase` (M3)
- `Transaction`, `NewTransaction`, `ParsedTransaction`, `TxnType`, `TxnSource`, `TxnStatus`, `Locale` from `src/types` (M2)
- `CATEGORIES`, `categoryBySlug`, `expenseCategories`, `incomeCategories` from `src/lib/categories` (M2)
- `useSession` from `src/features/auth/SessionProvider` (M3)
- `t`, `isRTL` from `src/lib/i18n` (M3)

**Cross-milestone rule reminder:** in-app capture saves with `status: 'confirmed'`. Phase-1 never writes `'pending'`.

**Verified API facts (2026-06-02):**
- `expo-speech-recognition` (jamsch): `import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition"`. `ExpoSpeechRecognitionModule.requestPermissionsAsync()` resolves `{ granted: boolean }`; `.start(options)` / `.stop()`; `.supportsOnDeviceRecognition()` returns `boolean`; `.getSupportedLocales()` resolves `{ locales: string[]; installedLocales: string[] }`. Events: `"result"` → `{ results: { transcript: string }[]; isFinal: boolean }`, `"error"` → `{ error: string; message: string }`, `"start"`, `"end"`. `start` options include `lang`, `interimResults`, `continuous`, `requiresOnDeviceRecognition`. REQUIRES a dev build (not Expo Go).
- `supabase.functions.invoke(name, { body })` resolves `{ data, error }`. On a non-2xx, `error instanceof FunctionsHttpError` and the JSON body is read via `await error.context.json()`.

### Task 5.1: Install the speech-recognition native dependency

**Files:**
- Modify: `package.json` (via installer)
- Modify: `app.json` (config plugin)

- [ ] **Step 1: Install via expo install so the version matches SDK 54.**
  Run:
  ```bash
  npx expo install expo-speech-recognition
  ```
  Expected: a line like `+ expo-speech-recognition@x.y.z` and `package.json` updated.

- [ ] **Step 2: Register the config plugin with iOS permission strings.**
  Open `app.json` and add the plugin to the `plugins` array (keep any plugins M1 already added). The `plugins` array entry:
  ```json
  [
    "expo-speech-recognition",
    {
      "microphonePermission": "Allow Budget Tracker to use the microphone to capture spoken transactions.",
      "speechRecognitionPermission": "Allow Budget Tracker to recognize your speech to log transactions.",
      "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox"]
    }
  ]
  ```
  Concretely, ensure `app.json`'s `expo.plugins` contains both the reanimated-related entries from M1 and the entry above. Example resulting `plugins` value (merge, do not clobber M1 entries):
  ```json
  "plugins": [
    "expo-router",
    [
      "expo-speech-recognition",
      {
        "microphonePermission": "Allow Budget Tracker to use the microphone to capture spoken transactions.",
        "speechRecognitionPermission": "Allow Budget Tracker to recognize your speech to log transactions.",
        "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox"]
      }
    ]
  ]
  ```

- [ ] **Step 3: Verify TypeScript still typechecks.**
  Run:
  ```bash
  npx tsc --noEmit
  ```
  Expected: PASS (no errors). The native module is only resolved at build time; the JS types resolve from `node_modules`.

- [ ] **Step 4: Commit.**
  ```bash
  git add package.json package-lock.json app.json
  git commit -m "chore: add expo-speech-recognition with config plugin"
  ```

### Task 5.2: Transactions data-access layer (`api.ts`)

**Files:**
- Create: `src/features/transactions/api.ts`
- Test: `src/features/transactions/__tests__/api.test.ts`

- [ ] **Step 1: Write the failing test (mock the supabase module).**
  Create `src/features/transactions/__tests__/api.test.ts`:
  ```ts
  import { insertTransaction, updateTransaction, deleteTransaction, listTransactions } from '../api';
  import { supabase } from '../../../lib/supabase';
  import type { NewTransaction, Transaction } from '../../../types';

  jest.mock('../../../lib/supabase', () => {
    return { supabase: { from: jest.fn() } };
  });

  const mockedFrom = supabase.from as unknown as jest.Mock;

  const sampleRow: Transaction = {
    id: 'txn-1',
    user_id: 'user-1',
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    raw_text: 'spent 50 on coffee',
    source: 'text',
    status: 'confirmed',
    confidence: 0.9,
    occurred_at: '2026-06-02T10:00:00.000Z',
    created_at: '2026-06-02T10:00:01.000Z',
  };

  const newRow: NewTransaction = {
    user_id: 'user-1',
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    raw_text: 'spent 50 on coffee',
    source: 'text',
    status: 'confirmed',
    confidence: 0.9,
    occurred_at: '2026-06-02T10:00:00.000Z',
  };

  afterEach(() => jest.clearAllMocks());

  describe('insertTransaction', () => {
    it('inserts and returns the created row', async () => {
      const single = jest.fn().mockResolvedValue({ data: sampleRow, error: null });
      const select = jest.fn().mockReturnValue({ single });
      const insert = jest.fn().mockReturnValue({ select });
      mockedFrom.mockReturnValue({ insert });

      const result = await insertTransaction(newRow);

      expect(mockedFrom).toHaveBeenCalledWith('transactions');
      expect(insert).toHaveBeenCalledWith(newRow);
      expect(select).toHaveBeenCalled();
      expect(result).toEqual(sampleRow);
    });

    it('throws when supabase returns an error', async () => {
      const single = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
      const select = jest.fn().mockReturnValue({ single });
      const insert = jest.fn().mockReturnValue({ select });
      mockedFrom.mockReturnValue({ insert });

      await expect(insertTransaction(newRow)).rejects.toThrow('boom');
    });
  });

  describe('updateTransaction', () => {
    it('updates by id and returns the row', async () => {
      const single = jest.fn().mockResolvedValue({ data: sampleRow, error: null });
      const select = jest.fn().mockReturnValue({ single });
      const eq = jest.fn().mockReturnValue({ select });
      const update = jest.fn().mockReturnValue({ eq });
      mockedFrom.mockReturnValue({ update });

      const result = await updateTransaction('txn-1', { note: 'tea' });

      expect(update).toHaveBeenCalledWith({ note: 'tea' });
      expect(eq).toHaveBeenCalledWith('id', 'txn-1');
      expect(result).toEqual(sampleRow);
    });

    it('throws on error', async () => {
      const single = jest.fn().mockResolvedValue({ data: null, error: { message: 'no row' } });
      const select = jest.fn().mockReturnValue({ single });
      const eq = jest.fn().mockReturnValue({ select });
      const update = jest.fn().mockReturnValue({ eq });
      mockedFrom.mockReturnValue({ update });

      await expect(updateTransaction('txn-1', { note: 'tea' })).rejects.toThrow('no row');
    });
  });

  describe('deleteTransaction', () => {
    it('deletes by id', async () => {
      const eq = jest.fn().mockResolvedValue({ error: null });
      const del = jest.fn().mockReturnValue({ eq });
      mockedFrom.mockReturnValue({ delete: del });

      await deleteTransaction('txn-1');

      expect(del).toHaveBeenCalled();
      expect(eq).toHaveBeenCalledWith('id', 'txn-1');
    });

    it('throws on error', async () => {
      const eq = jest.fn().mockResolvedValue({ error: { message: 'denied' } });
      const del = jest.fn().mockReturnValue({ eq });
      mockedFrom.mockReturnValue({ delete: del });

      await expect(deleteTransaction('txn-1')).rejects.toThrow('denied');
    });
  });

  describe('listTransactions', () => {
    it('orders by occurred_at desc with no filter', async () => {
      const order = jest.fn().mockResolvedValue({ data: [sampleRow], error: null });
      const select = jest.fn().mockReturnValue({ order });
      mockedFrom.mockReturnValue({ select });

      const result = await listTransactions({});

      expect(mockedFrom).toHaveBeenCalledWith('transactions');
      expect(select).toHaveBeenCalledWith('*');
      expect(order).toHaveBeenCalledWith('occurred_at', { ascending: false });
      expect(result).toEqual([sampleRow]);
    });

    it('applies category_slug, status, from and to filters in order', async () => {
      const order = jest.fn().mockResolvedValue({ data: [], error: null });
      const lt = jest.fn().mockReturnValue({ order });
      const gte = jest.fn().mockReturnValue({ lt });
      const eqStatus = jest.fn().mockReturnValue({ gte });
      const eqCat = jest.fn().mockReturnValue({ eq: eqStatus });
      const select = jest.fn().mockReturnValue({ eq: eqCat });
      mockedFrom.mockReturnValue({ select });

      await listTransactions({
        category_slug: 'food',
        status: 'confirmed',
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-07-01T00:00:00.000Z',
      });

      expect(eqCat).toHaveBeenCalledWith('category_slug', 'food');
      expect(eqStatus).toHaveBeenCalledWith('status', 'confirmed');
      expect(gte).toHaveBeenCalledWith('occurred_at', '2026-06-01T00:00:00.000Z');
      expect(lt).toHaveBeenCalledWith('occurred_at', '2026-07-01T00:00:00.000Z');
    });

    it('throws on error', async () => {
      const order = jest.fn().mockResolvedValue({ data: null, error: { message: 'rls' } });
      const select = jest.fn().mockReturnValue({ order });
      mockedFrom.mockReturnValue({ select });

      await expect(listTransactions({})).rejects.toThrow('rls');
    });
  });
  ```

- [ ] **Step 2: Run the test — expect FAIL (module not implemented).**
  ```bash
  npx jest src/features/transactions/__tests__/api.test.ts
  ```
  Expected: FAIL — `Cannot find module '../api'`.

- [ ] **Step 3: Implement `src/features/transactions/api.ts`.**
  Note the filter is applied conditionally in a fixed order so the test can build the mock chain `eq(category_slug) → eq(status) → gte(from) → lt(to) → order`. `from`/`to` are caller-supplied ISO-8601 strings (M6's `monthRange()` produces them); this module does NOT compute month ranges itself.
  ```ts
  import { supabase } from '../../lib/supabase';
  import type { NewTransaction, Transaction, TxnStatus } from '../../types';

  // Canonical filter shape (consumed by M6's useTransactions / useMonthSummary).
  export interface TransactionFilter {
    from?: string;          // ISO-8601, inclusive lower bound on occurred_at
    to?: string;            // ISO-8601, exclusive upper bound on occurred_at
    category_slug?: string;
    status?: TxnStatus;
  }

  export async function insertTransaction(row: NewTransaction): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Transaction;
  }

  export async function updateTransaction(
    id: string,
    patch: Partial<NewTransaction>,
  ): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Transaction;
  }

  export async function deleteTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  export async function listTransactions(
    filter: TransactionFilter,
  ): Promise<Transaction[]> {
    let query = supabase.from('transactions').select('*');
    if (filter.category_slug) {
      query = query.eq('category_slug', filter.category_slug);
    }
    if (filter.status) {
      query = query.eq('status', filter.status);
    }
    if (filter.from) {
      query = query.gte('occurred_at', filter.from);
    }
    if (filter.to) {
      query = query.lt('occurred_at', filter.to);
    }
    const { data, error } = await query.order('occurred_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Transaction[];
  }
  ```

- [ ] **Step 4: Run the test — expect PASS.**
  ```bash
  npx jest src/features/transactions/__tests__/api.test.ts
  ```
  Expected: PASS — all tests green.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/transactions/api.ts src/features/transactions/__tests__/api.test.ts
  git commit -m "feat: transactions data-access layer (insert/update/delete/list)"
  ```

### Task 5.3: `buildCaptureRow` pure mapper (TDD REQUIRED)

**Files:**
- Create: `src/features/capture/toTransactionRow.ts`
- Test: `src/features/capture/__tests__/toTransactionRow.test.ts`

- [ ] **Step 1: Write the failing test.**
  Create `src/features/capture/__tests__/toTransactionRow.test.ts`:
  ```ts
  import { buildCaptureRow } from '../toTransactionRow';
  import type { ParsedTransaction } from '../../../types';

  const parsed: ParsedTransaction = {
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    confidence: 0.91,
  };

  describe('buildCaptureRow', () => {
    it('maps a ParsedTransaction to a NewTransaction', () => {
      const row = buildCaptureRow(parsed, 'spent 50 on coffee', 'text', 'user-1', 'confirmed');
      expect(row).toMatchObject({
        user_id: 'user-1',
        type: 'expense',
        amount: 50,
        currency: 'EGP',
        category_slug: 'food',
        note: 'coffee',
        raw_text: 'spent 50 on coffee',
        source: 'text',
        status: 'confirmed',
        confidence: 0.91,
      });
    });

    it('forces currency to EGP regardless of the parsed value', () => {
      const row = buildCaptureRow(
        { ...parsed, currency: 'USD' },
        'raw',
        'voice',
        'user-1',
        'confirmed',
      );
      expect(row.currency).toBe('EGP');
    });

    it('uses parsed.occurred_at when present', () => {
      const row = buildCaptureRow(
        { ...parsed, occurred_at: '2026-05-01T12:00:00.000Z' },
        'raw',
        'text',
        'user-1',
        'confirmed',
      );
      expect(row.occurred_at).toBe('2026-05-01T12:00:00.000Z');
    });

    it('defaults occurred_at to a valid ISO timestamp when missing', () => {
      const row = buildCaptureRow(parsed, 'raw', 'text', 'user-1', 'confirmed');
      expect(Number.isNaN(Date.parse(row.occurred_at))).toBe(false);
    });

    it('converts an empty note to null', () => {
      const row = buildCaptureRow({ ...parsed, note: '' }, 'raw', 'text', 'user-1', 'confirmed');
      expect(row.note).toBeNull();
    });

    it('passes through the given status (pending is never used by callers but is honored)', () => {
      const row = buildCaptureRow(parsed, 'raw', 'sms', 'user-1', 'pending');
      expect(row.status).toBe('pending');
    });
  });
  ```

- [ ] **Step 2: Run — expect FAIL.**
  ```bash
  npx jest src/features/capture/__tests__/toTransactionRow.test.ts
  ```
  Expected: FAIL — `Cannot find module '../toTransactionRow'`.

- [ ] **Step 3: Implement `src/features/capture/toTransactionRow.ts`.**
  ```ts
  import type {
    NewTransaction,
    ParsedTransaction,
    TxnSource,
    TxnStatus,
  } from '../../types';

  /**
   * Map Claude's ParsedTransaction onto a NewTransaction row.
   * Currency is forced to EGP (MVP is EGP-only). `rawText` is the original
   * voice/typed text kept for audit and re-categorization. An empty note
   * becomes null. occurred_at falls back to now() if Claude did not provide one.
   */
  export function buildCaptureRow(
    parsed: ParsedTransaction,
    rawText: string,
    source: TxnSource,
    userId: string,
    status: TxnStatus,
  ): NewTransaction {
    const note = parsed.note.trim();
    return {
      user_id: userId,
      type: parsed.type,
      amount: parsed.amount,
      currency: 'EGP',
      category_slug: parsed.category_slug,
      note: note.length > 0 ? note : null,
      raw_text: rawText.length > 0 ? rawText : null,
      source,
      status,
      confidence: parsed.confidence,
      occurred_at: parsed.occurred_at ?? new Date().toISOString(),
    };
  }
  ```

- [ ] **Step 4: Run — expect PASS.**
  ```bash
  npx jest src/features/capture/__tests__/toTransactionRow.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/capture/toTransactionRow.ts src/features/capture/__tests__/toTransactionRow.test.ts
  git commit -m "feat: buildCaptureRow maps ParsedTransaction to NewTransaction"
  ```

### Task 5.4: `requestCategorize` Edge Function client

**Files:**
- Create: `src/features/capture/categorizeClient.ts`
- Test: `src/features/capture/__tests__/categorizeClient.test.ts`

- [ ] **Step 1: Write the failing test (mock supabase.functions.invoke).**
  Create `src/features/capture/__tests__/categorizeClient.test.ts`:
  ```ts
  import { requestCategorize } from '../categorizeClient';
  import { supabase } from '../../../lib/supabase';
  import { FunctionsHttpError } from '@supabase/supabase-js';
  import type { ParsedTransaction } from '../../../types';

  jest.mock('../../../lib/supabase', () => ({
    supabase: { functions: { invoke: jest.fn() } },
  }));

  const mockedInvoke = supabase.functions.invoke as unknown as jest.Mock;

  const parsed: ParsedTransaction = {
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    confidence: 0.9,
  };

  afterEach(() => jest.clearAllMocks());

  it('invokes the categorize function with text + locale and returns parsed', async () => {
    mockedInvoke.mockResolvedValue({ data: { parsed }, error: null });

    const result = await requestCategorize('spent 50 on coffee', 'en');

    expect(mockedInvoke).toHaveBeenCalledWith('categorize', {
      body: { text: 'spent 50 on coffee', locale: 'en' },
    });
    expect(result).toEqual(parsed);
  });

  it('throws with the JSON error body on a FunctionsHttpError', async () => {
    const httpError = new FunctionsHttpError(
      new Response(JSON.stringify({ error: 'too long' }), { status: 413 }),
    );
    mockedInvoke.mockResolvedValue({ data: null, error: httpError });

    await expect(requestCategorize('x'.repeat(99999), 'en')).rejects.toThrow('too long');
  });

  it('throws a generic message on a non-HTTP error', async () => {
    mockedInvoke.mockResolvedValue({ data: null, error: new Error('network down') });

    await expect(requestCategorize('hi', 'ar')).rejects.toThrow('network down');
  });

  it('throws when the response payload has no parsed field', async () => {
    mockedInvoke.mockResolvedValue({ data: {}, error: null });

    await expect(requestCategorize('hi', 'en')).rejects.toThrow();
  });
  ```

- [ ] **Step 2: Run — expect FAIL.**
  ```bash
  npx jest src/features/capture/__tests__/categorizeClient.test.ts
  ```
  Expected: FAIL — `Cannot find module '../categorizeClient'`.

- [ ] **Step 3: Implement `src/features/capture/categorizeClient.ts`.**
  The Edge Function (M4) returns `200 { parsed }`. On a non-2xx, supabase-js yields a `FunctionsHttpError` whose body is read via `await error.context.json()`.
  ```ts
  import { FunctionsHttpError } from '@supabase/supabase-js';
  import { supabase } from '../../lib/supabase';
  import type { Locale, ParsedTransaction } from '../../types';

  /**
   * Calls the `categorize` Edge Function (verify_jwt=true; the user JWT is
   * attached automatically by functions.invoke) and returns the parsed result.
   * Throws an Error carrying the server-provided message on failure.
   */
  export async function requestCategorize(
    text: string,
    locale: Locale,
  ): Promise<ParsedTransaction> {
    const { data, error } = await supabase.functions.invoke('categorize', {
      body: { text, locale },
    });

    if (error) {
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          throw new Error(body?.error ?? 'Categorization failed');
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== 'Categorization failed') {
            throw parseErr;
          }
          throw new Error('Categorization failed');
        }
      }
      throw new Error(error.message || 'Categorization failed');
    }

    const parsed = (data as { parsed?: ParsedTransaction } | null)?.parsed;
    if (!parsed) {
      throw new Error('Categorization returned no result');
    }
    return parsed;
  }
  ```

- [ ] **Step 4: Run — expect PASS.**
  ```bash
  npx jest src/features/capture/__tests__/categorizeClient.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/capture/categorizeClient.ts src/features/capture/__tests__/categorizeClient.test.ts
  git commit -m "feat: requestCategorize client for the categorize Edge Function"
  ```

### Task 5.5: `useSpeechRecognition` hook (mock the native module in tests)

**Files:**
- Create: `src/hooks/useSpeechRecognition.ts`
- Test: `src/hooks/__tests__/useSpeechRecognition.test.ts`
- Modify: `jest.config.js` (only if a `moduleNameMapper` / mock dir is needed — see Step 1)

- [ ] **Step 1: Add a manual mock for the native module.**
  Create `__mocks__/expo-speech-recognition.ts` at the REPO ROOT so jest auto-resolves it whenever the module is mocked:
  ```ts
  // Manual mock used by jest.mock('expo-speech-recognition') in tests.
  export const ExpoSpeechRecognitionModule = {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    start: jest.fn(),
    stop: jest.fn(),
    supportsOnDeviceRecognition: jest.fn().mockReturnValue(false),
    getSupportedLocales: jest
      .fn()
      .mockResolvedValue({ locales: [], installedLocales: [] }),
  };

  type Handler = (event: any) => void;
  const handlers: Record<string, Handler[]> = {};

  export const useSpeechRecognitionEvent = jest.fn(
    (event: string, handler: Handler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    },
  );

  // Test helper: synchronously fire a registered event.
  export const __emit = (event: string, payload?: any) => {
    (handlers[event] ?? []).forEach((h) => h(payload));
  };

  export const __reset = () => {
    Object.keys(handlers).forEach((k) => delete handlers[k]);
  };
  ```
  Note: `__mocks__` adjacent to `node_modules` is jest's convention for mocking node modules; `jest.mock('expo-speech-recognition')` in a test file activates it. No `jest.config.js` change is required for this convention, but confirm M1's `jest.config.js` does NOT set `roots` to exclude the repo-root `__mocks__`. If it does, add the repo root back to `roots`.

- [ ] **Step 2: Write the failing test.**
  Create `src/hooks/__tests__/useSpeechRecognition.test.ts`:
  ```ts
  import { renderHook, act, waitFor } from '@testing-library/react-native';
  import { useSpeechRecognition } from '../useSpeechRecognition';
  import {
    ExpoSpeechRecognitionModule,
    __emit,
    __reset,
  } from 'expo-speech-recognition';

  jest.mock('expo-speech-recognition');

  const mod = ExpoSpeechRecognitionModule as unknown as {
    requestPermissionsAsync: jest.Mock;
    start: jest.Mock;
    stop: jest.Mock;
    supportsOnDeviceRecognition: jest.Mock;
    getSupportedLocales: jest.Mock;
  };

  beforeEach(() => {
    __reset();
    jest.clearAllMocks();
    mod.requestPermissionsAsync.mockResolvedValue({ granted: true });
    mod.supportsOnDeviceRecognition.mockReturnValue(false);
    mod.getSupportedLocales.mockResolvedValue({ locales: [], installedLocales: [] });
  });

  it('starts cloud recognition when on-device is unavailable', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start('en-US');
    });

    expect(mod.requestPermissionsAsync).toHaveBeenCalled();
    expect(mod.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-US', requiresOnDeviceRecognition: false }),
    );
  });

  it('prefers on-device when the locale is installed', async () => {
    mod.supportsOnDeviceRecognition.mockReturnValue(true);
    mod.getSupportedLocales.mockResolvedValue({
      locales: ['ar-EG'],
      installedLocales: ['ar-EG'],
    });
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start('ar-EG');
    });

    expect(mod.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'ar-EG', requiresOnDeviceRecognition: true }),
    );
  });

  it('sets isListening on start and clears it on end', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start('en-US');
    });
    act(() => __emit('start'));
    expect(result.current.isListening).toBe(true);

    act(() => __emit('end'));
    expect(result.current.isListening).toBe(false);
  });

  it('updates transcript on a result event', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => __emit('result', { results: [{ transcript: 'hello' }], isFinal: true }));

    expect(result.current.transcript).toBe('hello');
  });

  it('captures errors and stops listening', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => __emit('start'));
    act(() => __emit('error', { error: 'no-speech', message: 'No speech detected' }));

    expect(result.current.error).toBe('No speech detected');
    expect(result.current.isListening).toBe(false);
  });

  it('falls back to cloud when on-device start throws', async () => {
    mod.supportsOnDeviceRecognition.mockReturnValue(true);
    mod.getSupportedLocales.mockResolvedValue({
      locales: ['ar-EG'],
      installedLocales: ['ar-EG'],
    });
    mod.start
      .mockImplementationOnce(() => {
        throw new Error('on-device unavailable');
      })
      .mockImplementationOnce(() => undefined);

    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start('ar-EG');
    });

    expect(mod.start).toHaveBeenCalledTimes(2);
    expect(mod.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: false }),
    );
  });

  it('stop() calls the native stop', async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.stop());
    expect(mod.stop).toHaveBeenCalled();
  });
  ```

- [ ] **Step 3: Run — expect FAIL.**
  ```bash
  npx jest src/hooks/__tests__/useSpeechRecognition.test.ts
  ```
  Expected: FAIL — `Cannot find module '../useSpeechRecognition'`.

- [ ] **Step 4: Implement `src/hooks/useSpeechRecognition.ts`.**
  Strategy: request permission; if on-device is supported AND the locale is in `installedLocales`, try `requiresOnDeviceRecognition: true` first; on any throw, fall back to cloud (`requiresOnDeviceRecognition: false`). Events drive `transcript` / `isListening` / `error`. `supported` reflects whether the native module exists.
  ```ts
  import { useCallback, useState } from 'react';
  import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
  } from 'expo-speech-recognition';

  export interface SpeechRecognition {
    transcript: string;
    isListening: boolean;
    supported: boolean;
    error: string | null;
    start: (lang: string) => Promise<void>;
    stop: () => void;
  }

  // The native module is always defined in a dev build; treat its presence as support.
  const SUPPORTED = !!ExpoSpeechRecognitionModule;

  export function useSpeechRecognition(): SpeechRecognition {
    const [transcript, setTranscript] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useSpeechRecognitionEvent('start', () => {
      setIsListening(true);
      setError(null);
    });

    useSpeechRecognitionEvent('end', () => {
      setIsListening(false);
    });

    useSpeechRecognitionEvent('result', (event) => {
      const next = event.results?.[0]?.transcript;
      if (typeof next === 'string') {
        setTranscript(next);
      }
    });

    useSpeechRecognitionEvent('error', (event) => {
      setError(event.message ?? event.error ?? 'Speech recognition error');
      setIsListening(false);
    });

    const start = useCallback(async (lang: string) => {
      setError(null);
      setTranscript('');

      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        setError('Microphone / speech permission denied');
        return;
      }

      let preferOnDevice = false;
      try {
        if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
          const { installedLocales } =
            await ExpoSpeechRecognitionModule.getSupportedLocales();
          preferOnDevice = installedLocales.includes(lang);
        }
      } catch {
        preferOnDevice = false;
      }

      const baseOptions = {
        lang,
        interimResults: true,
        continuous: false,
      };

      if (preferOnDevice) {
        try {
          ExpoSpeechRecognitionModule.start({
            ...baseOptions,
            requiresOnDeviceRecognition: true,
          });
          return;
        } catch {
          // fall through to cloud
        }
      }

      try {
        ExpoSpeechRecognitionModule.start({
          ...baseOptions,
          requiresOnDeviceRecognition: false,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start recognition');
      }
    }, []);

    const stop = useCallback(() => {
      ExpoSpeechRecognitionModule.stop();
    }, []);

    return { transcript, isListening, supported: SUPPORTED, error, start, stop };
  }
  ```

- [ ] **Step 5: Run — expect PASS.**
  ```bash
  npx jest src/hooks/__tests__/useSpeechRecognition.test.ts
  ```
  Expected: PASS — all 8 tests green.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/hooks/useSpeechRecognition.ts src/hooks/__tests__/useSpeechRecognition.test.ts __mocks__/expo-speech-recognition.ts
  git commit -m "feat: useSpeechRecognition hook (on-device first, cloud fallback)"
  ```

### Task 5.6: parsed→editable-state reducer (TDD REQUIRED)

**Files:**
- Create: `src/features/capture/confirmReducer.ts`
- Test: `src/features/capture/__tests__/confirmReducer.test.ts`

This reducer holds the editable form state for `ConfirmSheet`, so the sheet stays a thin view. It is pure and unit-tested.

- [ ] **Step 1: Write the failing test.**
  Create `src/features/capture/__tests__/confirmReducer.test.ts`:
  ```ts
  import {
    initConfirmState,
    confirmReducer,
    type ConfirmState,
  } from '../confirmReducer';
  import type { ParsedTransaction } from '../../../types';

  const parsed: ParsedTransaction = {
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    confidence: 0.9,
  };

  describe('initConfirmState', () => {
    it('seeds editable fields from the parsed result', () => {
      const state = initConfirmState(parsed);
      expect(state).toEqual<ConfirmState>({
        type: 'expense',
        amountText: '50',
        category_slug: 'food',
        note: 'coffee',
      });
    });

    it('renders amount 0 as an empty string for editing', () => {
      const state = initConfirmState({ ...parsed, amount: 0 });
      expect(state.amountText).toBe('');
    });

    it('renders an empty note as an empty string', () => {
      const state = initConfirmState({ ...parsed, note: '' });
      expect(state.note).toBe('');
    });
  });

  describe('confirmReducer', () => {
    const base = initConfirmState(parsed);

    it('SET_TYPE switches the type and resets category to other_expense for expense', () => {
      const next = confirmReducer(base, { kind: 'SET_TYPE', value: 'income' });
      expect(next.type).toBe('income');
      expect(next.category_slug).toBe('other_income');
    });

    it('SET_TYPE back to expense resets category to other_expense', () => {
      const income = confirmReducer(base, { kind: 'SET_TYPE', value: 'income' });
      const back = confirmReducer(income, { kind: 'SET_TYPE', value: 'expense' });
      expect(back.category_slug).toBe('other_expense');
    });

    it('SET_AMOUNT strips non-numeric characters and keeps one dot', () => {
      const next = confirmReducer(base, { kind: 'SET_AMOUNT', value: '12a.3.4' });
      expect(next.amountText).toBe('12.34');
    });

    it('SET_CATEGORY updates the slug', () => {
      const next = confirmReducer(base, { kind: 'SET_CATEGORY', value: 'transport' });
      expect(next.category_slug).toBe('transport');
    });

    it('SET_NOTE updates the note', () => {
      const next = confirmReducer(base, { kind: 'SET_NOTE', value: 'taxi' });
      expect(next.note).toBe('taxi');
    });
  });
  ```

- [ ] **Step 2: Run — expect FAIL.**
  ```bash
  npx jest src/features/capture/__tests__/confirmReducer.test.ts
  ```
  Expected: FAIL — `Cannot find module '../confirmReducer'`.

- [ ] **Step 3: Implement `src/features/capture/confirmReducer.ts`.**
  ```ts
  import type { ParsedTransaction, TxnType } from '../../types';

  export interface ConfirmState {
    type: TxnType;
    amountText: string;
    category_slug: string;
    note: string;
  }

  export type ConfirmAction =
    | { kind: 'SET_TYPE'; value: TxnType }
    | { kind: 'SET_AMOUNT'; value: string }
    | { kind: 'SET_CATEGORY'; value: string }
    | { kind: 'SET_NOTE'; value: string };

  export function initConfirmState(parsed: ParsedTransaction): ConfirmState {
    return {
      type: parsed.type,
      amountText: parsed.amount > 0 ? String(parsed.amount) : '',
      category_slug: parsed.category_slug,
      note: parsed.note,
    };
  }

  // Keep digits and a single decimal point.
  function sanitizeAmount(raw: string): string {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot === -1) return cleaned;
    const head = cleaned.slice(0, firstDot + 1);
    const tail = cleaned.slice(firstDot + 1).replace(/\./g, '');
    return head + tail;
  }

  export function confirmReducer(
    state: ConfirmState,
    action: ConfirmAction,
  ): ConfirmState {
    switch (action.kind) {
      case 'SET_TYPE':
        return {
          ...state,
          type: action.value,
          // category list differs by kind; reset to the safe default for the new kind
          category_slug:
            action.value === 'income' ? 'other_income' : 'other_expense',
        };
      case 'SET_AMOUNT':
        return { ...state, amountText: sanitizeAmount(action.value) };
      case 'SET_CATEGORY':
        return { ...state, category_slug: action.value };
      case 'SET_NOTE':
        return { ...state, note: action.value };
      default:
        return state;
    }
  }
  ```

- [ ] **Step 4: Run — expect PASS.**
  ```bash
  npx jest src/features/capture/__tests__/confirmReducer.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/capture/confirmReducer.ts src/features/capture/__tests__/confirmReducer.test.ts
  git commit -m "feat: confirm sheet editable-state reducer"
  ```

### Task 5.7: `ConfirmSheet` component

**Files:**
- Create: `src/features/capture/ConfirmSheet.tsx`
- Test: `src/features/capture/__tests__/ConfirmSheet.test.tsx`

- [ ] **Step 1: Write the failing test (mock insertTransaction + categorizeClient not needed here; mock the api module).**
  Create `src/features/capture/__tests__/ConfirmSheet.test.tsx`:
  ```tsx
  import React from 'react';
  import { render, fireEvent, waitFor } from '@testing-library/react-native';
  import { ConfirmSheet } from '../ConfirmSheet';
  import { insertTransaction } from '../../transactions/api';
  import type { ParsedTransaction, Transaction } from '../../../types';

  jest.mock('../../transactions/api', () => ({
    insertTransaction: jest.fn(),
  }));

  const mockedInsert = insertTransaction as unknown as jest.Mock;

  const parsed: ParsedTransaction = {
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    confidence: 0.9,
  };

  const savedRow: Transaction = {
    id: 'txn-1',
    user_id: 'user-1',
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    raw_text: 'spent 50 on coffee',
    source: 'text',
    status: 'confirmed',
    confidence: 0.9,
    occurred_at: '2026-06-02T10:00:00.000Z',
    created_at: '2026-06-02T10:00:01.000Z',
  };

  afterEach(() => jest.clearAllMocks());

  it('renders the seeded amount and saves a confirmed row built from edits', async () => {
    mockedInsert.mockResolvedValue(savedRow);
    const onSaved = jest.fn();

    const { getByDisplayValue, getByTestId } = render(
      <ConfirmSheet
        parsed={parsed}
        rawText="spent 50 on coffee"
        userId="user-1"
        source="text"
        locale="en"
        onSaved={onSaved}
        onCancel={jest.fn()}
      />,
    );

    // Seeded amount is shown.
    getByDisplayValue('50');

    // Edit the amount, then save.
    fireEvent.changeText(getByTestId('confirm-amount'), '75.5');
    fireEvent.press(getByTestId('confirm-save'));

    await waitFor(() => expect(mockedInsert).toHaveBeenCalledTimes(1));
    const row = mockedInsert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'user-1',
      type: 'expense',
      amount: 75.5,
      currency: 'EGP',
      category_slug: 'food',
      raw_text: 'spent 50 on coffee',
      source: 'text',
      status: 'confirmed',
    });
    expect(onSaved).toHaveBeenCalledWith(savedRow);
  });

  it('blocks save and shows an error when the amount is empty or zero', async () => {
    const { getByTestId, getByText } = render(
      <ConfirmSheet
        parsed={{ ...parsed, amount: 0 }}
        rawText="raw"
        userId="user-1"
        source="voice"
        locale="en"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('confirm-save'));

    await waitFor(() => getByText('Enter an amount greater than 0'));
    expect(mockedInsert).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel is pressed', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <ConfirmSheet
        parsed={parsed}
        rawText="raw"
        userId="user-1"
        source="text"
        locale="en"
        onSaved={jest.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByTestId('confirm-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
  ```

- [ ] **Step 2: Run — expect FAIL.**
  ```bash
  npx jest src/features/capture/__tests__/ConfirmSheet.test.tsx
  ```
  Expected: FAIL — `Cannot find module '../ConfirmSheet'`.

- [ ] **Step 3: Implement `src/features/capture/ConfirmSheet.tsx`.**
  Uses the reducer from Task 5.6, the mapper from Task 5.3, `insertTransaction` from Task 5.2, and `expenseCategories()/incomeCategories()` + bilingual labels. Save builds the row with status `'confirmed'`.
  ```tsx
  import React, { useReducer, useState } from 'react';
  import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
  import type { Locale, ParsedTransaction, Transaction, TxnSource } from '../../types';
  import { expenseCategories, incomeCategories } from '../../lib/categories';
  import { insertTransaction } from '../transactions/api';
  import { buildCaptureRow } from './toTransactionRow';
  import {
    confirmReducer,
    initConfirmState,
    type ConfirmState,
  } from './confirmReducer';

  export interface ConfirmSheetProps {
    parsed: ParsedTransaction;
    rawText: string;
    userId: string;
    source: TxnSource;
    locale: Locale;
    onSaved: (row: Transaction) => void;
    onCancel: () => void;
  }

  function categoryLabel(
    cat: { name_en: string; name_ar: string },
    locale: Locale,
  ): string {
    return locale === 'ar' ? cat.name_ar : cat.name_en;
  }

  export function ConfirmSheet({
    parsed,
    rawText,
    userId,
    source,
    locale,
    onSaved,
    onCancel,
  }: ConfirmSheetProps) {
    const [state, dispatch] = useReducer(confirmReducer, parsed, initConfirmState);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const categories =
      state.type === 'income' ? incomeCategories() : expenseCategories();

    const handleSave = async () => {
      const amount = Number(state.amountText);
      if (!state.amountText || Number.isNaN(amount) || amount <= 0) {
        setError('Enter an amount greater than 0');
        return;
      }
      setError(null);
      setSaving(true);
      try {
        const row = await insertTransaction(
          buildCaptureRow(
            {
              type: state.type,
              amount,
              currency: 'EGP',
              category_slug: state.category_slug,
              note: state.note,
              confidence: parsed.confidence,
              occurred_at: parsed.occurred_at,
            },
            rawText,
            source,
            userId,
            'confirmed',
          ),
        );
        onSaved(row);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    };

    const isRtl = locale === 'ar';

    return (
      <View
        className="rounded-2xl bg-white p-4"
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        {/* Type toggle */}
        <View className="mb-3 flex-row gap-2">
          {(['expense', 'income'] as const).map((tt) => (
            <Pressable
              key={tt}
              testID={`confirm-type-${tt}`}
              onPress={() => dispatch({ kind: 'SET_TYPE', value: tt })}
              className={`flex-1 rounded-xl px-3 py-2 ${
                state.type === tt ? 'bg-black' : 'bg-gray-200'
              }`}
            >
              <Text
                className={`text-center ${
                  state.type === tt ? 'text-white' : 'text-black'
                }`}
              >
                {tt === 'expense'
                  ? locale === 'ar'
                    ? 'مصروف'
                    : 'Expense'
                  : locale === 'ar'
                    ? 'دخل'
                    : 'Income'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Amount */}
        <Text className="mb-1 text-xs text-gray-500">
          {locale === 'ar' ? 'المبلغ (ج.م)' : 'Amount (EGP)'}
        </Text>
        <TextInput
          testID="confirm-amount"
          value={state.amountText}
          onChangeText={(v) => dispatch({ kind: 'SET_AMOUNT', value: v })}
          keyboardType="decimal-pad"
          placeholder="0"
          className="mb-3 rounded-xl border border-gray-300 px-3 py-2 text-lg"
        />

        {/* Category picker */}
        <Text className="mb-1 text-xs text-gray-500">
          {locale === 'ar' ? 'الفئة' : 'Category'}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3"
        >
          <View className="flex-row gap-2">
            {categories.map((cat) => (
              <Pressable
                key={cat.slug}
                testID={`confirm-category-${cat.slug}`}
                onPress={() =>
                  dispatch({ kind: 'SET_CATEGORY', value: cat.slug })
                }
                className={`rounded-full px-3 py-2 ${
                  state.category_slug === cat.slug ? 'bg-black' : 'bg-gray-200'
                }`}
              >
                <Text
                  className={
                    state.category_slug === cat.slug
                      ? 'text-white'
                      : 'text-black'
                  }
                >
                  {categoryLabel(cat, locale)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Note */}
        <Text className="mb-1 text-xs text-gray-500">
          {locale === 'ar' ? 'ملاحظة' : 'Note'}
        </Text>
        <TextInput
          testID="confirm-note"
          value={state.note}
          onChangeText={(v) => dispatch({ kind: 'SET_NOTE', value: v })}
          placeholder={locale === 'ar' ? 'اختياري' : 'Optional'}
          className="mb-3 rounded-xl border border-gray-300 px-3 py-2"
        />

        {error ? (
          <Text testID="confirm-error" className="mb-2 text-red-600">
            {error}
          </Text>
        ) : null}

        {/* Actions */}
        <View className="flex-row gap-2">
          <Pressable
            testID="confirm-cancel"
            onPress={onCancel}
            disabled={saving}
            className="flex-1 rounded-xl bg-gray-200 px-3 py-3"
          >
            <Text className="text-center text-black">
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </Text>
          </Pressable>
          <Pressable
            testID="confirm-save"
            onPress={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-black px-3 py-3"
          >
            <Text className="text-center text-white">
              {saving
                ? locale === 'ar'
                  ? 'جارٍ الحفظ…'
                  : 'Saving…'
                : locale === 'ar'
                  ? 'حفظ'
                  : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
  ```

- [ ] **Step 4: Run — expect PASS.**
  ```bash
  npx jest src/features/capture/__tests__/ConfirmSheet.test.tsx
  ```
  Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/features/capture/ConfirmSheet.tsx src/features/capture/__tests__/ConfirmSheet.test.tsx
  git commit -m "feat: editable ConfirmSheet that saves a confirmed transaction"
  ```

### Task 5.8: Wire up the Capture screen

**Files:**
- Modify: `app/(tabs)/capture.tsx` (replaces the M3 stub)
- Test: `app/(tabs)/__tests__/capture.test.tsx`

- [ ] **Step 1: Write the failing screen test.**
  Mock `requestCategorize`, `useSpeechRecognition`, and `useSession`. The screen should: type text → press Categorize → call `requestCategorize` → render the `ConfirmSheet`.
  Create `app/(tabs)/__tests__/capture.test.tsx`:
  ```tsx
  import React from 'react';
  import { render, fireEvent, waitFor } from '@testing-library/react-native';
  import CaptureScreen from '../capture';
  import { requestCategorize } from '../../../src/features/capture/categorizeClient';
  import { useSpeechRecognition } from '../../../src/hooks/useSpeechRecognition';
  import { useSession } from '../../../src/features/auth/SessionProvider';
  import type { ParsedTransaction } from '../../../src/types';

  jest.mock('../../../src/features/capture/categorizeClient', () => ({
    requestCategorize: jest.fn(),
  }));
  jest.mock('../../../src/hooks/useSpeechRecognition', () => ({
    useSpeechRecognition: jest.fn(),
  }));
  jest.mock('../../../src/features/auth/SessionProvider', () => ({
    useSession: jest.fn(),
  }));
  // ConfirmSheet pulls in the api module; stub it to avoid the real supabase import.
  jest.mock('../../../src/features/transactions/api', () => ({
    insertTransaction: jest.fn(),
  }));

  const mockedCategorize = requestCategorize as unknown as jest.Mock;
  const mockedSpeech = useSpeechRecognition as unknown as jest.Mock;
  const mockedSession = useSession as unknown as jest.Mock;

  const parsed: ParsedTransaction = {
    type: 'expense',
    amount: 50,
    currency: 'EGP',
    category_slug: 'food',
    note: 'coffee',
    confidence: 0.9,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSession.mockReturnValue({
      user: { id: 'user-1' },
      profile: { locale: 'en' },
      session: {},
      loading: false,
    });
    mockedSpeech.mockReturnValue({
      transcript: '',
      isListening: false,
      supported: true,
      error: null,
      start: jest.fn(),
      stop: jest.fn(),
    });
  });

  it('categorizes typed text and shows the ConfirmSheet', async () => {
    mockedCategorize.mockResolvedValue(parsed);

    const { getByTestId, queryByTestId } = render(<CaptureScreen />);

    fireEvent.changeText(getByTestId('capture-text'), 'spent 50 on coffee');
    fireEvent.press(getByTestId('capture-categorize'));

    await waitFor(() => expect(mockedCategorize).toHaveBeenCalledWith('spent 50 on coffee', 'en'));
    await waitFor(() => expect(queryByTestId('confirm-save')).toBeTruthy());
  });

  it('disables Categorize when the text box is empty', () => {
    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('capture-categorize'));
    expect(mockedCategorize).not.toHaveBeenCalled();
  });

  it('toggles the mic via the speech hook', () => {
    const start = jest.fn();
    mockedSpeech.mockReturnValue({
      transcript: '',
      isListening: false,
      supported: true,
      error: null,
      start,
      stop: jest.fn(),
    });
    const { getByTestId } = render(<CaptureScreen />);
    fireEvent.press(getByTestId('capture-mic'));
    expect(start).toHaveBeenCalledWith('en-US');
  });
  ```

- [ ] **Step 2: Run — expect FAIL.**
  ```bash
  npx jest "app/(tabs)/__tests__/capture.test.tsx"
  ```
  Expected: FAIL — the stub `capture.tsx` has none of these testIDs.

- [ ] **Step 3: Replace `app/(tabs)/capture.tsx`.**
  The screen: a mic button that toggles `useSpeechRecognition` with a locale→STT-locale map, a `TextInput` synced to the transcript, a Categorize button calling `requestCategorize`, and the `ConfirmSheet` rendered once a parse arrives.
  ```tsx
  import React, { useEffect, useState } from 'react';
  import {
    View,
    Text,
    TextInput,
    Pressable,
    ActivityIndicator,
    ScrollView,
  } from 'react-native';
  import { useSession } from '../../src/features/auth/SessionProvider';
  import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
  import { requestCategorize } from '../../src/features/capture/categorizeClient';
  import { ConfirmSheet } from '../../src/features/capture/ConfirmSheet';
  import type { Locale, ParsedTransaction, TxnSource } from '../../src/types';

  // Map a UI locale to a default STT BCP-47 tag.
  function sttLocale(locale: Locale): string {
    return locale === 'ar' ? 'ar-EG' : 'en-US';
  }

  export default function CaptureScreen() {
    const { user, profile } = useSession();
    const locale: Locale = (profile?.locale as Locale) ?? 'en';

    const { transcript, isListening, error: sttError, start, stop } =
      useSpeechRecognition();

    const [text, setText] = useState('');
    const [parsed, setParsed] = useState<ParsedTransaction | null>(null);
    const [rawText, setRawText] = useState('');
    const [source, setSource] = useState<TxnSource>('text');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Mirror live transcript into the text box.
    useEffect(() => {
      if (transcript) {
        setText(transcript);
        setSource('voice');
      }
    }, [transcript]);

    const toggleMic = () => {
      if (isListening) {
        stop();
      } else {
        setError(null);
        start(sttLocale(locale));
      }
    };

    const onCategorize = async () => {
      const value = text.trim();
      if (!value) return;
      setError(null);
      setLoading(true);
      try {
        const result = await requestCategorize(value, locale);
        setRawText(value);
        setParsed(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to categorize');
      } finally {
        setLoading(false);
      }
    };

    const reset = () => {
      setParsed(null);
      setText('');
      setRawText('');
      setSource('text');
      setError(null);
    };

    return (
      <ScrollView
        className="flex-1 bg-gray-50"
        contentContainerClassName="p-4"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-4 text-2xl font-bold">
          {locale === 'ar' ? 'تسجيل معاملة' : 'Capture'}
        </Text>

        {/* Mic */}
        <Pressable
          testID="capture-mic"
          onPress={toggleMic}
          className={`mb-4 items-center justify-center rounded-2xl py-8 ${
            isListening ? 'bg-red-500' : 'bg-black'
          }`}
        >
          <Text className="text-lg text-white">
            {isListening
              ? locale === 'ar'
                ? '● استماع… اضغط للإيقاف'
                : '● Listening… tap to stop'
              : locale === 'ar'
                ? '🎤 اضغط للتحدث'
                : '🎤 Tap to speak'}
          </Text>
        </Pressable>

        {sttError ? (
          <Text testID="capture-stt-error" className="mb-2 text-red-600">
            {sttError}
          </Text>
        ) : null}

        {/* Text box */}
        <TextInput
          testID="capture-text"
          value={text}
          onChangeText={(v) => {
            setText(v);
            setSource('text');
          }}
          placeholder={
            locale === 'ar'
              ? 'اكتب أو تحدث… مثل: قهوة بـ ٥٠ جنيه'
              : 'Type or speak… e.g. coffee 50 EGP'
          }
          multiline
          className="mb-4 min-h-24 rounded-xl border border-gray-300 bg-white p-3 text-base"
          style={{ textAlign: locale === 'ar' ? 'right' : 'left' }}
        />

        <Pressable
          testID="capture-categorize"
          onPress={onCategorize}
          disabled={loading || !text.trim()}
          className={`mb-4 items-center rounded-xl py-3 ${
            !text.trim() ? 'bg-gray-300' : 'bg-blue-600'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-semibold text-white">
              {locale === 'ar' ? 'تصنيف' : 'Categorize'}
            </Text>
          )}
        </Pressable>

        {error ? (
          <Text testID="capture-error" className="mb-2 text-red-600">
            {error}
          </Text>
        ) : null}

        {/* Confirm sheet */}
        {parsed && user ? (
          <ConfirmSheet
            parsed={parsed}
            rawText={rawText}
            userId={user.id}
            source={source}
            locale={locale}
            onSaved={reset}
            onCancel={() => setParsed(null)}
          />
        ) : null}
      </ScrollView>
    );
  }
  ```

- [ ] **Step 4: Run — expect PASS.**
  ```bash
  npx jest "app/(tabs)/__tests__/capture.test.tsx"
  ```
  Expected: PASS — all 3 tests green.

- [ ] **Step 5: Typecheck and run the full suite.**
  ```bash
  npx tsc --noEmit && npx jest
  ```
  Expected: PASS — no type errors; every M5 test green (and prior milestones unaffected).

- [ ] **Step 6: Commit.**
  ```bash
  git add "app/(tabs)/capture.tsx" "app/(tabs)/__tests__/capture.test.tsx"
  git commit -m "feat: wire up Capture screen (mic + text + categorize + confirm)"
  ```

### Task 5.9: Manual smoke verification (dev build)

**Files:** none (manual verification only)

- [ ] **Step 1: Build and launch the dev client (expo-speech-recognition needs native code).**
  ```bash
  npx expo run:ios
  ```
  Expected: app builds and launches on the simulator/device. (Voice on the simulator is limited; type-based capture works everywhere.)

- [ ] **Step 2: Type-capture happy path.**
  Sign in, open the Capture tab, type `spent 50 on coffee`, tap Categorize. Expected: the ConfirmSheet appears pre-filled (expense / 50 / food / coffee). Edit if needed, tap Save. Expected: no error; the row is inserted with `status = 'confirmed'`. Verify in Supabase Studio (`http://127.0.0.1:54323`) that the row exists for your user.

- [ ] **Step 3: Voice-capture path (physical device, on real Wi-Fi with the Mac LAN IP set).**
  Tap the mic, grant permissions, say "coffee fifty pounds" (en) or "قهوة بخمسين جنيه" (ar). Expected: interim transcript fills the text box; on stop, tap Categorize → ConfirmSheet. If Arabic on-device is unavailable, confirm it still works via cloud fallback (network required).

- [ ] **Step 4: Error path.**
  Stop the Edge runtime (or temporarily break the function), tap Categorize. Expected: an inline error message (from `requestCategorize`) appears, no crash.

- [ ] **Step 5: Commit any doc note (optional).** If you keep a `docs/` dev log, record the verified flows. Otherwise no commit.

---

## Milestone 6: Dashboard + Transactions List

This milestone builds the read/aggregate slice of the app: a pure `summarize()` aggregator (TDD), two data hooks (`useMonthSummary`, `useTransactions`) that load confirmed transactions and feed the UI, and the two real screens that replace the M3 stubs — the Dashboard (`app/(tabs)/index.tsx`) and the Transactions list (`app/(tabs)/transactions.tsx`).

**Dependencies (already created by earlier milestones — import, never redefine):**
- From `src/features/transactions/api.ts` (M5): `listTransactions(filter): Promise<Transaction[]>`, `updateTransaction(id, patch): Promise<Transaction>`, `deleteTransaction(id): Promise<void>`, and the exported filter type `TransactionFilter`.
- From `src/types/index.ts` (M2): `Transaction`, `TxnType`, `Locale`.
- From `src/lib/categories.ts` (M2): `categoryBySlug(slug)`, `CATEGORIES`, `expenseCategories()`, `incomeCategories()`.
- From `src/lib/i18n.ts` (M3): `t(key, locale)`, `isRTL(locale)`, `STRINGS`.
- From `src/features/auth/SessionProvider.tsx` (M3): `useSession()` → `{ session, user, profile, loading }`.

> **Contract note for M5:** `src/features/transactions/api.ts` MUST export an interface `TransactionFilter { from?: string; to?: string; category_slug?: string; status?: TxnStatus }` (all fields optional ISO-8601 strings / slug). `listTransactions(filter)` applies `occurred_at >= from`, `occurred_at < to`, optional `category_slug` and `status` equality, ordered `occurred_at desc`. M6 imports this type and relies on that semantics. If M5 named it differently, reconcile to this name before M6 runs.

> **i18n keys consumed by M6** (M3 owns `STRINGS`; these keys MUST exist in both `en` and `ar`): `dashboard_title`, `net_this_month`, `income`, `expense`, `by_category`, `recent`, `no_transactions`, `transactions_title`, `all_categories`, `edit`, `delete`, `save`, `cancel`, `confirm_delete`, `amount`, `note`, `prev_month`, `next_month`, `loading`. If any are missing, add them to M3's `STRINGS` before running M6.

---

### Task 6.1: Pure month aggregator `summarize()`

**Files:**
- Create: `src/features/dashboard/summary.ts`
- Test: `src/features/dashboard/summary.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/features/dashboard/summary.test.ts` with the complete contents below. It covers: empty input, single expense, single income, mixed, `pending` excluded, multiple same-category aggregation, and `byCategory` sorted descending by total.

```ts
import { summarize } from './summary';
import type { Transaction } from '../../types';

// Minimal factory so tests stay readable. Only fields summarize() reads matter,
// the rest satisfy the Transaction type.
function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 'id-1',
    user_id: 'u1',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 0,
    currency: 'EGP',
    category_slug: overrides.category_slug ?? 'food',
    note: overrides.note ?? null,
    raw_text: null,
    source: 'text',
    status: overrides.status ?? 'confirmed',
    confidence: null,
    occurred_at: overrides.occurred_at ?? '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:00.000Z',
  };
}

describe('summarize', () => {
  it('returns zeros and empty breakdown for no transactions', () => {
    expect(summarize([])).toEqual({
      income: 0,
      expense: 0,
      net: 0,
      byCategory: [],
    });
  });

  it('sums a single confirmed expense', () => {
    const result = summarize([txn({ type: 'expense', amount: 50, category_slug: 'food' })]);
    expect(result.expense).toBe(50);
    expect(result.income).toBe(0);
    expect(result.net).toBe(-50);
    expect(result.byCategory).toEqual([{ slug: 'food', total: 50 }]);
  });

  it('sums a single confirmed income', () => {
    const result = summarize([txn({ type: 'income', amount: 1000, category_slug: 'salary' })]);
    expect(result.income).toBe(1000);
    expect(result.expense).toBe(0);
    expect(result.net).toBe(1000);
    expect(result.byCategory).toEqual([{ slug: 'salary', total: 1000 }]);
  });

  it('mixes income and expense; net = income - expense', () => {
    const result = summarize([
      txn({ id: 'a', type: 'income', amount: 1000, category_slug: 'salary' }),
      txn({ id: 'b', type: 'expense', amount: 200, category_slug: 'food' }),
      txn({ id: 'c', type: 'expense', amount: 50, category_slug: 'transport' }),
    ]);
    expect(result.income).toBe(1000);
    expect(result.expense).toBe(250);
    expect(result.net).toBe(750);
  });

  it('excludes pending transactions from every total and the breakdown', () => {
    const result = summarize([
      txn({ id: 'a', type: 'expense', amount: 100, category_slug: 'food', status: 'confirmed' }),
      txn({ id: 'b', type: 'expense', amount: 999, category_slug: 'food', status: 'pending' }),
      txn({ id: 'c', type: 'income', amount: 500, category_slug: 'salary', status: 'pending' }),
    ]);
    expect(result.expense).toBe(100);
    expect(result.income).toBe(0);
    expect(result.net).toBe(-100);
    expect(result.byCategory).toEqual([{ slug: 'food', total: 100 }]);
  });

  it('aggregates multiple transactions in the same category', () => {
    const result = summarize([
      txn({ id: 'a', type: 'expense', amount: 30, category_slug: 'food' }),
      txn({ id: 'b', type: 'expense', amount: 20, category_slug: 'food' }),
    ]);
    expect(result.byCategory).toEqual([{ slug: 'food', total: 50 }]);
  });

  it('sorts byCategory descending by total', () => {
    const result = summarize([
      txn({ id: 'a', type: 'expense', amount: 10, category_slug: 'transport' }),
      txn({ id: 'b', type: 'expense', amount: 90, category_slug: 'food' }),
      txn({ id: 'c', type: 'income', amount: 50, category_slug: 'salary' }),
    ]);
    expect(result.byCategory).toEqual([
      { slug: 'food', total: 90 },
      { slug: 'salary', total: 50 },
      { slug: 'transport', total: 10 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL (module not found).**
```bash
npx jest src/features/dashboard/summary.test.ts
```
Expected: FAIL — `Cannot find module './summary'` (the implementation does not exist yet).

- [ ] **Step 3: Write the minimal implementation.** Create `src/features/dashboard/summary.ts` with exactly:

```ts
import type { Transaction } from '../../types';

export interface CategoryTotal {
  slug: string;
  total: number;
}

export interface Summary {
  income: number;
  expense: number;
  net: number;
  byCategory: CategoryTotal[];
}

/**
 * Pure aggregator over a list of transactions.
 * - Only `status === 'confirmed'` rows are counted (Phase-1 never writes 'pending',
 *   but SMS Phase-2 will, so we filter defensively here).
 * - `income` / `expense` are summed by `type`.
 * - `net = income - expense`.
 * - `byCategory` totals every confirmed row by `category_slug`, sorted descending
 *   by total. Income and expense categories never share a slug (see category map),
 *   so combining them in one breakdown is unambiguous.
 */
export function summarize(txns: Transaction[]): Summary {
  let income = 0;
  let expense = 0;
  const totals = new Map<string, number>();

  for (const tx of txns) {
    if (tx.status !== 'confirmed') continue;
    if (tx.type === 'income') {
      income += tx.amount;
    } else {
      expense += tx.amount;
    }
    totals.set(tx.category_slug, (totals.get(tx.category_slug) ?? 0) + tx.amount);
  }

  const byCategory: CategoryTotal[] = Array.from(totals, ([slug, total]) => ({ slug, total }))
    .sort((a, b) => b.total - a.total);

  return { income, expense, net: income - expense, byCategory };
}
```

- [ ] **Step 4: Run the test — expect PASS.**
```bash
npx jest src/features/dashboard/summary.test.ts
```
Expected: PASS — `Tests: 7 passed, 7 total`.

- [ ] **Step 5: Commit.**
```bash
git add src/features/dashboard/summary.ts src/features/dashboard/summary.test.ts
git commit -m "feat(dashboard): add pure summarize() aggregator with tests"
```

---

### Task 6.2: Month range helper `monthRange()`

**Files:**
- Create: `src/features/dashboard/monthRange.ts`
- Test: `src/features/dashboard/monthRange.test.ts`

A small pure helper that converts a `{ year, month }` (month 0-indexed, matching JS `Date`) into the half-open ISO range `[from, to)` that `listTransactions` filters on. Kept separate so both `useMonthSummary` and the transactions screen's month filter share one source of truth.

- [ ] **Step 1: Write the failing test.** Create `src/features/dashboard/monthRange.test.ts`:

```ts
import { monthRange, currentMonthKey, addMonth, type MonthKey } from './monthRange';

describe('monthRange', () => {
  it('produces a half-open UTC range for a normal month', () => {
    // June 2026 -> month index 5
    expect(monthRange({ year: 2026, month: 5 })).toEqual({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
    });
  });

  it('rolls over to the next year in December', () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({
      from: '2026-12-01T00:00:00.000Z',
      to: '2027-01-01T00:00:00.000Z',
    });
  });
});

describe('addMonth', () => {
  it('advances forward across a year boundary', () => {
    expect(addMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('goes backward across a year boundary', () => {
    expect(addMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('currentMonthKey', () => {
  it('derives a MonthKey from a Date', () => {
    const key: MonthKey = currentMonthKey(new Date('2026-06-02T09:00:00.000Z'));
    expect(key).toEqual({ year: 2026, month: 5 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
```bash
npx jest src/features/dashboard/monthRange.test.ts
```
Expected: FAIL — `Cannot find module './monthRange'`.

- [ ] **Step 3: Implement.** Create `src/features/dashboard/monthRange.ts`:

```ts
export interface MonthKey {
  year: number;
  /** 0-indexed, matching JS Date.getMonth() (0 = January). */
  month: number;
}

export interface MonthRange {
  /** Inclusive lower bound, ISO-8601 UTC. */
  from: string;
  /** Exclusive upper bound, ISO-8601 UTC. */
  to: string;
}

/** Half-open [from, to) UTC range covering the given calendar month. */
export function monthRange(key: MonthKey): MonthRange {
  const from = new Date(Date.UTC(key.year, key.month, 1));
  const to = new Date(Date.UTC(key.year, key.month + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Shift a MonthKey by `delta` months, normalizing year rollover. */
export function addMonth(key: MonthKey, delta: number): MonthKey {
  const d = new Date(Date.UTC(key.year, key.month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** MonthKey for the month containing `date` (defaults to now). */
export function currentMonthKey(date: Date = new Date()): MonthKey {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}
```

- [ ] **Step 4: Run — expect PASS.**
```bash
npx jest src/features/dashboard/monthRange.test.ts
```
Expected: PASS — `Tests: 5 passed, 5 total`.

- [ ] **Step 5: Commit.**
```bash
git add src/features/dashboard/monthRange.ts src/features/dashboard/monthRange.test.ts
git commit -m "feat(dashboard): add monthRange/addMonth/currentMonthKey helpers with tests"
```

---

### Task 6.3: `useTransactions(filter)` hook

**Files:**
- Create: `src/features/transactions/useTransactions.ts`
- Test: `src/features/transactions/useTransactions.test.tsx`

Generic list-loading hook returning `{ data, loading, refresh }`. It calls `listTransactions(filter)` from M5, re-fetches whenever the filter changes, and exposes a manual `refresh()`. Tests mock the `api` module so no network/Supabase is touched.

- [ ] **Step 1: Write the failing test.** Create `src/features/transactions/useTransactions.test.tsx`:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useTransactions } from './useTransactions';
import type { Transaction } from '../../types';

// Mock the M5 api module: useTransactions must call listTransactions only.
jest.mock('./api', () => ({
  listTransactions: jest.fn(),
}));
import { listTransactions } from './api';
const mockList = listTransactions as jest.MockedFunction<typeof listTransactions>;

function tx(id: string): Transaction {
  return {
    id,
    user_id: 'u1',
    type: 'expense',
    amount: 10,
    currency: 'EGP',
    category_slug: 'food',
    note: null,
    raw_text: null,
    source: 'text',
    status: 'confirmed',
    confidence: null,
    occurred_at: '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:00.000Z',
  };
}

describe('useTransactions', () => {
  beforeEach(() => mockList.mockReset());

  it('starts loading, then resolves with data', async () => {
    mockList.mockResolvedValueOnce([tx('a'), tx('b')]);
    const filter = { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' };

    const { result } = renderHook(() => useTransactions(filter));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.map((t) => t.id)).toEqual(['a', 'b']);
    expect(mockList).toHaveBeenCalledWith(filter);
  });

  it('refetches when the filter changes', async () => {
    mockList.mockResolvedValue([tx('a')]);
    const { result, rerender } = renderHook(
      ({ f }) => useTransactions(f),
      { initialProps: { f: { category_slug: 'food' } as const } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(1);

    rerender({ f: { category_slug: 'transport' } as const });
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(mockList).toHaveBeenLastCalledWith({ category_slug: 'transport' });
  });

  it('refresh() re-invokes listTransactions', async () => {
    mockList.mockResolvedValue([tx('a')]);
    const { result } = renderHook(() => useTransactions({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockList).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
```bash
npx jest src/features/transactions/useTransactions.test.tsx
```
Expected: FAIL — `Cannot find module './useTransactions'`.

- [ ] **Step 3: Implement.** Create `src/features/transactions/useTransactions.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { listTransactions, type TransactionFilter } from './api';
import type { Transaction } from '../../types';

export interface UseTransactionsResult {
  data: Transaction[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Loads transactions for `filter` and re-fetches whenever the filter's serialized
 * shape changes. The filter is serialized to a stable key so callers can pass a
 * fresh object literal each render without causing an infinite loop.
 */
export function useTransactions(filter: TransactionFilter): UseTransactionsResult {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest filter in a ref so refresh() uses current values without
  // being part of its dependency list.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTransactions(filterRef.current);
      setData(rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Stable dependency: only re-run when the meaningful filter fields change.
  const filterKey = JSON.stringify(filter);
  useEffect(() => {
    void refresh();
    // refresh is stable (empty deps); filterKey captures the filter contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return { data, loading, error, refresh };
}
```

- [ ] **Step 4: Run — expect PASS.**
```bash
npx jest src/features/transactions/useTransactions.test.tsx
```
Expected: PASS — `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Commit.**
```bash
git add src/features/transactions/useTransactions.ts src/features/transactions/useTransactions.test.tsx
git commit -m "feat(transactions): add useTransactions(filter) loading hook with tests"
```

---

### Task 6.4: `useMonthSummary()` hook

**Files:**
- Create: `src/features/dashboard/useMonthSummary.ts`
- Test: `src/features/dashboard/useMonthSummary.test.tsx`

Loads the current month's **confirmed** transactions (via `useTransactions` + `monthRange`) and folds them through `summarize()`. Also exposes month navigation (`monthKey`, `prevMonth`, `nextMonth`) so the Dashboard can show prior months. Returns the raw `transactions` too so the Dashboard can render "recent 5" without a second query.

- [ ] **Step 1: Write the failing test.** Create `src/features/dashboard/useMonthSummary.test.tsx`:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useMonthSummary } from './useMonthSummary';
import type { Transaction } from '../../types';

jest.mock('../transactions/api', () => ({
  listTransactions: jest.fn(),
}));
import { listTransactions } from '../transactions/api';
const mockList = listTransactions as jest.MockedFunction<typeof listTransactions>;

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: over.id ?? 'id',
    user_id: 'u1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 0,
    currency: 'EGP',
    category_slug: over.category_slug ?? 'food',
    note: null,
    raw_text: null,
    source: 'text',
    status: 'confirmed',
    confidence: null,
    occurred_at: over.occurred_at ?? '2026-06-10T00:00:00.000Z',
    created_at: '2026-06-10T00:00:00.000Z',
  };
}

describe('useMonthSummary', () => {
  beforeEach(() => mockList.mockReset());

  it('summarizes the loaded month and requests a confirmed-only month range', async () => {
    mockList.mockResolvedValueOnce([
      tx({ id: 'a', type: 'income', amount: 1000, category_slug: 'salary' }),
      tx({ id: 'b', type: 'expense', amount: 250, category_slug: 'food' }),
    ]);

    const { result } = renderHook(() =>
      useMonthSummary({ year: 2026, month: 5 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toEqual({
      income: 1000,
      expense: 250,
      net: 750,
      byCategory: [
        { slug: 'salary', total: 1000 },
        { slug: 'food', total: 250 },
      ],
    });
    // Confirmed-only, June 2026 half-open range.
    expect(mockList).toHaveBeenCalledWith({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
      status: 'confirmed',
    });
  });

  it('navigates to the previous month and re-queries', async () => {
    mockList.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useMonthSummary({ year: 2026, month: 5 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.prevMonth());

    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
        status: 'confirmed',
      })
    );
    expect(result.current.monthKey).toEqual({ year: 2026, month: 4 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
```bash
npx jest src/features/dashboard/useMonthSummary.test.tsx
```
Expected: FAIL — `Cannot find module './useMonthSummary'`.

- [ ] **Step 3: Implement.** Create `src/features/dashboard/useMonthSummary.ts`:

```ts
import { useCallback, useMemo, useState } from 'react';
import { useTransactions } from '../transactions/useTransactions';
import { summarize, type Summary } from './summary';
import { monthRange, addMonth, currentMonthKey, type MonthKey } from './monthRange';
import type { Transaction } from '../../types';

export interface UseMonthSummaryResult {
  monthKey: MonthKey;
  summary: Summary;
  transactions: Transaction[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  prevMonth: () => void;
  nextMonth: () => void;
}

/**
 * Loads the given month's confirmed transactions and folds them through
 * summarize(). `initialMonth` defaults to the current calendar month.
 */
export function useMonthSummary(initialMonth?: MonthKey): UseMonthSummaryResult {
  const [monthKey, setMonthKey] = useState<MonthKey>(
    () => initialMonth ?? currentMonthKey()
  );

  const filter = useMemo(() => {
    const { from, to } = monthRange(monthKey);
    return { from, to, status: 'confirmed' as const };
  }, [monthKey]);

  const { data, loading, error, refresh } = useTransactions(filter);

  const summary = useMemo(() => summarize(data), [data]);

  const prevMonth = useCallback(() => setMonthKey((k) => addMonth(k, -1)), []);
  const nextMonth = useCallback(() => setMonthKey((k) => addMonth(k, 1)), []);

  return {
    monthKey,
    summary,
    transactions: data,
    loading,
    error,
    refresh,
    prevMonth,
    nextMonth,
  };
}
```

- [ ] **Step 4: Run — expect PASS.**
```bash
npx jest src/features/dashboard/useMonthSummary.test.tsx
```
Expected: PASS — `Tests: 2 passed, 2 total`.

- [ ] **Step 5: Commit.**
```bash
git add src/features/dashboard/useMonthSummary.ts src/features/dashboard/useMonthSummary.test.tsx
git commit -m "feat(dashboard): add useMonthSummary hook (month nav + summarize) with tests"
```

---

### Task 6.5: Shared presentational helpers (`categoryLabel`, `formatAmount`)

**Files:**
- Create: `src/features/transactions/display.ts`
- Test: `src/features/transactions/display.test.ts`

Pure helpers shared by both screens: resolve a bilingual category label from a slug + locale (falls back to the raw slug for unknown slugs), and format an EGP amount. Keeping these pure lets us unit-test the bilingual logic once instead of in two render tests.

- [ ] **Step 1: Write the failing test.** Create `src/features/transactions/display.test.ts`:

```ts
import { categoryLabel, formatAmount } from './display';

describe('categoryLabel', () => {
  it('returns the English name for a known slug in en', () => {
    expect(categoryLabel('food', 'en')).toBe('Food & Drink');
  });

  it('returns the Arabic name for a known slug in ar', () => {
    expect(categoryLabel('food', 'ar')).toBe('طعام وشراب');
  });

  it('falls back to the slug for an unknown category', () => {
    expect(categoryLabel('nonexistent_slug', 'en')).toBe('nonexistent_slug');
  });
});

describe('formatAmount', () => {
  it('formats a whole number with two decimals and EGP', () => {
    expect(formatAmount(50, 'en')).toBe('50.00 EGP');
  });

  it('formats with the Arabic currency token in ar', () => {
    expect(formatAmount(50, 'ar')).toBe('50.00 ج.م');
  });
});
```

> The exact English/Arabic strings above (`'Food & Drink'` / `'طعام وشراب'`) come from M2's seeded `food` category (`name_en` / `name_ar`). If M2's seed text differs, update these two assertions to match the seed — the seed is the source of truth.

- [ ] **Step 2: Run — expect FAIL.**
```bash
npx jest src/features/transactions/display.test.ts
```
Expected: FAIL — `Cannot find module './display'`.

- [ ] **Step 3: Implement.** Create `src/features/transactions/display.ts`:

```ts
import { categoryBySlug } from '../../lib/categories';
import type { Locale } from '../../types';

/**
 * Bilingual label for a category slug. Unknown slugs (e.g. a category we removed)
 * degrade gracefully to the raw slug so the row is still readable.
 */
export function categoryLabel(slug: string, locale: Locale): string {
  const cat = categoryBySlug(slug);
  if (!cat) return slug;
  return locale === 'ar' ? cat.name_ar : cat.name_en;
}

/** EGP amount formatted to two decimals with a locale-appropriate currency token. */
export function formatAmount(amount: number, locale: Locale): string {
  const token = locale === 'ar' ? 'ج.م' : 'EGP';
  return `${amount.toFixed(2)} ${token}`;
}
```

- [ ] **Step 4: Run — expect PASS.**
```bash
npx jest src/features/transactions/display.test.ts
```
Expected: PASS — `Tests: 5 passed, 5 total`.

- [ ] **Step 5: Commit.**
```bash
git add src/features/transactions/display.ts src/features/transactions/display.test.ts
git commit -m "feat(transactions): add pure categoryLabel/formatAmount display helpers with tests"
```

---

### Task 6.6: Dashboard screen `app/(tabs)/index.tsx`

**Files:**
- Modify (replace M3 stub): `app/(tabs)/index.tsx`
- Test: `app/(tabs)/__tests__/dashboard.test.tsx`

Replaces the M3 placeholder with the real Dashboard: a month navigator, the big net number, income-vs-expense cards, the by-category breakdown (bilingual labels via `categoryLabel`), and a "recent 5" transactions list. Uses `useMonthSummary` for data and `useSession` for the active locale. RTL is handled per-locale via `isRTL(profile.locale)` (the in-app toggle drives UI direction; we do not rely on the global `I18nManager` flag).

- [ ] **Step 1: Write the failing render test.** Create `app/(tabs)/__tests__/dashboard.test.tsx`. It seeds `useMonthSummary` and `useSession` via mocks and asserts the seeded data renders with the correct bilingual labels.

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Dashboard from '../index';
import type { Transaction } from '../../../src/types';

// --- mock data hooks/session so the screen renders deterministically ---
jest.mock('../../../src/features/dashboard/useMonthSummary', () => ({
  useMonthSummary: jest.fn(),
}));
jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

import { useMonthSummary } from '../../../src/features/dashboard/useMonthSummary';
import { useSession } from '../../../src/features/auth/SessionProvider';

const mockSummary = useMonthSummary as jest.Mock;
const mockSession = useSession as jest.Mock;

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: over.id ?? 'id',
    user_id: 'u1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 0,
    currency: 'EGP',
    category_slug: over.category_slug ?? 'food',
    note: over.note ?? null,
    raw_text: null,
    source: 'text',
    status: 'confirmed',
    confidence: null,
    occurred_at: over.occurred_at ?? '2026-06-10T00:00:00.000Z',
    created_at: '2026-06-10T00:00:00.000Z',
  };
}

beforeEach(() => {
  mockSession.mockReturnValue({
    session: { user: { id: 'u1' } },
    user: { id: 'u1' },
    profile: { id: 'u1', locale: 'en', display_name: 'Test', currency: 'EGP' },
    loading: false,
  });
  mockSummary.mockReturnValue({
    monthKey: { year: 2026, month: 5 },
    summary: {
      income: 1000,
      expense: 250,
      net: 750,
      byCategory: [
        { slug: 'salary', total: 1000 },
        { slug: 'food', total: 250 },
      ],
    },
    transactions: [
      tx({ id: 'a', type: 'income', amount: 1000, category_slug: 'salary', note: 'June pay' }),
      tx({ id: 'b', type: 'expense', amount: 250, category_slug: 'food', note: 'lunch' }),
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
    prevMonth: jest.fn(),
    nextMonth: jest.fn(),
  });
});

describe('Dashboard', () => {
  it('renders the net amount, totals, and bilingual category breakdown (en)', () => {
    render(<Dashboard />);
    // Net big number.
    expect(screen.getByText('750.00 EGP')).toBeTruthy();
    // Income & expense totals.
    expect(screen.getByText('1000.00 EGP')).toBeTruthy();
    expect(screen.getByText('250.00 EGP')).toBeTruthy();
    // By-category breakdown uses English labels (locale = en).
    expect(screen.getByText('Food & Drink')).toBeTruthy();
    expect(screen.getByText('Salary')).toBeTruthy();
    // Recent transactions show notes.
    expect(screen.getByText('lunch')).toBeTruthy();
    expect(screen.getByText('June pay')).toBeTruthy();
  });

  it('renders Arabic category labels when locale = ar', () => {
    mockSession.mockReturnValue({
      session: { user: { id: 'u1' } },
      user: { id: 'u1' },
      profile: { id: 'u1', locale: 'ar', display_name: 'Test', currency: 'EGP' },
      loading: false,
    });
    render(<Dashboard />);
    expect(screen.getByText('طعام وشراب')).toBeTruthy();
  });

  it('shows the empty state when there are no transactions', () => {
    mockSummary.mockReturnValue({
      monthKey: { year: 2026, month: 5 },
      summary: { income: 0, expense: 0, net: 0, byCategory: [] },
      transactions: [],
      loading: false,
      error: null,
      refresh: jest.fn(),
      prevMonth: jest.fn(),
      nextMonth: jest.fn(),
    });
    render(<Dashboard />);
    // i18n 'no_transactions' string (en). Adjust if M3's STRINGS differs.
    expect(screen.getByText('No transactions yet')).toBeTruthy();
  });
});
```

> The English assertions `'Salary'` / `'No transactions yet'` mirror M2's `salary` seed `name_en` and M3's `STRINGS.en.no_transactions`. If those differ, align the assertions to the source files.

- [ ] **Step 2: Run — expect FAIL.**
```bash
npx jest "app/(tabs)/__tests__/dashboard.test.tsx"
```
Expected: FAIL — the current `app/(tabs)/index.tsx` is the M3 stub (`<Text>Home</Text>`), so the seeded strings are not found.

- [ ] **Step 3: Implement the Dashboard.** Replace `app/(tabs)/index.tsx` with exactly:

```tsx
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMonthSummary } from '../../src/features/dashboard/useMonthSummary';
import { useSession } from '../../src/features/auth/SessionProvider';
import { categoryLabel, formatAmount } from '../../src/features/transactions/display';
import { t, isRTL } from '../../src/lib/i18n';
import type { Locale } from '../../src/types';

const MONTH_LABELS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_LABELS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function monthLabel(month: number, locale: Locale): string {
  return locale === 'ar' ? MONTH_LABELS_AR[month] : MONTH_LABELS_EN[month];
}

export default function Dashboard() {
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';

  const { monthKey, summary, transactions, loading, prevMonth, nextMonth } =
    useMonthSummary();

  const recent = transactions.slice(0, 5);

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ direction: dir }}>
      <ScrollView contentContainerClassName="p-4 gap-4">
        {/* Month navigator */}
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('prev_month', locale)}
            onPress={prevMonth}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-base text-gray-700">{rtl ? '›' : '‹'}</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-gray-900">
            {monthLabel(monthKey.month, locale)} {monthKey.year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('next_month', locale)}
            onPress={nextMonth}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-base text-gray-700">{rtl ? '‹' : '›'}</Text>
          </Pressable>
        </View>

        {/* Net big number */}
        <View className="items-center py-4">
          <Text className="text-sm text-gray-500">{t('net_this_month', locale)}</Text>
          <Text
            className={`text-4xl font-bold ${summary.net >= 0 ? 'text-green-600' : 'text-red-600'}`}
            style={{ writingDirection: dir }}
          >
            {formatAmount(summary.net, locale)}
          </Text>
        </View>

        {/* Income vs expense */}
        <View className="flex-row gap-3">
          <View className="flex-1 rounded-xl bg-green-50 p-4">
            <Text className="text-xs text-green-700">{t('income', locale)}</Text>
            <Text className="mt-1 text-lg font-semibold text-green-700">
              {formatAmount(summary.income, locale)}
            </Text>
          </View>
          <View className="flex-1 rounded-xl bg-red-50 p-4">
            <Text className="text-xs text-red-700">{t('expense', locale)}</Text>
            <Text className="mt-1 text-lg font-semibold text-red-700">
              {formatAmount(summary.expense, locale)}
            </Text>
          </View>
        </View>

        {/* By category */}
        <View className="gap-2">
          <Text className="text-base font-semibold text-gray-900">
            {t('by_category', locale)}
          </Text>
          {summary.byCategory.length === 0 && !loading ? (
            <Text className="text-sm text-gray-400">{t('no_transactions', locale)}</Text>
          ) : (
            summary.byCategory.map((row) => (
              <View
                key={row.slug}
                className="flex-row items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
              >
                <Text className="text-sm text-gray-800">
                  {categoryLabel(row.slug, locale)}
                </Text>
                <Text className="text-sm font-medium text-gray-900" style={{ writingDirection: dir }}>
                  {formatAmount(row.total, locale)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Recent transactions */}
        <View className="gap-2">
          <Text className="text-base font-semibold text-gray-900">
            {t('recent', locale)}
          </Text>
          {recent.length === 0 ? (
            <Text className="text-sm text-gray-400">{t('no_transactions', locale)}</Text>
          ) : (
            recent.map((txn) => (
              <View
                key={txn.id}
                className="flex-row items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
              >
                <View className="flex-shrink">
                  <Text className="text-sm font-medium text-gray-900">
                    {categoryLabel(txn.category_slug, locale)}
                  </Text>
                  {txn.note ? (
                    <Text className="text-xs text-gray-500">{txn.note}</Text>
                  ) : null}
                </View>
                <Text
                  className={`text-sm font-semibold ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}
                  style={{ writingDirection: dir }}
                >
                  {txn.type === 'income' ? '+' : '-'}
                  {formatAmount(txn.amount, locale)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run — expect PASS.**
```bash
npx jest "app/(tabs)/__tests__/dashboard.test.tsx"
```
Expected: PASS — `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Commit.**
```bash
git add "app/(tabs)/index.tsx" "app/(tabs)/__tests__/dashboard.test.tsx"
git commit -m "feat(dashboard): build Dashboard screen (net, income/expense, breakdown, recent) with render test"
```

---

### Task 6.7: Transactions list screen `app/(tabs)/transactions.tsx`

**Files:**
- Create: `src/features/transactions/EditTransactionSheet.tsx`
- Create: `src/features/transactions/EditTransactionSheet.test.tsx`
- Modify (replace M3 stub): `app/(tabs)/transactions.tsx`
- Test: `app/(tabs)/__tests__/transactions.test.tsx`

Replaces the M3 placeholder with the real list: a month navigator + category filter, a `FlatList` of rows (bilingual labels, RTL-aware), each row tappable to open an edit/delete sheet. Edits go through `updateTransaction` (M5), deletes through `deleteTransaction` (M5), then `refresh()` re-queries.

- [ ] **Step 1: Write the failing test for `EditTransactionSheet`.** Create `src/features/transactions/EditTransactionSheet.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { EditTransactionSheet } from './EditTransactionSheet';
import type { Transaction } from '../../types';

jest.mock('./api', () => ({
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));
import { updateTransaction, deleteTransaction } from './api';
const mockUpdate = updateTransaction as jest.MockedFunction<typeof updateTransaction>;
const mockDelete = deleteTransaction as jest.MockedFunction<typeof deleteTransaction>;

const txn: Transaction = {
  id: 't1',
  user_id: 'u1',
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  raw_text: null,
  source: 'text',
  status: 'confirmed',
  confidence: null,
  occurred_at: '2026-06-10T00:00:00.000Z',
  created_at: '2026-06-10T00:00:00.000Z',
};

describe('EditTransactionSheet', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  it('saves an edited amount via updateTransaction then calls onDone', async () => {
    mockUpdate.mockResolvedValueOnce({ ...txn, amount: 75 });
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );

    fireEvent.changeText(screen.getByTestId('edit-amount'), '75');
    fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: 75 })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('deletes via deleteTransaction then calls onDone', async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );

    fireEvent.press(screen.getByTestId('edit-delete'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('cancel calls onCancel without touching the api', () => {
    const onCancel = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={jest.fn()} onCancel={onCancel} />
    );
    fireEvent.press(screen.getByTestId('edit-cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
```bash
npx jest src/features/transactions/EditTransactionSheet.test.tsx
```
Expected: FAIL — `Cannot find module './EditTransactionSheet'`.

- [ ] **Step 3: Implement `EditTransactionSheet`.** Create `src/features/transactions/EditTransactionSheet.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { updateTransaction, deleteTransaction } from './api';
import { categoryLabel } from './display';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { t, isRTL } from '../../lib/i18n';
import type { Transaction, TxnType, Locale } from '../../types';

interface Props {
  transaction: Transaction;
  locale: Locale;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Editable sheet for a single transaction: type / amount / category / note,
 * with Save (updateTransaction), Delete (deleteTransaction), and Cancel.
 * Parent re-queries via its own refresh() inside onDone.
 */
export function EditTransactionSheet({ transaction, locale, onDone, onCancel }: Props) {
  const rtl = isRTL(locale);
  const [type, setType] = useState<TxnType>(transaction.type);
  const [amount, setAmount] = useState<string>(String(transaction.amount));
  const [categorySlug, setCategorySlug] = useState<string>(transaction.category_slug);
  const [note, setNote] = useState<string>(transaction.note ?? '');
  const [busy, setBusy] = useState(false);

  const cats = type === 'income' ? incomeCategories() : expenseCategories();

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    try {
      const parsed = parseFloat(amount);
      await updateTransaction(transaction.id, {
        type,
        amount: Number.isFinite(parsed) ? parsed : 0,
        category_slug: categorySlug,
        note: note.trim() === '' ? null : note.trim(),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteTransaction(transaction.id);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="bg-white rounded-t-2xl p-4 gap-4" style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      {/* Type toggle */}
      <View className="flex-row gap-2">
        {(['expense', 'income'] as TxnType[]).map((ty) => (
          <Pressable
            key={ty}
            testID={`edit-type-${ty}`}
            onPress={() => {
              setType(ty);
              const next = ty === 'income' ? incomeCategories() : expenseCategories();
              if (!next.some((c) => c.slug === categorySlug)) {
                setCategorySlug(next[0]?.slug ?? categorySlug);
              }
            }}
            className={`flex-1 rounded-lg px-3 py-2 ${type === ty ? 'bg-gray-900' : 'bg-gray-100'}`}
          >
            <Text className={`text-center ${type === ty ? 'text-white' : 'text-gray-700'}`}>
              {t(ty, locale)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Amount */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('amount', locale)}</Text>
        <TextInput
          testID="edit-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          className="rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
          style={{ textAlign: rtl ? 'right' : 'left' }}
        />
      </View>

      {/* Category */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('by_category', locale)}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {cats.map((c) => (
            <Pressable
              key={c.slug}
              testID={`edit-cat-${c.slug}`}
              onPress={() => setCategorySlug(c.slug)}
              className={`rounded-full px-3 py-2 ${categorySlug === c.slug ? 'bg-gray-900' : 'bg-gray-100'}`}
            >
              <Text className={categorySlug === c.slug ? 'text-white' : 'text-gray-700'}>
                {categoryLabel(c.slug, locale)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Note */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('note', locale)}</Text>
        <TextInput
          testID="edit-note"
          value={note}
          onChangeText={setNote}
          className="rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
          style={{ textAlign: rtl ? 'right' : 'left' }}
        />
      </View>

      {/* Actions */}
      <View className="flex-row gap-2 pt-2">
        <Pressable
          testID="edit-cancel"
          onPress={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg bg-gray-100 px-3 py-3"
        >
          <Text className="text-center text-gray-700">{t('cancel', locale)}</Text>
        </Pressable>
        <Pressable
          testID="edit-delete"
          onPress={handleDelete}
          disabled={busy}
          className="flex-1 rounded-lg bg-red-50 px-3 py-3"
        >
          <Text className="text-center text-red-600">{t('delete', locale)}</Text>
        </Pressable>
        <Pressable
          testID="edit-save"
          onPress={handleSave}
          disabled={busy}
          className="flex-1 rounded-lg bg-gray-900 px-3 py-3"
        >
          <Text className="text-center text-white">{t('save', locale)}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

> Uses i18n keys `expense` / `income` as the type-toggle labels (M3's `STRINGS` already needs these for capture; confirm they exist).

- [ ] **Step 4: Run — expect PASS.**
```bash
npx jest src/features/transactions/EditTransactionSheet.test.tsx
```
Expected: PASS — `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Write the failing test for the screen.** Create `app/(tabs)/__tests__/transactions.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import TransactionsScreen from '../transactions';
import type { Transaction } from '../../../src/types';

jest.mock('../../../src/features/transactions/api', () => ({
  listTransactions: jest.fn(),
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));
jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

import { listTransactions, deleteTransaction } from '../../../src/features/transactions/api';
import { useSession } from '../../../src/features/auth/SessionProvider';

const mockList = listTransactions as jest.Mock;
const mockDelete = deleteTransaction as jest.Mock;
const mockSession = useSession as jest.Mock;

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: over.id ?? 'id',
    user_id: 'u1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 0,
    currency: 'EGP',
    category_slug: over.category_slug ?? 'food',
    note: over.note ?? null,
    raw_text: null,
    source: 'text',
    status: 'confirmed',
    confidence: null,
    occurred_at: over.occurred_at ?? '2026-06-10T00:00:00.000Z',
    created_at: '2026-06-10T00:00:00.000Z',
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockDelete.mockReset();
  mockSession.mockReturnValue({
    session: { user: { id: 'u1' } },
    user: { id: 'u1' },
    profile: { id: 'u1', locale: 'en', display_name: 'Test', currency: 'EGP' },
    loading: false,
  });
});

describe('TransactionsScreen', () => {
  it('lists transactions with bilingual labels', async () => {
    mockList.mockResolvedValue([
      tx({ id: 'a', category_slug: 'food', note: 'lunch', amount: 50 }),
      tx({ id: 'b', category_slug: 'transport', note: 'uber', amount: 30 }),
    ]);
    render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('Food & Drink')).toBeTruthy());
    expect(screen.getByText('Transport')).toBeTruthy();
    expect(screen.getByText('lunch')).toBeTruthy();
  });

  it('opens the edit sheet on row press and deletes a row, then re-queries', async () => {
    mockList.mockResolvedValue([tx({ id: 'a', category_slug: 'food', note: 'lunch', amount: 50 })]);
    mockDelete.mockResolvedValue(undefined);
    render(<TransactionsScreen />);

    await waitFor(() => expect(screen.getByText('lunch')).toBeTruthy());
    fireEvent.press(screen.getByTestId('txn-row-a'));

    // Edit sheet is open -> delete.
    fireEvent.press(await screen.findByTestId('edit-delete'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('a'));
    // After delete, the list is refreshed (listTransactions called again).
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('shows the empty state when there are no transactions', async () => {
    mockList.mockResolvedValue([]);
    render(<TransactionsScreen />);
    await waitFor(() => expect(screen.getByText('No transactions yet')).toBeTruthy());
  });
});
```

- [ ] **Step 6: Run — expect FAIL.**
```bash
npx jest "app/(tabs)/__tests__/transactions.test.tsx"
```
Expected: FAIL — the current `app/(tabs)/transactions.tsx` is the M3 stub (`<Text>Transactions</Text>`).

- [ ] **Step 7: Implement the screen.** Replace `app/(tabs)/transactions.tsx` with exactly:

```tsx
import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions } from '../../src/features/transactions/useTransactions';
import { EditTransactionSheet } from '../../src/features/transactions/EditTransactionSheet';
import { categoryLabel, formatAmount } from '../../src/features/transactions/display';
import { CATEGORIES } from '../../src/lib/categories';
import { useSession } from '../../src/features/auth/SessionProvider';
import { monthRange, addMonth, currentMonthKey, type MonthKey } from '../../src/features/dashboard/monthRange';
import { t, isRTL } from '../../src/lib/i18n';
import type { Transaction, Locale } from '../../src/types';

const MONTH_LABELS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_LABELS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function monthLabel(month: number, locale: Locale): string {
  return locale === 'ar' ? MONTH_LABELS_AR[month] : MONTH_LABELS_EN[month];
}

export default function TransactionsScreen() {
  const { profile } = useSession();
  const locale: Locale = profile?.locale ?? 'en';
  const rtl = isRTL(locale);
  const dir = rtl ? 'rtl' : 'ltr';

  const [monthKey, setMonthKey] = useState<MonthKey>(() => currentMonthKey());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const filter = useMemo(() => {
    const { from, to } = monthRange(monthKey);
    return {
      from,
      to,
      status: 'confirmed' as const,
      ...(categoryFilter ? { category_slug: categoryFilter } : {}),
    };
  }, [monthKey, categoryFilter]);

  const { data, loading, refresh } = useTransactions(filter);

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ direction: dir }}>
      <View className="p-4 gap-3">
        <Text className="text-xl font-bold text-gray-900">{t('transactions_title', locale)}</Text>

        {/* Month navigator */}
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('prev_month', locale)}
            onPress={() => setMonthKey((k) => addMonth(k, -1))}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-gray-700">{rtl ? '›' : '‹'}</Text>
          </Pressable>
          <Text className="text-base font-semibold text-gray-900">
            {monthLabel(monthKey.month, locale)} {monthKey.year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('next_month', locale)}
            onPress={() => setMonthKey((k) => addMonth(k, 1))}
            className="px-3 py-2 rounded-lg bg-gray-100"
          >
            <Text className="text-gray-700">{rtl ? '‹' : '›'}</Text>
          </Pressable>
        </View>

        {/* Category filter */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ slug: null as string | null, label: t('all_categories', locale) }, ...CATEGORIES.map((c) => ({ slug: c.slug, label: categoryLabel(c.slug, locale) }))]}
          keyExtractor={(item) => item.slug ?? '__all__'}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const active = categoryFilter === item.slug;
            return (
              <Pressable
                testID={`filter-${item.slug ?? 'all'}`}
                onPress={() => setCategoryFilter(item.slug)}
                className={`rounded-full px-3 py-2 ${active ? 'bg-gray-900' : 'bg-gray-100'}`}
              >
                <Text className={active ? 'text-white' : 'text-gray-700'}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        ListEmptyComponent={
          loading ? null : (
            <Text className="text-center text-sm text-gray-400 mt-8">
              {t('no_transactions', locale)}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`txn-row-${item.id}`}
            onPress={() => setEditing(item)}
            className="flex-row items-center justify-between rounded-lg border border-gray-100 px-3 py-3"
          >
            <View className="flex-shrink">
              <Text className="text-sm font-medium text-gray-900">
                {categoryLabel(item.category_slug, locale)}
              </Text>
              {item.note ? <Text className="text-xs text-gray-500">{item.note}</Text> : null}
            </View>
            <Text
              className={`text-sm font-semibold ${item.type === 'income' ? 'text-green-600' : 'text-red-600'}`}
              style={{ writingDirection: dir }}
            >
              {item.type === 'income' ? '+' : '-'}
              {formatAmount(item.amount, locale)}
            </Text>
          </Pressable>
        )}
      />

      {/* Edit/delete sheet */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setEditing(null)}>
          <Pressable onPress={() => {}}>
            {editing ? (
              <EditTransactionSheet
                transaction={editing}
                locale={locale}
                onCancel={() => setEditing(null)}
                onDone={() => {
                  setEditing(null);
                  void refresh();
                }}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
```

- [ ] **Step 8: Run — expect PASS.**
```bash
npx jest "app/(tabs)/__tests__/transactions.test.tsx"
```
Expected: PASS — `Tests: 3 passed, 3 total`.

> If the `Modal` content does not mount in the jest-expo environment (RN `Modal` sometimes renders to a portal that the query root sees fine, but verify), and `findByTestId('edit-delete')` times out, set `<Modal>` `presentationStyle` aside and confirm `@testing-library/react-native` v13+ queries through modals by default (it does). No code change should be needed.

- [ ] **Step 9: Commit.**
```bash
git add "app/(tabs)/transactions.tsx" "app/(tabs)/__tests__/transactions.test.tsx" src/features/transactions/EditTransactionSheet.tsx src/features/transactions/EditTransactionSheet.test.tsx
git commit -m "feat(transactions): build filterable list screen with edit/delete sheet and render tests"
```

---

### Task 6.8: Full milestone verification

**Files:** (none created — verification only)

- [ ] **Step 1: Run the entire test suite.**
```bash
npx jest
```
Expected: PASS — all M6 suites green (`summary`, `monthRange`, `useTransactions`, `useMonthSummary`, `display`, `dashboard`, `EditTransactionSheet`, `transactions`) alongside the suites from M1–M5. Confirm zero failures.

- [ ] **Step 2: Type-check the project.**
```bash
npx tsc --noEmit
```
Expected: PASS — no type errors. In particular, confirm `TransactionFilter` is imported from `src/features/transactions/api.ts` and matches the `{ from?, to?, category_slug?, status? }` shape M6 passes.

- [ ] **Step 3: Lint (if M1 configured ESLint).**
```bash
npx expo lint
```
Expected: PASS (or no new warnings introduced by M6).

- [ ] **Step 4: Final commit (only if Steps 1-3 produced fixups).**
```bash
git add -A
git commit -m "chore(m6): verify dashboard + transactions list slice (tests, types, lint)"
```
