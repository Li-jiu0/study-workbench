# -*- coding: utf-8 -*-
"""2026-09-11i 部署前差异预检（隐私与群设置批次四）

扩展自 0911h：
- 8 个后端文件白名单（数据库/模型/6 个路由）
- 新增 router 文件（moments.py / groups.py / auth.py / users.py）服务器上可能不存在，做条件比对
- 输出哪些文件可直传、哪些需以服务器版为基线打补丁
"""
import os, re, subprocess, sys

ROOT = r"D:\下载的文件\学习工作台"
TMP = r"C:\Users\ATM\AppData\Local\Temp\precheck_0911i"
SERVER_FILES = [
    "main.py", "database.py", "schemas.py",
    "routers/auth.py", "routers/users.py",
    "routers/friends.py", "routers/moments.py", "routers/groups.py",
]

s = open(os.path.join(ROOT, "upload_v23.ps1"), encoding="utf-8", errors="replace").read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
if not m:
    raise SystemExit("regex failed on upload_v23.ps1")
PASS, HOST = m.group(1), m.group(2)
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HK = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE = "/opt/study-workbench/server"

os.makedirs(TMP, exist_ok=True)

print(f"== 1. 下载服务器版本（HOST={HOST}）==")
ok_files = []
for rel in SERVER_FILES:
    dst = os.path.join(TMP, rel.replace("/", "_"))
    if os.path.exists(dst):
        os.remove(dst)
    r = subprocess.run([PSCP, "-pw", PASS, "-batch", "-hostkey", HK,
                        f"root@{HOST}:{REMOTE}/{rel}", dst],
                       capture_output=True, timeout=60)
    # pscp 文件不存在时会返回非零且不写文件
    got = os.path.exists(dst) and os.path.getsize(dst) > 0
    label = "OK" if got else ("MISSING" if r.returncode != 0 else "EMPTY")
    sz = os.path.getsize(dst) if got else 0
    print(f"  {rel:30s} rc={r.returncode:3d} {label:8s} {sz:>8} bytes")
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


print("\n== 2. 符号级比对 ==")
alarm = False
for rel, srv in ok_files:
    local = os.path.join(ROOT, "server", rel.replace("/", os.sep))
    rs, cs, ds, cols = symbols(srv)
    rl, cl, dl, coll = symbols(local)
    only_srv = {
        "路由": sorted({(m, p) for (m, p) in rs if (m, p) not in rl}),
        "类": sorted({c for c in cs if c not in cl}),
        "函数": sorted({d for d in ds if d not in dl}),
        "模型列": sorted({c for c in cols if c not in coll}),
    }
    only_loc = {
        "路由": sorted({(m, p) for (m, p) in rl if (m, p) not in rs}),
        "类": sorted({c for c in cl if c not in cs}),
        "函数": sorted({d for d in dl if d not in ds}),
        "模型列": sorted({c for c in coll if c not in cols}),
    }
    srv_only_has = any(only_srv.values())
    print(f"\n--- {rel} ---")
    if srv_only_has:
        alarm = True
        for k, v in only_srv.items():
            if v:
                print(f"  [服务器独有·{k}] {v[:30]}")
    for k, v in only_loc.items():
        if v:
            print(f"  [本地新增·{k}] {v[:30]}")
    if not srv_only_has and not any(only_loc.values()):
        print("  (符号无差异)")


print("\n== 3. 实质行级比对（服务器独有行 = 本地缺失，需打补丁）==")
for rel, srv in ok_files:
    local = os.path.join(ROOT, "server", rel.replace("/", os.sep))
    sset = set(substance(srv))
    lset = set(substance(local))
    miss = sorted(l for l in sset if l not in lset)
    extra = sorted(l for l in lset if l not in sset)
    print(f"\n--- {rel} --- 服务器独有 {len(miss)}，本地新增 {len(extra)}")
    for l in miss[:15]:
        print(f"   SRV> {l[:160]}")


print("\n== 结论 ==")
print("  alarm=True: 需要以服务器版为基线打补丁（不直接覆盖）" if alarm else "  alarm=False: 可直传（仍需 MD5 校验）")
print(f"  本批白名单: {len(SERVER_FILES)} 个文件，服务器存在: {len(ok_files)} 个")