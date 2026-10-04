#!/usr/bin/env python3
"""Generate the site's icon set from logo.jpg.

Every icon is the logo's square mark on the site's dark ground. The wordmark
cannot work in a square: shrunk to fit it becomes unreadable type, and the
tagline turns to mush. The glowing square and its superscript are the
distinctive part, are already square, and survive being shrunk.

Run after changing logo.jpg:
    python3 scripts/make_icons.py
"""

import math
import os
import sys

from PIL import Image

SOURCE = "logo.jpg"
# Bounds of the mark within logo.jpg, found by projection profile: a column
# gutter at x=870 separates it from the "M" of SAM, a row gutter at y=350 sits
# above the tagline. Recompute these if the logo is ever redrawn.
MARK_BOX = (880, 96, 1138, 345)
# logo.jpg is a JPEG, so its black field carries block noise around the mark. A
# hard floor plus a ramp keys that to transparency; a plain luminance key
# leaves a visible grey halo.
FLOOR, SPAN = 30, 225

# (filename, pixels, how much of the canvas the mark fills, alpha boost)
# Apple rounds its icon's corners, so 180 keeps more margin than the favicons,
# which are shown square and need every pixel they can get.
# The mark is drawn in thin strokes. Below about 32px they fall under a pixel
# and the downscale averages them toward the dark ground, so the small sizes
# lift the mark's alpha to keep it from turning to mud. Anything 180 and up
# needs no lift, which is why apple-touch-icon.png renders unchanged.
ICONS = [
    ("apple-touch-icon.png", 180, 0.62, 1.0),
    ("icon-512.png", 512, 0.66, 1.0),
    ("icon-192.png", 192, 0.66, 1.0),
    ("favicon-32x32.png", 32, 0.84, 1.35),
    ("favicon-16x16.png", 16, 0.88, 2.0),
]
ICO = ("favicon.ico", [48, 32, 16], 0.84, 1.35)


def keyed_mark(source):
    mark = Image.open(source).convert("RGB").crop(MARK_BOX)
    out = Image.new("RGBA", mark.size)
    mp, op = mark.load(), out.load()
    for y in range(mark.size[1]):
        for x in range(mark.size[0]):
            r, g, b = mp[x, y]
            v = max(r, g, b)
            if v <= FLOOR:
                op[x, y] = (0, 0, 0, 0)
            else:
                a = min(255, int((v - FLOOR) * 255 / SPAN))
                s = 255.0 / v
                op[x, y] = (min(255, int(r * s)), min(255, int(g * s)),
                            min(255, int(b * s)), a)
    return out


def render(mark, size, fill, boost=1.0):
    """The mark centred on the site's dark ground with a blue glow behind it."""
    bg = Image.new("RGB", (size, size))
    bp = bg.load()
    cx, cy = size * 0.5, size * 0.38
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / (size * 0.72)
            glow = max(0.0, 1.0 - d) ** 2
            t = y / float(size)
            bp[x, y] = (min(int(5 + 6 * t + 30 * glow), 255),
                        min(int(7 + 10 * t + 70 * glow), 255),
                        min(int(13 + 16 * t + 120 * glow), 255))
    target = int(size * fill)
    scale = min(target / mark.size[0], target / mark.size[1])
    w, h = max(1, int(mark.size[0] * scale)), max(1, int(mark.size[1] * scale))
    small = mark.resize((w, h), Image.LANCZOS)
    if boost != 1.0:
        px = small.load()
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, min(255, int(a * boost)))
    bg.paste(small, ((size - w) // 2, (size - h) // 2), small)
    return bg


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    os.chdir(root)
    mark = keyed_mark(SOURCE)
    for name, size, fill, boost in ICONS:
        render(mark, size, fill, boost).save(name, optimize=True)
        print("%-22s %4dpx  %d bytes" % (name, size, os.path.getsize(name)))
    name, sizes, fill, boost = ICO
    base = render(mark, max(sizes), fill, boost)
    base.save(name, sizes=[(s, s) for s in sizes])
    print("%-22s %s  %d bytes" % (name, "+".join(str(s) for s in sizes),
                                  os.path.getsize(name)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
