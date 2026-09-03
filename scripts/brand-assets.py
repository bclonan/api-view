"""Reproduce existing API Canvas brand assets with Pillow; no network inputs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
public = root / "public"

def mark(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    s = size / 40
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=10*s, fill="#244d3f")
    for box in [(10, 10, 18, 18), (22, 10, 30, 30), (10, 22, 18, 30)]:
        draw.rectangle(tuple(v*s for v in box), fill="#d9e5b2")
    return image

mark(180).save(public / "apple-touch-icon.png", optimize=True)
mark(256).save(public / "favicon.ico", sizes=[(16,16),(32,32),(48,48)])
image = Image.new("RGB", (1200, 630), "#f7f8f5")
d = ImageDraw.Draw(image)
font_root = Path("C:/Windows/Fonts")
def font(size, bold=False):
    return ImageFont.truetype(str(font_root / ("arialbd.ttf" if bold else "arial.ttf")), size)
image.paste(mark(62), (74, 58), mark(62))
d.text((152, 70), "API Canvas", fill="#244d3f", font=font(30, True))
d.text((74, 190), "Public data.", fill="#303a32", font=font(72, True))
d.text((74, 278), "A shared canvas.", fill="#303a32", font=font(72, True))
d.text((77, 405), "People and WebMCP agents.", fill="#526745", font=font(30))
d.text((77, 450), "The same editable cards.", fill="#526745", font=font(30))
d.rounded_rectangle((840, 95, 1125, 295), radius=22, fill="white", outline="#dce2d5", width=2)
for x, h in [(870,50),(919,78),(968,57),(1017,110),(1066,87)]:
    d.rounded_rectangle((x,265-h,x+28,265),radius=6,fill="#8da979")
d.rounded_rectangle((840, 319, 1125, 520), radius=22, fill="#305743")
d.text((866, 345), "Connected", fill="#d9e5b2", font=font(28, True))
d.text((866, 384), "by evidence.", fill="white", font=font(28, True))
for y, length in [(447,220),(470,155)]:
    d.rounded_rectangle((866,y,866+length,y+7),radius=3,fill="#97ad82")
d.line((76, 568, 1124, 568), fill="#dce2d5", width=2)
d.text((77, 585), "Local data. Structured tools. Human control.", fill="#526745", font=font(18))
image.save(public / "og-image.png", optimize=True)
