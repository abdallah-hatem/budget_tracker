#!/usr/bin/env bash
# Generates Masareef app-icon candidates.
# Brand: glowing emerald mark on a dark canvas.
#   accent #2BD98E · canvas #0B0F0E · warning #F5B544
# Each concept keeps the "M" but adds ONE money/budget signal.
#
# Usage: ./scripts/gen-icon.sh            -> builds all candidates + contact sheet
#        ./scripts/gen-icon.sh finalize A -> writes the chosen concept into assets/
set -euo pipefail
cd "$(dirname "$0")/.."

S=1024
OUT=.icon-gen
mkdir -p "$OUT"

# Dark canvas with a faint emerald vignette for depth.
bg() { magick -size ${S}x${S} radial-gradient:'#101A16'-'#070A09' "$1"; }

# Emerald top->bottom gradient (mint -> deep emerald) used to fill the mark.
GRAD='gradient:#3FE0A0-#0E9D5E'

# crisp_from_mask <mask.png> <out_crisp.png> [gradient]
# Turns a white-on-black mask into an emerald-gradient RGBA layer.
crisp_from_mask() {
  local mask="$1" out="$2" grad="${3:-$GRAD}"
  magick -size ${S}x${S} "$grad" "$mask" -alpha off \
    -compose CopyOpacity -composite "$out"
}

# glow_compose <bg.png> <out.png> <crisp1> [crisp2 ...]
# Lays each crisp layer down with a soft outer glow (screen-composited blur).
glow_compose() {
  local bg="$1" out="$2"; shift 2
  cp "$bg" "$out"
  for crisp in "$@"; do
    # ONE subtle, tight halo, heavily alpha-damped — a soft emerald glow that
    # hugs the mark's edge without flooding the dark negative space.
    magick "$crisp" -channel RGBA -blur 0x14 -channel A -evaluate multiply 0.16 +channel "$OUT/_glow.png"
    magick "$out" "$OUT/_glow.png" -compose screen -composite \
                  "$crisp"         -compose over   -composite "$out"
  done
}

# ---------------------------------------------------------------------------
# Concept A — COIN: the M as a mint-mark inside a glowing coin ring.
# ---------------------------------------------------------------------------
build_A() {
  magick -size ${S}x${S} xc:black -fill none -stroke white \
    -strokewidth 26 -draw "ellipse 512,512 400,400 0,360" \
    -strokewidth 6  -draw "ellipse 512,512 372,372 0,360" \
    -strokewidth 84 \
    -draw "stroke-linecap round stroke-linejoin round polyline 360,662 360,380 512,540 664,380 664,662" \
    "$OUT/_A_mask.png"
  crisp_from_mask "$OUT/_A_mask.png" "$OUT/_A_crisp.png"
  bg "$OUT/_A_bg.png"
  glow_compose "$OUT/_A_bg.png" "$OUT/A.png" "$OUT/_A_crisp.png"
}

# ---------------------------------------------------------------------------
# Concept B — BUDGET GAUGE: M inside a donut progress ring (dim track + bright
# spent-arc). Echoes the dashboard pie chart -> reads as "budget".
# ---------------------------------------------------------------------------
build_B() {
  # Dim full track ring (the "budget" total).
  magick -size ${S}x${S} xc:black -fill none -stroke white -strokewidth 52 \
    -draw "ellipse 512,512 372,372 0,360" "$OUT/_B_track_mask.png"
  crisp_from_mask "$OUT/_B_track_mask.png" "$OUT/_B_track.png" \
    'gradient:#1C6F50-#0E4231'
  # Bright progress ring with a clear gap (a pie/donut segment) — same radius as
  # the track so it sits cleanly on top, never touching the M.
  magick -size ${S}x${S} xc:black -fill none -stroke white \
    -strokewidth 52 -draw "stroke-linecap round ellipse 512,512 372,372 -86,196" \
    "$OUT/_B_arc_mask.png"
  crisp_from_mask "$OUT/_B_arc_mask.png" "$OUT/_B_arc.png"
  # Centered M, comfortably inside the ring.
  magick -size ${S}x${S} xc:black -fill none -stroke white -strokewidth 60 \
    -draw "stroke-linecap round stroke-linejoin round polyline 412,596 412,420 512,512 612,420 612,596" \
    "$OUT/_B_m_mask.png"
  crisp_from_mask "$OUT/_B_m_mask.png" "$OUT/_B_m.png"
  bg "$OUT/_B_bg.png"
  glow_compose "$OUT/_B_bg.png" "$OUT/B.png" "$OUT/_B_track.png" "$OUT/_B_arc.png" "$OUT/_B_m.png"
}

