# -*- coding: utf-8 -*-
"""R93-3：更新页状态卡圆圈图标换成 APP 品牌同款 book-open。
1) assets/xt-update.js（纯 LF）：renderError 圆圈 alert-triangle -> book-open
   （renderLatest 的 check-circle 为成功语义非 alert 类，保留；按钮小图标不动）
2) 更新.html（纯 CRLF）：xt-update.js?v=20260918e -> 20260918f 强刷缓存
"""
import io

P_JS = r"D:\下载的文件\学习工作台\assets\xt-update.js"
P_HTML = r"D:\下载的文件\学习工作台\更新.html"
LOG = r"D:\下载的文件\学习工作台\tools\qa\r93c_patch_log.txt"

lines = []
lines.append("R93-C patch log")
ok = True

# ---- xt-update.js (LF) ----
with io.open(P_JS, "rb") as f:
    js = f.read()
crlf = js.count(b"\r\n"); lf = js.count(b"\n")
nl_js = b"\r\n" if crlf >= (lf - crlf) else b"\n"
lines.append("xt-update.js before: size=%d CRLF=%d LF=%d pureLF=%d NL=%r"
             % (len(js), crlf, lf, lf - crlf, nl_js))

old_icon = b'<span class="nav-icon" data-icon="alert-triangle" data-icon-size="26"></span></div>'
new_icon = b'<span class="nav-icon" data-icon="book-open" data-icon-size="26"></span></div>'
c_old = js.count(old_icon)
c_new = js.count(new_icon)
lines.append("alert-triangle span occurrence=%d (expect 1); book-open span already=%d" % (c_old, c_new))
if c_old == 1:
    js = js.replace(old_icon, new_icon, 1)
    with io.open(P_JS, "wb") as f:
        f.write(js)
else:
    ok = False
    lines.append("[ABORT] xt-update.js NOT modified")

# ---- 更新.html (CRLF) ----
with io.open(P_HTML, "rb") as f:
    html = f.read()
crlf_h = html.count(b"\r\n"); lf_h = html.count(b"\n")
nl_h = b"\r\n" if crlf_h >= (lf_h - crlf_h) else b"\n"
lines.append("更新.html before: size=%d CRLF=%d LF=%d pureLF=%d NL=%r"
             % (len(html), crlf_h, lf_h, lf_h - crlf_h, nl_h))

old_v = b'assets/xt-update.js?v=20260918e'
new_v = b'assets/xt-update.js?v=20260918f'
cv_old = html.count(old_v)
cv_new = html.count(new_v)
lines.append("version old hit=%d (expect 1); new-already=%d" % (cv_old, cv_new))
if cv_old == 1:
    html = html.replace(old_v, new_v, 1)
    with io.open(P_HTML, "wb") as f:
        f.write(html)
else:
    ok = False
    lines.append("[ABORT] 更新.html NOT modified")

# ---- verify ----
with io.open(P_JS, "rb") as f:
    vj = f.read()
crlf2 = vj.count(b"\r\n"); lf2 = vj.count(b"\n")
lines.append("xt-update.js after: size=%d CRLF=%d LF=%d pureLF=%d" % (len(vj), crlf2, lf2, lf2 - crlf2))
lines.append("[VERIFY js] book-open in renderError span hit=%d (expect 1)" % vj.count(new_icon))
lines.append("[VERIFY js] alert-triangle hit=%d (expect 0)" % vj.count(b"alert-triangle"))
lines.append("[VERIFY js] check-circle kept hit=%d (expect >=1, renderLatest untouched)" % vj.count(b"check-circle"))

with io.open(P_HTML, "rb") as f:
    vh = f.read()
crlf3 = vh.count(b"\r\n"); lf3 = vh.count(b"\n")
lines.append("更新.html after: size=%d CRLF=%d LF=%d pureLF=%d" % (len(vh), crlf3, lf3, lf3 - crlf3))
lines.append("[VERIFY html] v=20260918f hit=%d (expect 1)  v=20260918e hit=%d (expect 0)"
             % (vh.count(new_v), vh.count(old_v)))
lines.append("RESULT=%s" % ("PASS" if ok else "CHECK"))

with io.open(LOG, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
