#!/bin/sh
# Regenerate everything in assets/ and the iOS app icon from design/icon-source.jpg.
# Needs ImageMagick 7 (`brew install imagemagick`); sips alone cannot do the masking.
# Run from the repository root:  sh design/build-icons.sh
set -eu

SRC=design/icon-source.jpg
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. Recover the egg's silhouette. The artist's outer contour is a closed ink
#    line, so flood-filling the paper from a corner separates egg from ground.
#    This is worth the trouble: the shell is lit from the upper left, where it
#    is the same value as the paper (222,204,184 against 232,209,177). Scaled
#    down, that half of the outline vanishes and the egg turns into a lopsided
#    blob. We need the silhouette so we can re-ink the edge ourselves.
magick "$SRC" -colorspace Gray -threshold 45% -negate "$TMP/ink.png"
magick "$TMP/ink.png" -colorspace sRGB -fill red -draw "color 0,0 floodfill" "$TMP/flood.png"
magick "$TMP/flood.png" -fuzz 25% -fill white +opaque red -fill black -opaque red \
    -colorspace Gray -morphology Close Disk:6 -morphology Open Disk:6 "$TMP/egg.png"

# 2. A rim mask: the band just inside the silhouette, feathered.
rim() {
    magick "$TMP/egg.png" -morphology Erode Disk:"$1" "$TMP/eroded.png"
    magick "$TMP/egg.png" "$TMP/eroded.png" -compose Difference -composite \
        -blur 0x4 "$TMP/rim$1.png"
}
rim 45
rim 50

# 3. Two bases. `Close` deletes thin dark marks — the lettering and the contour
#    lines — while leaving the wide isotherm bands alone; the rim is then
#    painted back over the artist's own outline. The icons drop the lettering
#    on purpose: at 120px "ZONA CALIDISSIMA" is a grey smear across the warm
#    band and "NUCLEUS FRIGIDUS" turns the cool centre muddy. iOS derives every
#    on-device size from the 1024, so the 1024 has to survive that downscale.
base() { # <close-radius> <rim-mask> <out>
    magick "$SRC" -morphology Close Disk:"$1" "$TMP/c.png"
    magick "$TMP/c.png" \( "$TMP/c.png" -fill "rgb(40,33,27)" -colorize 100 \) \
        "$2" -compose over -composite "$3"
}
base 5  "$TMP/rim45.png" "$TMP/baseA.png"
base 14 "$TMP/rim50.png" "$TMP/baseB.png"

# 4. Crop to the egg plus a thin margin — 1800x1800 of the 2048 master, centred
#    on the egg at (1024,1020) — and lift saturation and contrast to pay back
#    what the downscale washes out. The favicon gets a little more of both.
magick "$TMP/baseA.png" -crop 1800x1800+124+120 +repage \
    -modulate 100,125,100 -sigmoidal-contrast 3x50% "$TMP/cropA.png"
magick "$TMP/baseB.png" -crop 1800x1800+124+120 +repage \
    -modulate 100,135,100 -sigmoidal-contrast 3.5x50% "$TMP/cropB.png"

# PNG24: forces 8-bit RGB with no alpha channel. The 1024 in particular must
# have no alpha or the App Store rejects the build.
for pair in "1024 ios/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png" \
            "512 assets/icon-512.png" \
            "192 assets/icon-192.png" \
            "180 assets/apple-touch-icon.png"; do
    set -- $pair
    magick "$TMP/cropA.png" -filter Lanczos -resize "$1x$1" -alpha off "PNG24:$2"
done
magick "$TMP/cropB.png" -filter Lanczos -resize 32x32 -alpha off PNG24:assets/favicon-32.png

# 5. The social card is the only place the artwork is shown whole: a link
#    preview is hundreds of pixels wide, so the lettering survives and is the
#    point. Full square, no crop, no re-inking. JPEG because it is a smooth
#    gradient and link scrapers are not patient.
magick "$SRC" -filter Lanczos -resize 1200x1200 -alpha off \
    -quality 82 -sampling-factor 4:2:0 assets/social.jpg
