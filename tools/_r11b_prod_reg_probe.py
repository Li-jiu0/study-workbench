# -*- coding: utf-8 -*-
"""R11b 只读探针：查线上 /opt/study-workbench/server/data/ 两张模型表里
是否还残留 doubao-seed-2-0-pro / doubao-seedance-1-0-pro / hyper3d-gen2（本地 server/ 是旧副本，
线上可能仍有）。只读，不改任何远端文件。"""
import os, re, io, base64, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'

src = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
if not m:
    print('NO_CRED')
    sys.exit(2)
pwd, host = m.group(1), m.group(2)
print('HOST=%s PWLEN=%d' % (host, len(pwd)))

PY = r'''
import io, json, os
SRV = "/opt/study-workbench/server/data"
TARGETS = ["ark-seed-2-0-pro", "ark-seedance-1-0-pro", "ark-hyper3d-gen2"]
for fn in ["model_registry.json", "model_quota.json"]:
    p = os.path.join(SRV, fn)
    if not os.path.isfile(p):
        print(fn, "MISSING")
        continue
    try:
        d = json.loads(io.open(p, encoding="utf-8").read())
    except Exception as e:
        print(fn, "PARSE_FAIL", e)
        continue
    print("== %s keys=%d ==" % (fn, len(d)))
    for k in TARGETS:
        print("   %-24s present=%s" % (k, k in d))
    sub = [k for k in d if isinstance(k, str) and ("seed-2-0-pro" in k or "hyper3d" in k)]
    print("   substring-hits:", sub)
'''
b64 = base64.b64encode(PY.encode('utf-8')).decode('ascii')
cmd = 'echo %s | base64 -d | python3' % b64

args = [PLINK, '-batch', '-ssh', '-hostkey', HOSTKEY, '-pw', pwd, 'root@' + host, cmd]
r = subprocess.run(args, capture_output=True)
out = (r.stdout or b'').decode('utf-8', 'replace')
err = (r.stderr or b'').decode('utf-8', 'replace')
print('--- rc=%s ---' % r.returncode)
print(out)
if err.strip():
    print('--- stderr ---')
    print(err[:600])
