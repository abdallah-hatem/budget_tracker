#!/usr/bin/env bash
# Masareef app icon — FINAL (chosen: D2). Emerald coin with the M as dark
# negative space, on the Midnight-Emerald dark canvas. Flat for the app icon,
# soft-glow for the splash. Writes every asset slot.
set -euo pipefail
cd "$(dirname "$0")/.."
S=1024; OUT=.icon-gen; mkdir -p "$OUT"

CANVAS='#0B0F0E'
GRAD='gradient:#3FE0A0-#16B877'   # emerald coin fill (light mint -> emerald)
mpoly="stroke-linecap round stroke-linejoin round polyline 412,624 412,416 512,520 612,416 612,624"

bgdark() { magick -size ${S}x${S} radial-gradient:'#11201B'-'#0A0D0C' "$1"; }

# Coin mask: white disc with the M carved out (black stroke), then -> emerald
# coin with a transparent M.
magick -size ${S}x${S} xc:black -fill white -stroke none -draw "circle 512,512 512,280" \
  -fill none -stroke black -strokewidth 52 -draw "$mpoly" "$OUT/_coin_mask.png"
magick -size ${S}x${S} "$GRAD" "$OUT/_coin_mask.png" -alpha off -compose CopyOpacity -composite "$OUT/_coin.png"

# ---- App icon: flat emerald coin on the dark canvas, OPAQUE (App-Store safe) ----
bgdark "$OUT/_icon_bg.png"
magick "$OUT/_icon_bg.png" "$OUT/_coin.png" -compose over -composite \
  -background "$CANVAS" -alpha remove -alpha off -resize 1024x1024 assets/images/icon.png
magick assets/images/icon.png -resize 196x196 assets/images/favicon.png

# ---- Splash: the coin mark + a soft emerald glow, transparent (sits on #0B0F0E) ----
magick "$OUT/_coin.png" -channel RGBA -blur 0x26 -channel A -evaluate multiply 0.5 +channel "$OUT/_coin_glow.png"
magick -size ${S}x${S} xc:none "$OUT/_coin_glow.png" -compose over -composite \
  "$OUT/_coin.png" -compose over -composite "$OUT/_splash_mark.png"
magick "$OUT/_splash_mark.png" -trim +repage -bordercolor none -border 48 assets/images/splash-icon.png

# ---- Android adaptive foreground (transparent, inset to the ~66% safe zone) ----
magick "$OUT/_coin.png" -resize 68% -background none -gravity center -extent ${S}x${S} \
  assets/images/android-icon-foreground.png
# ---- Android monochrome (white coin silhouette with the M hole) ----
magick "$OUT/_coin_mask.png" -alpha copy -resize 68% -background none -gravity center -extent ${S}x${S} \
  assets/images/android-icon-monochrome.png

echo "Wrote icon / favicon / splash-icon / android-icon-foreground / android-icon-monochrome"
