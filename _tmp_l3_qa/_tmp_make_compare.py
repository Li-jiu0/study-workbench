# -*- coding: utf-8 -*-
"""把 L3 截图拼成对照图：输入区「变脸」修复前/后（1280 + 375） + 侧栏模型面板。"""
import os
from PIL import Image, ImageDraw, ImageFont

D = 'D:\\下载的文件\\学习工作台\\_tmp_shots\\'
OUT = D + 'L3-compare.png'

FONT = None
for f in ['C:\\Windows\\Fonts\\msyh.ttc', 'C:\\Windows\\Fonts\\msyhbd.ttc', 'C:\\Windows\\Fonts\\simhei.ttf']:
    if os.path.exists(f):
        FONT = f
        break


def font(sz):
    try:
        return ImageFont.truetype(FONT, sz)
    except Exception:
        return ImageFont.load_default()


def load(n):
    return Image.open(D + n + '.png').convert('RGB')


def crop_band(img, x0, y0, x1, y1):
    w, h = img.size
    return img.crop((max(0, x0), max(0, y0), min(w, x1), min(h, y1)))


# 各场景围绕输入框裁一条带，便于逐像素对比
BANDS = {
    'BEFORE-1280-welcome': (440, 398, 1272, 574),
    '1280-welcome': (440, 398, 1272, 574),
    '1280-conv': (440, 706, 1272, 860),
    'BEFORE-375-welcome': (0, 332, 375, 508),
    '375-welcome': (0, 332, 375, 508),
    '375-conv': (0, 594, 375, 770),
}
LABELS = {
    'BEFORE-1280-welcome': '1280 · 修复前：空态(未聚焦) — 容器隐形，控件像散的',
    '1280-welcome': '1280 · 修复后：空态 — 大圆角方框包住全部控件',
    '1280-conv': '1280 · 修复后：对话态 — 同一副面孔，只是移到贴底',
    'BEFORE-375-welcome': '375 · 修复前：空态(未聚焦)',
    '375-welcome': '375 · 修复后：空态',
    '375-conv': '375 · 修复后：对话态',
}

PAD = 14
TITLE_H = 34
LBL_H = 30

# ---- 两块：桌面 / 窄屏 ----
imgs = {}
maxw = 0
for k, box in BANDS.items():
    imgs[k] = crop_band(load(k), *box)
    maxw = max(maxw, imgs[k].size[0])

PANEL1 = crop_band(load('1280-sidebar-model'), 400, 250, 700, 860)
PANEL2 = crop_band(load('375-drawer-model'), 0, 30, 340, 470)
PANEL3 = crop_band(load('375-drawer'), 0, 30, 340, 470)
panels_w = PANEL1.size[0] + PANEL2.size[0] + PANEL3.size[0] + PAD * 4
row1 = ['BEFORE-1280-welcome', '1280-welcome', '1280-conv']
row2 = ['BEFORE-375-welcome', '375-welcome', '375-conv']

W = max(maxw + PAD * 2, panels_w)
H = (TITLE_H + LBL_H * 3 + imgs[row1[0]].size[1] * 3 + PAD * 4) + (TITLE_H + LBL_H * 3 + imgs[row2[0]].size[1] * 3 + PAD * 4) \
    + TITLE_H + max(PANEL1.size[1], PANEL2.size[1], PANEL3.size[1]) + LBL_H + PAD * 3

canvas = Image.new('RGB', (W, H), (240, 242, 246))
dr = ImageDraw.Draw(canvas)

f_title = font(20)
f_lbl = font(15)

y = PAD
dr.text((PAD, y), '需求 C · 输入区「变脸」修复对照（真 Chrome 渲染）', fill=(25, 30, 40), font=f_title)
y += TITLE_H
for r in (row1, row2):
    for k in r:
        img = imgs[k]
        dr.text((PAD, y), LABELS[k], fill=(60, 66, 78), font=f_lbl)
        y += LBL_H
        canvas.paste(img, (PAD, y))
        y += img.size[1] + PAD

dr.text((PAD, y), '侧栏「模型」按钮：修复后 — 点后面板可见可操作（左：1280 桌面；中：375 点模型后面板已开、抽屉已收；右：375 只开抽屉参照）',
        fill=(60, 66, 78), font=f_lbl)
y += LBL_H
x = PAD
for p in (PANEL1, PANEL2, PANEL3):
    canvas.paste(p, (x, y))
    x += p.size[0] + PAD

canvas.save(OUT)
print('saved')
