# -*- coding: utf-8 -*-
"""R44 第七轮：比对生产 server/*.py 与本地，列出所有待部署文件（只读）。

用法：python tools/qa/r44_probe7.py
输出：tools/qa/r44_server_diff.txt
"""
import hashlib
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_server_diff.txt")


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


REMOTE = (
    "cd /opt/study-workbench/server && "
    "find . -name '*.py' -not -path './.venv/*' -not -path './__pycache__/*' "
    "-not -path '*/__pycache__/*' -print0 | xargs -0 md5sum"
)


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=300)
    remote = {}
    for line in r.stdout.decode("utf-8", "replace").splitlines():
        parts = line.split()
        if len(parts) == 2 and len(parts[0]) == 32:
            remote[parts[1].lstrip("./")] = parts[0]

    local = {}
    for sub in ("", "routers"):
        d = os.path.join(ROOT, "server", sub) if sub else os.path.join(ROOT, "server")
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".py"):
                continue
            p = os.path.join(d, fn)
            if not os.path.isfile(p):
                continue
            rel = (sub + "/" + fn) if sub else fn
            local[rel] = md5(p)

    only_local, only_remote, differ, same = [], [], [], []
    for rel, h in sorted(local.items()):
        if rel not in remote:
            only_local.append(rel)
        elif remote[rel] != h:
            differ.append(rel)
        else:
            same.append(rel)
    for rel in sorted(remote):
        if rel not in local:
            only_remote.append(rel)

    lines = []
    lines.append("=== 结论：需随本批一起部署的 server 文件 ===")
    lines.append("仅本地有（生产缺失，必须新增）: %s" %
                 (", ".join(only_local) or "（无）"))
    lines.append("两边都有但内容不同（必须更新）: %s" %
                 (", ".join(differ) or "（无）"))
    lines.append("完全一致（无需动）: %d 个" % len(same))
    lines.append("仅生产有（本地已删？留意）: %s" %
                 (", ".join(only_remote) or "（无）"))
    lines.append("")
    lines.append("=== 明细 ===")
    for rel in only_local:
        lines.append("  [NEW]      %s" % rel)
    for rel in differ:
        lines.append("  [MODIFIED] %s" % rel)
    for rel in same:
        lines.append("  [same]     %s" % rel)
    for rel in only_remote:
        lines.append("  [REMOTE-ONLY] %s" % rel)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("WROTE %s (new=%d mod=%d same=%d)" %
          (OUT, len(only_local), len(differ), len(same)))


if __name__ == "__main__":
    main()
