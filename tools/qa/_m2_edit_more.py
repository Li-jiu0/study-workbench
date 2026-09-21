# -*- coding: utf-8 -*-
"""R88-M2 编辑3：更多.html（CRLF）
  (1) .morepage-list 内新增「检测更新」入口卡片（在「关于」之后）
  (2) 在 config.js 之后新增 <script src="assets/xt-update.js?v=20260918c" defer>
字节处理，保留 CRLF。所有中文用 str.encode('utf-8') 保证正确。
"""
import os
os.chdir(r"D:/下载的文件/学习工作台")
p = "更多.html"
b = open(p, "rb").read()
orig = len(b)

def enc(s):
    return s.encode("utf-8")

def rep(b, old, new, n=1):
    assert b.count(old) == n, "count=%d expected %d for %r" % (b.count(old), n, old[:80])
    return b.replace(old, new)

CRLF = "\r\n"

# ---- (1) 新增入口卡片：插在「关于」卡片之后 ----
about_card = enc(
    '          <div class="morepage-card morepage-list-item" onclick="showAbout()">' + CRLF +
    '            <div class="mpc-icon"><span class="nav-icon" data-icon="info" data-icon-size="20"></span></div>' + CRLF +
    '            <div class="mpc-title">关于</div>' + CRLF +
    '            <div class="mpc-desc">版本 · 功能清单与说明</div>' + CRLF +
    '          </div>' + CRLF
)
new_card = about_card + enc(
    '          <!-- R88-G（R88-M2）：检测更新入口。版本号由 assets/xt-update.js 写回 #xtMoreUpdateVer。 -->' + CRLF +
    '          <div class="morepage-card morepage-list-item" id="morepageUpdateCard" onclick="XTUpdate.openUpdatePage()">' + CRLF +
    '            <div class="mpc-icon"><span class="nav-icon" data-icon="download" data-icon-size="20"></span></div>' + CRLF +
    '            <div class="mpc-title">检测更新</div>' + CRLF +
    '            <div class="mpc-desc" id="xtMoreUpdateVer">当前版本 v— · 查看是否有新版本</div>' + CRLF +
    '          </div>' + CRLF
)
b = rep(b, about_card, new_card)

# ---- (2) config.js 之后加入 xt-update.js ----
cfg_tag = enc('<script src="assets/config.js?v=20260916O" defer></script>' + CRLF)
upd_tag = enc('<script src="assets/xt-update.js?v=20260918c" defer></script>' + CRLF)
assert b.count(cfg_tag) == 1, "config tag count=%d" % b.count(cfg_tag)
assert upd_tag not in b, "xt-update already present"
b = rep(b, cfg_tag, cfg_tag + upd_tag)

open(p, "wb").write(b)
nb = open(p, "rb").read()
print("bytes %d -> %d (delta %d)" % (orig, len(nb), len(nb) - orig))
print("CR=%d LF=%d CRLF=%d" % (nb.count(b"\r"), nb.count(b"\n"), nb.count(b"\r\n")))
print("morepageUpdateCard:", b"morepageUpdateCard" in nb)
print("xtMoreUpdateVer:", b"xtMoreUpdateVer" in nb)
print("xt-update src:", b"assets/xt-update.js?v=20260918c" in nb)
print("backslash-u leftovers:", nb.count(b"\\u"))
