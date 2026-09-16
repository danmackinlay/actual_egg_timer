# Artwork

`icon-source.jpg` is the master: 2048 × 2048, an egg drawn as a contour map.
It is not deployed — `assets/` holds everything the site actually serves, and
this directory holds the thing they are cut from.

Everything in `assets/` is regenerated from the master with `sips`, which ships
with macOS. The icons are cut from a 1500 × 1500 centre crop rather than the
full square, because the egg occupies about half the width of the master and an
untrimmed 32-pixel favicon is a smear:

```sh
sips -s format png --cropToHeightWidth 1500 1500 design/icon-source.jpg --out /tmp/crop.png
sips -Z 512 /tmp/crop.png --out assets/icon-512.png
sips -Z 192 /tmp/crop.png --out assets/icon-192.png
sips -Z 180 /tmp/crop.png --out assets/apple-touch-icon.png
sips -Z  32 /tmp/crop.png --out assets/favicon-32.png
```

The social card keeps the full square, background and all, and is a JPEG
because it is a smooth gradient: the same image as a PNG is 2.2 MB against
400 kB, and link scrapers are not patient.

```sh
sips -s format jpeg -s formatOptions 82 -Z 1200 design/icon-source.jpg --out assets/social.jpg
```

If the artwork is replaced, the filenames should stay the same — they are
referenced from `index.html`, `site.webmanifest`, and by every social card that
has already been scraped. `netlify.toml` caches this directory for a day rather
than a year for exactly that reason.
