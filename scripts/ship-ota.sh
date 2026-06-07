#!/usr/bin/env bash
#
# ship-ota.sh — push a JS/asset feature to YOUR phone over-the-air, on the
# 'preview' channel. FREE (not an EAS build, no build credits) and it does NOT
# touch production / App Store users (that's the 'production' channel).
#
# Bakes the PROD Supabase env (from eas.json) into the update bundle, since your
# personal build runs on real data. Only works for JS/asset changes — a NEW
# native module needs a rebuild (npm run build:my-app).
#
# Usage:
#   npm run ship -- "what changed"
#   ./scripts/ship-ota.sh "what changed"
#
set -eo pipefail
cd "$(dirname "$0")/.."

MSG="$*"
[ -z "$MSG" ] && MSG="update"

URL=$(node -e "process.stdout.write(require('./eas.json').build.production.env.EXPO_PUBLIC_SUPABASE_URL || '')")
ANON=$(node -e "process.stdout.write(require('./eas.json').build.production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '')")
if [ -z "$URL" ] || [ -z "$ANON" ]; then
  echo "✗ Could not read prod env from eas.json (build.production.env). Aborting." >&2
  exit 1
fi

# The OTA bundle inlines EXPO_PUBLIC_* at publish time — force prod (not the LAN .env).
export EXPO_PUBLIC_SUPABASE_URL="$URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON"

echo "▸ OTA → 'preview' channel (your phone) · prod Supabase"
echo "    message : \"$MSG\""
echo "    free — not an EAS build; does NOT affect production / App Store users"
echo

exec npx eas-cli update --branch preview --platform ios --message "$MSG" --non-interactive
