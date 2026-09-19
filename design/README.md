# Artwork

`icon-source.jpg` is the master: 2048 × 2048, an egg in cross-section drawn as
an antique scientific diagram — a stippled shell, isotherm bands running from
red at the rim to a pale blue core, hand-lettered on aged paper. It is not
deployed. `assets/` holds everything the site actually serves, and this
directory holds the thing they are cut from.

Run `sh design/build-icons.sh` from the repository root to regenerate all of
it. That needs ImageMagick (`brew install imagemagick`); the old `sips` recipe
could not do the masking this artwork turns out to need.

## Why it is not just a downscale

Two things in the master do not survive being made small, and the script exists
to deal with them.

**The outline disappears on one side.** The shell is lit from the upper left,
where it sits at rgb(222,204,184) against paper at rgb(232,209,177) — the same
value, near enough. The artist separated them with a thin ink contour, and that
line is the first casualty of any downscale. Lose it and the egg stops being an
egg: the dark lower-right survives, the pale upper-left dissolves into the
background, and a 32-pixel favicon reads as a lopsided smudge. So the script
flood-fills the paper from a corner — the contour is closed, so this works —
recovers the silhouette, and re-inks the edge itself, thicker at smaller sizes.

**The lettering turns to dirt.** At icon sizes "ZONA CALIDISSIMA" is a grey
smear across the warm band and "NUCLEUS FRIGIDUS" fills the cool centre with
mud, which is a shame, because that centre is the one thing the app is about.
A morphological close deletes thin dark marks and leaves the wide isotherm
bands untouched, so the icons keep the structure and drop the words. This
applies to `icon-1024.png` as much as the favicon: iOS derives every on-screen
size from that one file, and the home screen shows it at about 120 pixels.

The icons are therefore a bolder, wordless crop — egg plus a thin margin,
saturation and contrast lifted to pay back what the downscale washes out. Only
`social.jpg` keeps the artwork whole. A link preview is rendered hundreds of
pixels wide, so there the lettering survives and is most of the appeal.

## Sizes

| file | size | notes |
| --- | --- | --- |
| `assets/favicon-32.png` | 32 | heaviest cleaning, thickest re-inked rim |
| `assets/icon-192.png` | 192 | web manifest |
| `assets/icon-512.png` | 512 | web manifest |
| `assets/apple-touch-icon.png` | 180 | iOS home screen from Safari |
| `ios/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png` | 1024 | **no alpha channel** |
| `assets/social.jpg` | 1200 | full square, lettering intact |

Every PNG is written through ImageMagick's `PNG24:` prefix, which forces 8-bit
RGB with no alpha. The 1024 genuinely needs this — an alpha channel on an iOS
app icon is a standard App Store rejection. `sips -g hasAlpha` on any of them
should say `no`.

If the artwork is replaced again, the filenames should stay the same — they are
referenced from `index.html`, `site.webmanifest`, `ios/.../Contents.json`, and
by every social card that has already been scraped. `netlify.toml` caches this
directory for a day rather than a year for exactly that reason. The two
measurements the script hard-codes — the egg's centre at (1024, 1020) and the
1800-pixel crop around it — are properties of this particular master and would
need remeasuring.