# ---------------------------------------------------------------------------
# Concept C — SAVINGS: the M resting on a small stack of coins.
# ---------------------------------------------------------------------------
build_C() {
  magick -size ${S}x${S} xc:black \
    -fill none -stroke white -strokewidth 92 \
    -draw "stroke-linecap round stroke-linejoin round polyline 312,560 312,276 512,452 712,276 712,560" \
    -fill white -stroke none \
    -draw "ellipse 512,690 206,50 0,360" \
    -draw "ellipse 512,792 206,50 0,360" \
    -draw "ellipse 512,894 206,50 0,360" \
    "$OUT/_C_mask.png"
  # Re-punch thin dark gaps between the coins so the stack reads as separate discs.
  magick "$OUT/_C_mask.png" -fill black -stroke none \
    -draw "rectangle 300,736 724,746" \
    -draw "rectangle 300,838 724,848" \
    "$OUT/_C_mask.png"
  crisp_from_mask "$OUT/_C_mask.png" "$OUT/_C_crisp.png"
  bg "$OUT/_C_bg.png"
  glow_compose "$OUT/_C_bg.png" "$OUT/C.png" "$OUT/_C_crisp.png"
}

contact_sheet() {
  # Big row (labelled) + a small-size row to judge legibility at app scale.
  for c in A B C; do
    magick "$OUT/$c.png" -resize 360x360 "$OUT/_big_$c.png"
    magick "$OUT/$c.png" -resize 96x96 -bordercolor '#222' -border 6 "$OUT/_sm_$c.png"
  done
  magick "$OUT/_big_A.png" "$OUT/_big_B.png" "$OUT/_big_C.png" +append \
    -bordercolor '#0B0F0E' -border 14 "$OUT/_row_big.png"
  magick "$OUT/_sm_A.png" "$OUT/_sm_B.png" "$OUT/_sm_C.png" +append \
    -gravity center -background '#0B0F0E' -extent 1108x110 "$OUT/_row_sm.png"
  magick -size 1108x60 xc:'#0B0F0E' -fill '#9AA6A0' -pointsize 30 -gravity center \
    -font /System/Library/Fonts/SFNSRounded.ttf \
    -draw "text -370,0 'A · Coin'" \
    -draw "text 6,0 'B · Budget gauge'" \
    -draw "text 372,0 'C · Savings (coins)'" "$OUT/_labels.png"
  magick "$OUT/_row_big.png" "$OUT/_labels.png" "$OUT/_row_sm.png" -append \
    -background '#0B0F0E' -gravity center -extent 1140x600 "$OUT/candidates.png"
  echo "wrote $OUT/candidates.png"
}

# transparent_mark <crisp.png> <out.png> — the mark + soft glow on a TRANSPARENT
# canvas (for the splash / adaptive foreground that sit on their own dark bg).
transparent_mark() {
  local crisp="$1" out="$2"
  magick "$crisp" -channel RGBA -blur 0x16 -channel A -evaluate multiply 0.32 +channel "$OUT/_tglow.png"
  magick -size ${S}x${S} xc:none \
    "$OUT/_tglow.png" -compose over -composite \
    "$crisp"          -compose over -composite "$out"
}

# Write the chosen concept into every app asset slot.
finalize() {
  local c="${1:-A}"
  build_"$c"
  local full="$OUT/$c.png" crisp="$OUT/_${c}_crisp.png"
  [ -f "$crisp" ] || crisp="$OUT/_${c}_m.png"  # B/C build per-layer crisps

  # iOS app icon: full-bleed, OPAQUE (App Store rejects alpha). 1024x1024.
  magick "$full" -background '#0B0F0E' -alpha remove -alpha off \
    -resize 1024x1024 assets/images/icon.png
  # Web favicon.
  magick "$full" -background '#0B0F0E' -alpha remove -alpha off \
    -resize 196x196 assets/images/favicon.png
  # Splash mark: transparent bg, centred (the splash plugin paints #0B0F0E).
  transparent_mark "$crisp" assets/images/splash-icon.png
  # Android adaptive foreground: transparent, inset into the ~66% safe zone.
  magick "$OUT/_tmark_inset.png" -size ${S}x${S} 2>/dev/null || true
  transparent_mark "$crisp" "$OUT/_tmark.png"
  magick "$OUT/_tmark.png" -resize 70% -background none -gravity center -extent ${S}x${S} \
    assets/images/android-icon-foreground.png
  # Android monochrome (themed icons): white silhouette of the same mark, inset.
  magick "$OUT/_${c}_mask.png" -resize 70% -background black -gravity center -extent ${S}x${S} \
    -alpha copy assets/images/android-icon-monochrome.png 2>/dev/null || true

  echo "finalized concept $c into assets/images/{icon,favicon,splash-icon,android-icon-foreground}.png"
}

case "${1:-all}" in
  all) build_A; build_B; build_C; contact_sheet ;;
  A) build_A ;; B) build_B ;; C) build_C ;;
  finalize) finalize "${2:-A}" ;;
  *) echo "unknown: $1"; exit 1 ;;
esac
