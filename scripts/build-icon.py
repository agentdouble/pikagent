#!/usr/bin/env python3
"""
Compose a blue rounded-square (macOS "squircle") background behind the
pickagent circular logo, then emit every size the iconset needs.

Usage: python3 scripts/build-icon.py [hex-color]
Default color: #2563eb (Tailwind blue-600).
"""

import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "assets", "pickagent-source.png")
OUT_PNG = os.path.join(ROOT, "assets", "pickagent.png")
ICONSET = os.path.join(ROOT, "assets", "icon.iconset")

# Apple's "squircle" corner radius at 1024 is ~179 (≈ 0.1745 ratio).
CORNER_RATIO = 179 / 1024
# Icon sits inside the squircle with a small margin so it doesn't touch the edge.
LOGO_SCALE = 0.82

SIZES = [16, 32, 64, 128, 256, 512, 1024]


def hex_to_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def build(size: int, color_rgb):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    radius = int(size * CORNER_RATIO)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color_rgb + (255,))

    logo = Image.open(SOURCE).convert("RGBA")
    target = int(size * LOGO_SCALE)
    logo = logo.resize((target, target), Image.LANCZOS)
    offset = ((size - target) // 2, (size - target) // 2)
    canvas.alpha_composite(logo, dest=offset)
    return canvas


def main():
    color = sys.argv[1] if len(sys.argv) > 1 else "#2563eb"
    rgb = hex_to_rgb(color)
    os.makedirs(ICONSET, exist_ok=True)

    build(1024, rgb).save(OUT_PNG)

    for s in SIZES:
        if s >= 16:
            build(s, rgb).save(os.path.join(ICONSET, f"icon_{s}x{s}.png"))
        if s * 2 <= 1024 and s >= 16:
            build(s * 2, rgb).save(os.path.join(ICONSET, f"icon_{s}x{s}@2x.png"))

    print(f"Wrote {OUT_PNG} and {ICONSET}/* with color {color}")


if __name__ == "__main__":
    main()
