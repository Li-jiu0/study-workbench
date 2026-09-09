# -*- coding: utf-8 -*-
"""生成安卓 App 图标：圆角蓝紫渐变底 + 白色「学」字（配合 app.js 站点主题色 #5B8DEF）"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "res", "drawable", "ic_launcher.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

SIZE = 432  # xxxhdpi 108dp * 4；再由系统缩放到各密度

# 1) 底：圆角矩形 + 蓝紫渐变（左上 #6A9BFF → 右下 #5B5BD6，贴近站点 theme-home 主色）
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
grad = Image.new("RGBA", (SIZE, SIZE))
gd = ImageDraw.Draw(grad)
c1 = (0x6A, 0x9B, 0xFF)
c2 = (0x5B, 0x5B, 0xD6)
for y in range(SIZE):
    t = y / SIZE
    gd.line([(0, y), (SIZE, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(c1, c2)))

mask = Image.new("L", (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=int(SIZE * 0.22), fill=255)
img.paste(grad, (0, 0), mask)

# 2) 字：白色「学」
d = ImageDraw.Draw(img)
font = None
candidates = [
    r"C:\Windows\Fonts\msyhbd.ttc",   # 微软雅黑 Bold
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",   # 黑体
    r"C:\Windows\Fonts\simsun.ttc",
]
for f in candidates:
    if os.path.exists(f):
        font = ImageFont.truetype(f, int(SIZE * 0.62))
        break
if font is None:
    font = ImageFont.load_default()

text = "学"
bbox = d.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
x = (SIZE - tw) / 2 - bbox[0]
y = (SIZE - th) / 2 - bbox[1]
d.text((x, y), text, font=font, fill=(255, 255, 255, 255))

img.save(OUT)
print("saved:", OUT)
