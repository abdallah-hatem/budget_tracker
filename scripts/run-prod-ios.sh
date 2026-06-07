#!/usr/bin/env bash
#
# run-prod-ios.sh — build + install a PRODUCTION Masareef build on a connected
# iPhone, locally (your Xcode toolchain), with NO EAS / no build credits.
#
# It bakes the PROD Supabase env (read from eas.json → build.production.env) into
# the JS bundle and builds the Release configuration so the app runs standalone
# (no Metro / laptop needed once installed).
#
#   ⚠️  This points at the LIVE production database (your real account + data).
#
# One-time setup: open ios/Masareef.xcworkspace and enable "Automatically manage
# signing" with your PAID team on BOTH the app target and MasareefWidget (the
# widget's App Group needs a paid team).
#
# Usage:
#   ./scripts/run-prod-ios.sh                 # confirm, then build to the device
#   ./scripts/run-prod-ios.sh -y              # skip the confirmation
#   ./scripts/run-prod-ios.sh -y --device ID  # extra flags pass through to expo
#   npm run build:prod:device -- -y           # via npm
#
set -eo pipefail

# Always run from the repo root (this script lives in scripts/).
cd "$(dirname "$0")/.."

SKIP_CONFIRM=0
EXTRA=()
for arg in "$@"; do
  case "$arg" in
    -y|--yes) SKIP_CONFIRM=1 ;;
    *) EXTRA+=("$arg") ;;
  esac
done

# Single source of truth for prod values: eas.json.
URL=$(node -e "process.stdout.write(require('./eas.json').build.production.env.EXPO_PUBLIC_SUPABASE_URL || '')")
ANON=$(node -e "process.stdout.write(require('./eas.json').build.production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '')")

if [ -z "$URL" ] || [ -z "$ANON" ]; then
  echo "✗ Could not read prod env from eas.json (build.production.env). Aborting." >&2
  exit 1
fi

echo "▸ PRODUCTION iOS build — local Xcode, no EAS"
echo "    Supabase : $URL   (anon key: ${#ANON} chars)"
echo "    Config   : Release  ·  Target: connected device"
echo "    ⚠️  Hits the LIVE production database (real data)."
echo

if [ "$SKIP_CONFIRM" -ne 1 ]; then
  printf "Continue? [y/N] "
  read -r reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

# Inline the prod env so expo's Xcode bundle phase inlines it into EXPO_PUBLIC_*.
export EXPO_PUBLIC_SUPABASE_URL="$URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON"

echo "▸ Building… (first run installs CocoaPods + compiles natively — a few minutes)"
npx expo run:ios --device --configuration Release "${EXTRA[@]}"

echo
echo "✓ Done. Sanity-check the bundle points at prod (should be > 0, with no LAN IP):"
echo "    grep -rc 'pzyadiwfjmjsafssxshc' ios/build 2>/dev/null"
