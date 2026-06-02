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
