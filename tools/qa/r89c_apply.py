# -*- coding: utf-8 -*-
"""R89-C: inject App brand icon block into 更新.html (CRLF binary-safe) + CSS."""
import os

BASE = r"D:\下载的文件\学习工作台"
P = os.path.join(BASE, "更新.html")

raw = open(P, "rb").read()
before = len(raw)

# ---------- 1. Inject CSS before the closing </style> (line 101) ----------
# Anchor: the existing media query block end then "\r\n</style>\r\n</head>"
css_anchor = b"</style>\r\n</head>"
assert raw.count(css_anchor) == 1, "css anchor count=%d" % raw.count(css_anchor)

css_new = (
    b"\r\n"
    b"/* App \xe8\xbd\xaf\xe4\xbb\xb6\xe5\x9b\xbe\xe6\xa0\x87\xe5\x9d\x97\xef\xbc\x88\xe5\x93\x81\xe7\x89\x8c\xe6\xa0\x87\xe8\xaf\x86\xef\xbc\x89 */\r\n"
    b".xt-up-brand{display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;gap:12px;\r\n"
    b"  background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:14px;\r\n"
    b"  padding:14px 16px;margin-top:12px;}\r\n"
    b".xt-up-brand-icon{width:52px;height:52px;border-radius:14px;flex:0 0 52px;\r\n"
    b"  background:linear-gradient(135deg,#5B8DEF,#2F6BFF);color:#fff;\r\n"
    b"  display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;\r\n"
    b"  -webkit-box-pack:center;justify-content:center;}\r\n"
    b".xt-up-brand-icon svg{display:block;}\r\n"
    b".xt-up-brand-info{min-width:0;-webkit-box-flex:1;flex:1;}\r\n"
    b".xt-up-brand-name{font-size:16px;font-weight:800;color:var(--text,#1a1b1c);\r\n"
    b"  line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\r\n"
    b".xt-up-brand-sub{font-size:12.5px;color:var(--text-secondary,#6b7280);\r\n"
    b"  margin-top:3px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\r\n"
    b"@media (max-width:360px){\r\n"
    b"  .xt-up-brand{padding:12px;gap:10px;}\r\n"
    b"  .xt-up-brand-icon{width:44px;height:44px;flex:0 0 44px;border-radius:12px;}\r\n"
    b"  .xt-up-brand-name{font-size:15px;}\r\n"
    b"  .xt-up-brand-sub{font-size:12px;}\r\n"
    b"}\r\n"
)

raw = raw.replace(css_anchor, css_new + css_anchor)
assert len(raw) != before, "css replace failed"

# ---------- 2. Inject brand block right after </div> of .morepage-head ----------
# Anchor: the morepage-head block closing. We insert after the title line's parent div.
head_anchor = (
    b'          <div class="morepage-title"><span class="nav-icon" data-icon="download" data-icon-size="18"></span> \xe6\xa3\x80\xe6\xb5\x8b\xe6\x9b\xb4\xe6\x96\xb0</div>\r\n'
    b'        </div>\r\n'
)
assert raw.count(head_anchor) == 1, "head anchor count=%d" % raw.count(head_anchor)

brand_block = (
    b'        </div>\r\n'
    b'\r\n'
    b'        <!-- R89-C\xef\xbc\x9a\xe6\xa3\x80\xe6\xb5\x8b\xe6\x9b\xb4\xe6\x96\xb0\xe9\xa1\xb5 App \xe8\xbd\xaf\xe4\xbb\xb6\xe5\x9b\xbe\xe6\xa0\x87\xe5\x9d\x97\xef\xbc\x88\xe5\x93\x81\xe7\x89\x8c\xe6\xa0\x87\xe8\xaf\x86\xef\xbc\x89\xef\xbc\x8c\xe5\x9b\xbe\xe6\xa0\x87\xe8\xb5\xb0 data-icon \xe4\xbd\x93\xe7\xb3\xbb -->\r\n'
    b'        <div class="xt-up-brand">\r\n'
    b'          <div class="xt-up-brand-icon"><span class="nav-icon" data-icon="book-open" data-icon-size="28"></span></div>\r\n'
    b'          <div class="xt-up-brand-info">\r\n'
    b'            <div class="xt-up-brand-name">\xe6\x98\x9f\xe9\x80\x94</div>\r\n'
    b'            <div class="xt-up-brand-sub">\xe8\x87\xb4\xe8\xbf\xbd\xe6\xa2\xa6\xe7\x9a\x84\xe4\xba\xba \xc2\xb7 \xe4\xbf\xae\xe8\xba\xab</div>\r\n'
    b'          </div>\r\n'
    b'        </div>\r\n'
)

raw = raw.replace(head_anchor, brand_block)
assert len(raw) != before

open(P, "wb").write(raw)
print("更新.html: before=%d after=%d delta=%d" % (before, len(raw), len(raw) - before))

# verify line endings preserved
b = open(P, "rb").read()
crlf = b.count(b"\r\n")
loneLF = b.count(b"\n") - crlf
loneCR = b.count(b"\r") - crlf
print("更新.html EOL check: crlf=%d loneLF=%d loneCR=%d" % (crlf, loneLF, loneCR))
assert loneLF == 0 and loneCR == 0, "EOL BROKEN"
print("OK")
