# -*- coding: utf-8 -*-
"""2026-09-11h 部署前差异预检（铁律：上传 server/ 前必做，本地是旧副本）

流程：
1. pscp 从服务器下载待覆盖文件到 Temp（pscp 是原生 Windows 程序，用 Windows 路径）
2. 三层比对：①符号清单（类/顶层函数/路由/模型列） ②忽略空白的实质代码行 ③逐行报告服务器独有行
3. 输出结论：哪些文件可以直接覆盖、哪些必须以服务器版为基线打补丁
"""
import os, re, subprocess, sys

ROOT = r"D:\下载的文件\学习工作台"
TMP = r"C:\Users\ATM\AppData\Local\Temp\precheck_0911h"
FILES = ["main.py", "database.py", "routers/friends.py"]  # news.py 为新增文件，服务器上不存在

s = open(os.path.join(ROOT, "upload_v23.ps1"), encoding="utf-8", errors="replace").read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
PASS, HOST = m.group(1), m.group(2)
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HK = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

os.makedirs(TMP, exist_ok=True)

print("== 1. 下载服务器版本 ==")
ok_files = []
for rel in FILES:
    dst = os.path.join(TMP, rel.replace("/", "_"))
    r = subprocess.run([PSCP, "-pw", PASS, "-batch", "-hostkey", HK,
                        "root@%s:/opt/study-workbench/server/%s" % (HOST, rel), dst],
                       capture_output=True, timeout=120)
    got = os.path.exists(dst) and os.path.getsize(dst) > 0
    print("  %-22s rc=%d %s (%d bytes)" % (rel, r.returncode, "OK" if got else "MISSING",
                                           os.path.getsize(dst) if got else 0))
    if got:
        ok_files.append((rel, dst))

def symbols(path):
    txt = open(path, encoding="utf-8", errors="replace").read()
    routes = set(re.findall(r'@(?:router|app)\.(\w+)\(\s*["\']([^"\']+)["\']', txt))
    classes = set(re.findall(r"^class\s+(\w+)", txt, re.M))
    defs = set(re.findall(r"^(?:async\s+)?def\s+(\w+)", txt, re.M))
    cols = set(re.findall(r"^\s{4}(\w+)\s*=\s*Column\s*\(", txt, re.M))
    return routes, classes, defs, cols

def substance(path):
    out = []
    for line in open(path, encoding="utf-8", errors="replace"):
        t = re.sub(r"\s+", " ", line).strip()
        if not t or t.startswith("#"):
            continue
        out.append(t)
    return out

print("\n== 2. 符号级比对（服务器独有 = 本地缺失，最危险）==")
alarm = False
for rel, srv in ok_files:
    local = os.path.join(ROOT, "server", rel.replace("/", os.sep))
    rs, cs, ds, cols = symbols(srv)
    rl, cl, dl, coll = symbols(local)
    only_srv = {
        "路由": {(m, p) for m, p in rs if (m, p) not in rl},
        "类": {c for c in cs if c not in cl},
        "函数": {d for d in ds if d not in dl},
        "模型列": {c for c in cols if c not in coll},
    }
    only_loc = {
        "路由": {(m, p) for m, p in rl if (m, p) not in rs},
        "类": {c for c in cl if c not in cs},
        "函数": {d for d in dl if d not in ds},
        "模型列": {c for c in coll if c not in cols},
    }
    print("\n--- %s ---" % rel)
    for k, v in only_srv.items():
        if v:
            alarm = True
            print("  [服务器独有-%s] %s" % (k, sorted(v)[:40]))
    for k, v in only_loc.items():
        if v:
            print("  [本地独有-%s] %s" % (k, sorted(v)[:40]))

print("\n== 3. 实质行级比对（服务器有而本地没有的行数）==")
for rel, srv in ok_files:
    local = os.path.join(ROOT, "server", rel.replace("/", os.sep))
    sset = set(substance(srv))
    lset = set(substance(local))
    miss = [l for l in sset if l not in lset]
    extra = [l for l in lset if l not in sset]
    print("\n--- %s --- 服务器独有实质行 %d，本地独有 %d" % (rel, len(miss), len(extra)))
    for l in miss[:25]:
        print("   SRV> " + l[:150])

print("\n== 结论 ==")
print("存在服务器独有符号/行 → 需以服务器版为基线打补丁" if alarm else "未发现服务器独有符号（仍需看行级明细）")
