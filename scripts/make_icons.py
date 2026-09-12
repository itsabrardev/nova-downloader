"""Generate the extension icons and the app .ico — no external deps.

Draws the NovaDownloader mark (dark rounded square, blue gradient,
white download arrow) with a simple software rasterizer and encodes
PNG with zlib, plus a PNG-in-ICO wrapper for Windows.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "extension" / "icons"


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def rounded_rect_mask(size: int, radius: int) -> list[list[bool]]:
    mask = [[False] * size for _ in range(size)]
    r = radius
    for y in range(size):
        for x in range(size):
            inside = True
            for cx, cy in ((r, r), (size - 1 - r, r), (r, size - 1 - r), (size - 1 - r, size - 1 - r)):
                dx, dy = x - cx, y - cy
                if (cx == r and x < r or cx == size - 1 - r and x > size - 1 - r) and \
                   (cy == r and y < r or cy == size - 1 - r and y > size - 1 - r):
                    if dx * dx + dy * dy > r * r:
                        inside = False
            mask[y][x] = inside
    return mask


def render(size: int) -> bytes:
    """RGBA pixel buffer of the icon at *size*."""
    gradient_top = (0.10, 0.15, 0.25)
    gradient_bottom = (0.045, 0.07, 0.13)
    accent = (0.36, 0.55, 1.0)
    white = (0.92, 0.95, 1.0)
    radius = max(2, size // 4)
    mask = rounded_rect_mask(size, radius)

    cx = size / 2
    shaft_half = size * 0.075
    shaft_top = size * 0.22
    shaft_bottom = size * 0.52
    head_half = size * 0.21
    head_top = size * 0.46
    head_tip = size * 0.70
    tray_top = size * 0.76
    tray_bottom = size * 0.82
    tray_half = size * 0.24

    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            if not mask[y][x]:
                pixels += b"\x00\x00\x00\x00"
                continue
            t = y / max(1, size - 1)
            color = [lerp(gradient_top[i], gradient_bottom[i], t) for i in range(3)]
            # accent glow from the bottom
            glow = max(0.0, (t - 0.55) / 0.45)
            color = [lerp(color[i], accent[i], glow * 0.35) for i in range(3)]

            px = x + 0.5
            py = y + 0.5
            in_shaft = shaft_top <= py <= shaft_bottom and abs(px - cx) <= shaft_half
            head_width = head_half * (1 - (py - head_top) / (head_tip - head_top))
            in_head = head_top <= py <= head_tip and abs(px - cx) <= head_width
            in_tray = tray_top <= py <= tray_bottom and abs(px - cx) <= tray_half
            if in_shaft or in_head or in_tray:
                color = list(white)

            pixels += bytes(int(c * 255) for c in color) + b"\xff"
    return bytes(pixels)


def encode_png(size: int, rgba: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    stride = size * 4
    raw = b"".join(b"\x00" + rgba[y * stride:(y + 1) * stride] for y in range(size))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def encode_ico(png_blobs: dict[int, bytes]) -> bytes:
    entries = sorted(png_blobs.items())
    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    directory = b""
    images = b""
    for size, blob in entries:
        w = 0 if size >= 256 else size
        h = 0 if size >= 256 else size
        directory += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(blob), offset)
        images += blob
        offset += len(blob)
    return header + directory + images


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    blobs = {}
    for size in (16, 48, 128):
        blob = encode_png(size, render(size))
        blobs[size] = blob
        (OUT / f"icon{size}.png").write_bytes(blob)
        print(f"wrote extension/icons/icon{size}.png ({len(blob)} bytes)")
    ico = encode_ico({128: blobs[128], 48: blobs[48]})
    assets = ROOT / "assets" / "icons"
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "icon.ico").write_bytes(ico)
    print(f"wrote assets/icons/icon.ico ({len(ico)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
