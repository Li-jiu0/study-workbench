# -*- coding: utf-8 -*-
"""R89-C fix: restore the accidentally-dropped .morepage-title line."""
import os
BASE = r"D:\下载的文件\学习工作台"
P = os.path.join(BASE, "更新.html")
raw = open(P, "rb").read()
before = len(raw)

broken = (
    b'        <div class="morepage-head">\r\n'
    b'          <button class="morepage-back" onclick="if(history.length>1){history.back()}else{location.href=\'\xe8\xae\xbe\xe7\xbd\xae.html\'}" title="\xe8\xbf\x94\xe5\x9b\x9e\xe8\xae\xbe\xe7\xbd\xae" aria-label="\xe8\xbf\x94\xe5\x9b\x9e\xe8\xae\xbe\xe7\xbd\xae">\xe2\x86\x90</button>\r\n'
    b'        </div>\r\n'
)
assert raw.count(broken) == 1, "broken anchor count=%d" % raw.count(broken)

fixed = (
    b'        <div class="morepage-head">\r\n'
    b'          <button class="morepage-back" onclick="if(history.length>1){history.back()}else{location.href=\'\xe8\xae\xbe\xe7\xbd\xae.html\'}" title="\xe8\xbf\x94\xe5\x9b\x9e\xe8\xae\xbe\xe7\xbd\xae" aria-label="\xe8\xbf\x94\xe5\x9b\x9e\xe8\xae\xbe\xe7\xbd\xae">\xe2\x86\x90</button>\r\n'
    b'          <div class="morepage-title"><span class="nav-icon" data-icon="download" data-icon-size="18"></span> \xe6\xa3\x80\xe6\xb5\x8b\xe6\x9b\xb4\xe6\x96\xb0</div>\r\n'
    b'        </div>\r\n'
)

raw = raw.replace(broken, fixed)
assert len(raw) != before
open(P, "wb").write(raw)

b = open(P, "rb").read()
crlf = b.count(b"\r\n"); loneLF = b.count(b"\n") - crlf; loneCR = b.count(b"\r") - crlf
print("after=%d delta=%d crlf=%d loneLF=%d loneCR=%d" % (len(b), len(b) - before, crlf, loneLF, loneCR))
assert loneLF == 0 and loneCR == 0, "EOL BROKEN"
t = b.decode("utf-8")
print("morepage-title count:", t.count("morepage-title"))
print("检测更新 count:", t.count("检测更新"))
print("OK")
