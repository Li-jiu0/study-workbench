# -*- coding: utf-8 -*-
"""R44 第三轮：dump 远端 OpenAPI 路径清单，供本地比对聊天会话列表依赖（只读）。

用法：python tools/qa/r44_probe3.py
输出：tools/qa/r44_remote_paths.txt
"""
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_remote_paths.txt")


def load_credentials():
    host = os.environ.get("SW_HOST", "")
    pwd = os.environ.get("SW_PASS", "")
    if not host or not pwd:
        s = open(CRED, encoding="utf-8", errors="replace").read()
        m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
        if not m:
            raise SystemExit("凭据不可得")
        pwd, host = m.group(1), m.group(2)
    return host, pwd


REMOTE = r'''
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in sorted(d.get('paths',{}).keys()):
    print(p)
"
'''


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=300)
    remote_paths = set(x.strip() for x in
                       r.stdout.decode("utf-8", "replace").splitlines() if x.strip())

    # 本地前端引用的 /api/* 路径
    import glob
    local = {}
    for f in glob.glob(os.path.join(ROOT, "assets", "*.js")) + \
             glob.glob(os.path.join(ROOT, "*.html")):
        try:
            t = open(f, encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        for m in re.finditer(r"['\"\`](/api/[A-Za-z0-9_\-/{}.]+)", t):
            local.setdefault(m.group(1), set()).add(os.path.basename(f))

    def norm(p):
        return re.sub(r"\{[^}]+\}", "{}", p)

    rnorm = set(norm(p) for p in remote_paths)
    lines = ["REMOTE_PATH_COUNT=%d" % len(remote_paths), "", "--- 远端全部路径 ---"]
    lines += sorted(remote_paths)
    lines += ["", "--- 前端引用但远端不存在的路径（按规范化模板比对）---"]
    missing = []
    for p in sorted(local):
        if norm(p) not in rnorm:
            missing.append("MISSING %s  <- %s" % (p, ",".join(sorted(local[p]))))
    lines += missing if missing else ["（无）"]
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("WROTE %s (remote=%d, missing=%d)" % (OUT, len(remote_paths), len(missing)))


if __name__ == "__main__":
    main()
