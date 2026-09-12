from PIL import Image, ImageDraw
import os

def create_nova_icon(size):
    # Create 32-bit RGBA image
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer dark violet rounded rectangle
    margin = int(size * 0.04)
    radius = int(size * 0.22)
    
    # Gradient simulation or smooth background
    for r in range(radius, 0, -2):
        pass
    
    # Background rounded rect
    draw.rounded_rectangle(
        [(margin, margin), (size - margin, size - margin)],
        radius=radius,
        fill=(20, 14, 34, 255),
        outline=(176, 107, 255, 220),
        width=max(1, int(size * 0.025))
    )
    
    # Soft purple/cyan inner glow
    glow_margin = margin + max(2, int(size * 0.04))
    draw.rounded_rectangle(
        [(glow_margin, glow_margin), (size - glow_margin, size - glow_margin)],
        radius=max(2, radius - 4),
        fill=(32, 20, 52, 230)
    )
    
    cx = size / 2.0
    
    # Download Arrow (Neon Pink/Violet gradient feel)
    arrow_color = (235, 230, 248, 255)
    accent_color = (255, 92, 225, 255)
    
    shaft_w = size * 0.14
    shaft_h = size * 0.32
    shaft_top = size * 0.22
    
    draw.rounded_rectangle(
        [(cx - shaft_w / 2.0, shaft_top), (cx + shaft_w / 2.0, shaft_top + shaft_h)],
        radius=max(1, int(size * 0.03)),
        fill=arrow_color
    )
    
    # Arrow head
    arrow_head = [
        (cx - size * 0.24, size * 0.50),
        (cx + size * 0.24, size * 0.50),
        (cx, size * 0.72)
    ]
    draw.polygon(arrow_head, fill=arrow_color)
    
    # Bottom tray line (with neon pink accent)
    tray_top = size * 0.78
    tray_w = size * 0.52
    tray_h = max(2, int(size * 0.06))
    draw.rounded_rectangle(
        [(cx - tray_w / 2.0, tray_top), (cx + tray_w / 2.0, tray_top + tray_h)],
        radius=max(1, int(tray_h / 2.0)),
        fill=accent_color
    )
    
    return img

def main():
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    images = [create_nova_icon(s[0]) for s in sizes]
    
    out_dir = os.path.join("assets", "icons")
    os.makedirs(out_dir, exist_ok=True)
    
    ico_path = os.path.join(out_dir, "icon.ico")
    png_path = os.path.join(out_dir, "icon.png")
    
    images[0].save(png_path, "PNG")
    images[0].save(ico_path, format="ICO", sizes=sizes)
    print(f"Generated {ico_path} with sizes up to 256x256!")

if __name__ == "__main__":
    main()
