# -*- coding: utf-8 -*-
"""生成安卓 App 图标（R72 需求16）：圆角蓝渐变底 + 白色五角星「星途」主题。

设计要点：
  · 纯几何绘制，不依赖任何字体 / 网络 —— 任何平台（含无中文字体的 CI/服务器）
    渲染结果完全一致，绝不会出现「默认字体方块」。
  · 配色对齐站点主色 #5B8DEF（左上高亮 → 右下主色 的对角双色渐变）。
  · 内容（含柔光）整体内缩在 12% 安全边距内，避免被圆角裁切。
  · 超采样 4x 再缩小，得到平滑抗锯齿边缘。

输出仍为 android/res/drawable/ic_launcher.png（SIZE=432，圆角 + 渐变风格不变）。
"""
from PIL import Image, ImageDraw
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "res", "drawable", "ic_launcher.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

SIZE = 432          # xxxhdpi 108dp * 4；再由系统缩放到各密度
SS = 4              # 超采样倍数（先大画再缩小 → 平滑边缘）
W = SIZE * SS

# 站点主色 #5B8DEF 的双色对角渐变
C_TOP = (0x7A, 0xB0, 0xFF)   # #7AB0FF  左上高亮
C_BOT = (0x4A, 0x6F, 0xE0)   # #4A6FE0  右下主色深一档（保证白星对比度）


def mix(a, b, t):
    """线性插值两个 RGB 三元组。"""
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


# 1) 底：圆角矩形 + 对角双色渐变（2x2 双线性放大获得平滑对角过渡）
quad = Image.new("RGBA", (2, 2))
quad.putpixel((0, 0), C_TOP + (255,))
quad.putpixel((1, 0), mix(C_TOP, C_BOT, 0.35) + (255,))
quad.putpixel((0, 1), mix(C_TOP, C_BOT, 0.65) + (255,))
quad.putpixel((1, 1), C_BOT + (255,))
grad = quad.resize((W, W), Image.BILINEAR)

mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.22), fill=255)

img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)


# 2) 中心白色五角星（外接半径约 30% 边长 → 留足安全边距，避免圆角裁切）
def star_points(cx, cy, outer, inner):
    """返回一个居中的十点（五角星）多边形顶点列表。"""
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5      # 顶点朝上
        rad = outer if (i % 2 == 0) else inner     # 外/内半径交替
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return pts


cx = W / 2.0
cy = W / 2.0 + W * 0.006           # 视觉居中微调（星形重心略偏上，观感更稳）
outer = W * 0.30
inner = outer * 0.42

# 柔光：两圈放大的低透明度星形，制造轻微发光（整体仍在安全边距内）
d.polygon(star_points(cx, cy, outer * 1.16, inner * 1.16), fill=(255, 255, 255, 46))
d.polygon(star_points(cx, cy, outer * 1.06, inner * 1.06), fill=(255, 255, 255, 120))
# 主星（实白）
d.polygon(star_points(cx, cy, outer, inner), fill=(255, 255, 255, 255))

# 3) 缩小到目标尺寸（LANCZOS 抗锯齿）
img = img.resize((SIZE, SIZE), Image.LANCZOS)
img.save(OUT)
print("saved:", OUT, img.size)
