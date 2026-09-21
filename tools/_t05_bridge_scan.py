# -*- coding: utf-8 -*-
"""调查 Android 桥接是否暴露版本号读取方法。只读。"""
import os

R = r"D:\下载的文件\学习工作台"
OUT = os.path.join(R, "tools", "_t05_bridge_out.txt")
L = []


def w(s=""):
    L.append(str(s))


w("=== android/ 目录文件清单 ===")
ad = os.path.join(R, "android")
if os.path.isdir(ad):
    for dp, dn, fn in os.walk(ad):
        for f in fn:
            w("  " + os.path.relpath(os.path.join(dp, f), R))
else:
    w("  (无 android 目录)")

w("")
w("=== assets 下含 android/bridge 名的文件 ===")
adir = os.path.join(R, "assets")
for f in sorted(os.listdir(adir)):
    if "android" in f.lower() or "bridge" in f.lower():
        w("  " + f)

w("")
w("=== 全库搜索 'androidBridge' / 'AndroidBridge' / version 相关桥接名 ===")
import re
KEYS = [
    "androidBridge", "AndroidBridge", "window.Android", "JavascriptInterface",
    "@JavascriptInterface", "getVersionName", "getVersionCode", "getAppVersion",
    "getPackageInfo", "BuildConfig", "addJavascriptInterface", "postMessage",
]
hits = {k: [] for k in KEYS}
scan_dirs = ["assets", "android", "server"]
exts = (".js", ".java", ".kt", ".xml", ".json", ".py", ".html")
for sd in scan_dirs:
    base = os.path.join(R, sd)
    if not os.path.isdir(base):
        continue
    for dp, dn, fn in os.walk(base):
        for f in fn:
            if not f.lower().endswith(exts):
                continue
            p = os.path.join(dp, f)
            try:
                t = open(p, "r", encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            for k in KEYS:
                if k in t:
                    hits[k].append(os.path.relpath(p, R))
for k in KEYS:
    if hits[k]:
        w("  [%s] -> %d 个文件" % (k, len(hits[k])))
        for h in hits[k][:8]:
            w("        " + h)
    else:
        w("  [%s] -> 0" % k)

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(L))
print("\n".join(L))
