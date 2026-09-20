# -*- coding: utf-8 -*-
"""
T04 patch 2 · 渲染层：位置 chip 渲染（只读 location 字符串，空则不渲染）
api.js : 新增 blogLocChipHtml(n) 助手；noteCardHtml(.nc-meta) 与 renderBlogDetail(.nd-meta) 注入
app.js : 同上（本地链路，数据源 appData.notes）
二进制读写保 CRLF。
"""
import os

BASE = r"D:\下载的文件\学习工作台"
API = os.path.join(BASE, "assets", "api.js")
APP = os.path.join(BASE, "assets", "app.js")


def load(p):
    with open(p, "rb") as f:
        return f.read()


def save(p, b):
    with open(p, "wb") as f:
        f.write(b)


def check_eol(b, label):
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    assert lf - crlf == 0, label + " loneLF != 0"
    assert b.count(b"\r") - crlf == 0, label + " loneCR != 0"


def B(s):
    return s.encode("utf-8")


def replace_once(b, anchor, repl, label):
    cnt = b.count(anchor)
    assert cnt == 1, label + " anchor count=" + str(cnt)
    return b.replace(anchor, repl, 1)


NL = "\r\n"

HELPER_LINES = [
    "/* R88-H / T04：位置 chip 渲染助手（只读 location 字符串；空值不渲染；绝不渲染坐标） */",
    "function blogLocChipHtml(n) {",
    "  var t = (n && n.location) ? String(n.location).trim() : '';",
    "  if (!t) return '';",
    "  return '<span class=\"blog-loc-chip\" style=\"display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--primary);background:color-mix(in srgb, var(--primary) 12%, transparent);border-radius:999px;padding:2px 8px;max-width:200px\"><span class=\"nav-icon\" data-icon=\"map-pin\" data-icon-size=\"12\"></span><span class=\"blog-loc-text\" style=\"overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">' + esc(t) + '</span></span>';",
    "}",
]

# =====================================================================
# assets/api.js
# =====================================================================
api = load(API)
api_before = len(api)
check_eol(api, "api.js-before")

# 1) 助手插在 noteCardHtml 之前
anchor_helper = B("/* ---------- 发贴卡片（增加作者行 / 修正评论计数） ---------- */" + NL + "function noteCardHtml(n, opts) {")
helper_new = B(NL.join(HELPER_LINES) + NL + NL + "/* ---------- 发贴卡片（增加作者行 / 修正评论计数） ---------- */" + NL + "function noteCardHtml(n, opts) {")
api = replace_once(api, anchor_helper, helper_new, "api.js-helper")

# 2) 卡片 .nc-meta 注入
anchor_card = B(
    "'<div class=\"nc-meta\"><span class=\"nc-cat\">' + cat.icon + ' ' + cat.name + '</span>' + author + '<span>' + fmtTime(n.createdAt) + '</span></div>' +"
)
card_new = B(
    "'<div class=\"nc-meta\"><span class=\"nc-cat\">' + cat.icon + ' ' + cat.name + '</span>' + author + blogLocChipHtml(n) + '<span>' + fmtTime(n.createdAt) + '</span></div>' +"
)
api = replace_once(api, anchor_card, card_new, "api.js-card")

# 3) 详情 .nd-meta 注入（在「更新于」span 之后）
anchor_detail = B(
    "        <span><span class=\"nav-icon\" data-icon=\"clock\" data-icon-size=\"12\"></span> 更新于 ${fmtTime(n.updatedAt || n.createdAt)}</span>"
)
detail_new = B(
    "        <span><span class=\"nav-icon\" data-icon=\"clock\" data-icon-size=\"12\"></span> 更新于 ${fmtTime(n.updatedAt || n.createdAt)}</span>" + NL +
    "        ${blogLocChipHtml(n)}"
)
api = replace_once(api, anchor_detail, detail_new, "api.js-detail")

check_eol(api, "api.js-after")
save(API, api)
print("api.js  OK  bytes " + str(api_before) + " -> " + str(len(api)))

# =====================================================================
# assets/app.js
# =====================================================================
app = load(APP)
app_before = len(app)
check_eol(app, "app.js-before")

# 1) 助手插在 noteCardHtml 之前
anchor_helper2 = B("function noteCardHtml(n, opts) {" + NL + "  opts = opts || {};")
helper2_new = B(NL.join(HELPER_LINES) + NL + NL + "function noteCardHtml(n, opts) {" + NL + "  opts = opts || {};")
app = replace_once(app, anchor_helper2, helper2_new, "app.js-helper")

# 2) 卡片 .nc-meta 注入（app.js 用模板串 + icSpan）
anchor_card2 = B(
    "      <div class=\"nc-meta\"><span class=\"nc-cat\">${icSpan(cat.dc, 12)} ${cat.name}</span><span>${fmtTime(n.createdAt)}</span></div>"
)
card2_new = B(
    "      <div class=\"nc-meta\"><span class=\"nc-cat\">${icSpan(cat.dc, 12)} ${cat.name}</span>${blogLocChipHtml(n)}<span>${fmtTime(n.createdAt)}</span></div>"
)
app = replace_once(app, anchor_card2, card2_new, "app.js-card")

# 3) 详情 .nd-meta 注入
anchor_detail2 = B(
    "        <span>${icSpan('clock', 12)} 更新于 ${fmtTime(n.updatedAt || n.createdAt)}</span>"
)
detail2_new = B(
    "        <span>${icSpan('clock', 12)} 更新于 ${fmtTime(n.updatedAt || n.createdAt)}</span>" + NL +
    "        ${blogLocChipHtml(n)}"
)
app = replace_once(app, anchor_detail2, detail2_new, "app.js-detail")

check_eol(app, "app.js-after")
save(APP, app)
print("app.js  OK  bytes " + str(app_before) + " -> " + str(len(app)))

print("RENDER LAYER DONE")
