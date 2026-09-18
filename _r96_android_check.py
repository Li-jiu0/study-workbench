# -*- coding: utf-8 -*-
"""R96 安卓壳定位修复 —— 校验脚本。
输出 _r96_android_check.txt，供 Read 工具读取（stdout 在本环境不可用）。
校验项：
  1. 两文件字节数 + 行尾统计（crlf / loneLF）
  2. Manifest 两个定位权限行内容 + 命中计数
  3. MainActivity 关键标识命中计数
  4. MainActivity 括号配对计数
  5. versionCode/versionName 未被改动
"""

MAIN = r"D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java"
MANIFEST = r"D:\下载的文件\学习工作台\android\AndroidManifest.xml"
OUT = r"D:\下载的文件\学习工作台\_r96_android_check.txt"

# 改前基线（来自 _r96_lineend_test.txt）
BASE = {
    MAIN: 52648,
    MANIFEST: 3307,
}


def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()


def stats(data):
    crlf = data.count(b"\r\n")
    lone_lf = data.count(b"\n") - crlf
    lone_cr = data.count(b"\r") - crlf
    return len(data), crlf, lone_lf, lone_cr


lines = []
w = lines.append

w("=" * 68)
w("R96 安卓壳定位修复 · 校验报告")
w("=" * 68)
w("")

# ---------- 1. 字节数 + 行尾 ----------
w("[1] 文件字节数 / 行尾")
for p in (MAIN, MANIFEST):
    data = read_bytes(p)
    n, crlf, lone_lf, lone_cr = stats(data)
    delta = n - BASE[p]
    w("  %s" % p.split("学习工作台")[-1])
    w("    before=%d  after=%d  delta=%+d" % (BASE[p], n, delta))
    w("    crlf=%d  loneLF=%d  loneCR=%d" % (crlf, lone_lf, lone_cr))
w("")

# ---------- 2. Manifest 定位权限 ----------
w("[2] AndroidManifest.xml 定位权限")
mbytes = read_bytes(MANIFEST)
w("  ACCESS_COARSE_LOCATION 命中=%d" % mbytes.count(b"ACCESS_COARSE_LOCATION"))
w("  ACCESS_FINE_LOCATION   命中=%d" % mbytes.count(b"ACCESS_FINE_LOCATION"))
for raw in mbytes.split(b"\r\n"):
    if b"LOCATION" in raw:
        w("    行内容: %s" % raw.decode("utf-8").strip())
w("  uses-feature gps required=true 命中(应为0)=%d"
  % mbytes.count(b'hardware.location.gps" android:required="true"'))
w("")

# ---------- 3. MainActivity 关键标识 ----------
w("[3] MainActivity.java 关键标识命中（均须 >=1）")
mtext = mbytes_java = None
jbytes = read_bytes(MAIN)
checks = [
    ("setGeolocationEnabled", b"setGeolocationEnabled"),
    ("onGeolocationPermissionsShowPrompt", b"onGeolocationPermissionsShowPrompt"),
    ("maybeRequestLocationPermission", b"maybeRequestLocationPermission"),
    ("ACCESS_FINE_LOCATION", b"ACCESS_FINE_LOCATION"),
    ("ACCESS_COARSE_LOCATION", b"ACCESS_COARSE_LOCATION"),
    ("REQ_LOCATION_PERM", b"REQ_LOCATION_PERM"),
    ("GeolocationPermissions (全限定)", b"android.webkit.GeolocationPermissions"),
]
for name, pat in checks:
    c = jbytes.count(pat)
    w("  %-38s 命中=%d  %s" % (name, c, "OK" if c >= 1 else "!! FAIL"))
w("")

# ---------- 4. 括号配对 ----------
w("[4] MainActivity.java 括号配对")
jtext = jbytes.decode("utf-8")
for op, cl, label in (("{", "}", "大括号"), ("(", ")", "小括号")):
    no, nc = jtext.count(op), jtext.count(cl)
    w("  %s  '%s'=%d  '%s'=%d  %s" % (label, op, no, cl, nc,
      "相等 OK" if no == nc else "!! 不等 FAIL"))
w("")

# ---------- 5. 版本号未改 ----------
w("[5] 版本号未被改动（须各命中 1，且值正确）")
w('  versionCode="24"  命中=%d  %s'
  % (mbytes.count(b'versionCode="24"'),
     "OK" if mbytes.count(b'versionCode="24"') == 1 else "!! FAIL"))
w('  versionName="1.23" 命中=%d  %s'
  % (mbytes.count(b'versionName="1.23"'),
     "OK" if mbytes.count(b'versionName="1.23"') == 1 else "!! FAIL"))
w("")

# ---------- 6. 保留项未被破坏 ----------
w("[6] 必须保留的既有结构（各须 >=1）")
preserve = [
    (b'<queries>', "queries 包可见性段"),
    (b'TTS_SERVICE', "TTS_SERVICE 动作"),
    (b'MsgPollService', "MsgPollService 服务"),
    (b'usesCleartextTraffic', "usesCleartextTraffic"),
    (b'foregroundServiceType="dataSync"', "dataSync 前台服务类型"),
]
for pat, name in preserve:
    w("  %-28s 命中=%d  %s" % (name, mbytes.count(pat), "OK" if mbytes.count(pat) >= 1 else "!! FAIL"))
w("")
w("=" * 68)
w("校验结束")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("ok")
