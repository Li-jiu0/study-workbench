# -*- coding: utf-8 -*-
"""2026-09-13c 部署：批次四上线

前端(web/)：32 个 HTML 页面（27 页版本 20260913c + 5 页不加载 app.js 保持 20260913a）
            + assets 全量（26 JS + 4 CSS）+ assets/data/*.json（18 个）
            + assets/emoji/ + 根目录 data/mock-papers.js（mock_exam 三页引用）

本批 **server/ 零改动** → 不部署任何 server 文件、不重启 study-workbench 服务
（Nginx 直接读静态目录，tar 解压即生效）。

流程：本地打包 → pscp 上传 → 服务器端备份 DB → 解压 → 逐文件 MD5 全量校验 → 校验四件套
排除：*.bak-* / mock-exam.js.removed / tools/_artifacts/ / *.tar.gz
"""
import tarfile, os, subprocess, hashlib, re, time

ROOT = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8d0a1649"
CRED = r"D:\下载的文件\学习工作台\upload_v23.ps1"
STAMP = "20260913c"
TAR_PATH = os.path.join(ROOT, "tools", f"deploy_{STAMP}.tar.gz")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"

# server/ 本批零改动 → 空列表
SERVER_FILES = []

HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    s = open(CRED, encoding="utf-8", errors="replace").read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        raise SystemExit("请设置 SW_HOST / SW_PASS 或检查凭据文件")
    PASS, HOST = m.group(1), m.group(2)


def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd, timeout=420, decode=True):
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    out = r.stdout.decode("utf-8", "replace") if decode else r.stdout
    err = r.stderr.decode("utf-8", "replace") if decode else r.stderr
    return r.returncode, out, err


def plink(remote, timeout=420):
    return run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, f"root@{HOST}", remote], timeout)


# ---------- 0. 本地清单 ----------
pages = sorted(f for f in os.listdir(ROOT) if f.endswith(".html"))
assets_dir = os.path.join(ROOT, "assets")
ASSET_EXTS = {".js", ".css"}
assets = sorted(f for f in os.listdir(assets_dir)
                if os.path.splitext(f)[1].lower() in ASSET_EXTS)
data_dir = os.path.join(assets_dir, "data")
datajson = sorted(f for f in os.listdir(data_dir) if f.endswith(".json"))
emoji_dir = os.path.join(assets_dir, "emoji")
emoji = sorted(f for f in os.listdir(emoji_dir)) if os.path.isdir(emoji_dir) else []
MOCK_REL = "data/mock-papers.js"
MOCK_ABS = os.path.join(ROOT, "data", "mock-papers.js")
if not os.path.isfile(MOCK_ABS):
    raise SystemExit("缺少 data/mock-papers.js")

total_files = len(pages) + len(assets) + len(datajson) + len(emoji) + 1
print(f"[0] 页面 {len(pages)} + assets(js/css) {len(assets)} + data.json {len(datajson)} "
      f"+ emoji {len(emoji)} + mock-papers 1 = {total_files} 个文件")

# ---------- 1. 打包 ----------
if os.path.exists(TAR_PATH):
    os.remove(TAR_PATH)
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for f in pages:
        tar.add(os.path.join(ROOT, f), arcname="web/" + f)
    for f in assets:
        tar.add(os.path.join(assets_dir, f), arcname="web/assets/" + f)
    for f in datajson:
        tar.add(os.path.join(data_dir, f), arcname="web/assets/data/" + f)
    for f in emoji:
        tar.add(os.path.join(emoji_dir, f), arcname="web/assets/emoji/" + f)
    tar.add(MOCK_ABS, arcname="web/" + MOCK_REL)
print(f"[1] 打包完成 {os.path.getsize(TAR_PATH)} bytes -> {os.path.basename(TAR_PATH)}")

# ---------- 2. 上传（幂等）----------
tar_md5 = md5(TAR_PATH)
if os.environ.get("SW_SKIP_UPLOAD") == "1":
    print("[2] SW_SKIP_UPLOAD=1，跳过上传")
else:
    rc, out, _ = plink(f"md5sum {REMOTE_ROOT}/deploy_{STAMP}.tar.gz 2>/dev/null")
    remote_tar_md5 = (out.split()[0] if out.strip() and len(out.split()[0]) == 32 else "")
    if remote_tar_md5 == tar_md5:
        print("[2] 远端已有同 MD5 包，跳过上传")
    else:
        ok_up = False
        for attempt in range(1, 4):
            rc, out, err = run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, TAR_PATH,
                                f"root@{HOST}:{REMOTE_ROOT}/"], timeout=300)
            rc2, out2, _ = plink(f"md5sum {REMOTE_ROOT}/deploy_{STAMP}.tar.gz 2>/dev/null")
            got = (out2.split()[0] if out2.strip() and len(out2.split()[0]) == 32 else "")
            print(f"[2] 上传第 {attempt} 次 rc={rc} 远端MD5={got[:10] or 'NONE'}")
            if got == tar_md5:
                ok_up = True
                break
            time.sleep(3)
        if not ok_up:
            raise SystemExit(f"上传失败（3 次）: {(err or '')[-400:]}")

# ---------- 3. 备份 DB + 解压 + 全量 MD5 ----------
verify_rel = (["web/" + f for f in pages] + ["web/assets/" + f for f in assets]
              + ["web/assets/data/" + f for f in datajson]
              + ["web/assets/emoji/" + f for f in emoji]
              + ["web/" + MOCK_REL])

remote = (
    f"cd {REMOTE_ROOT} || exit 1\n"
    f"mkdir -p backups\n"
    f"cp -a server/data.db backups/data.db.before-{STAMP} 2>/dev/null && echo DB-BACKUP-OK || echo DB-BACKUP-SKIP\n"
    f"tar xzf deploy_{STAMP}.tar.gz -C {REMOTE_ROOT}/ || exit 1\n"
    f"echo '---MD5-BEGIN---'\n"
    f"cd {REMOTE_ROOT}/web && find . -maxdepth 3 -type f "
    f"\\( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' \\) -print0 | xargs -0 md5sum\n"
    f"echo '---MD5-END---'\n"
    f"rm -f {REMOTE_ROOT}/deploy_{STAMP}.tar.gz\n"
)
rc, out, err = plink(remote)
if rc != 0 or "---MD5-BEGIN---" not in out:
    print(f"[3][DEBUG] stderr={err[-300:]!r}")
    raise SystemExit(f"远端解压/校验失败 rc={rc}\n{out[-800:]}\n{err[-400:]}")
block = out.split("---MD5-BEGIN---")[1].split("---MD5-END---")[0]
remote_map = {}
for line in block.strip().splitlines():
    parts = line.split(maxsplit=1)
    if len(parts) == 2:
        remote_map[parts[1].strip().lstrip("./")] = parts[0]
print(f"[3] 远端 MD5 {len(remote_map)} 条；DB 备份: {'OK' if 'DB-BACKUP-OK' in out else 'SKIP'}")


def to_local(rel):
    r = rel[len("web/"):] if rel.startswith("web/") else rel
    return os.path.join(ROOT, r.replace("/", os.sep))


bad = []
for rel in verify_rel:
    key = rel[len("web/"):] if rel.startswith("web/") else rel
    local = md5(to_local(rel))
    rm = remote_map.get(key)
    if rm != local:
        bad.append((rel, local[:10], (rm or "MISSING")[:10]))
print(f"[3] 全量 MD5 校验: {len(verify_rel) - len(bad)}/{len(verify_rel)} 一致")
for rel, l, r_ in bad[:20]:
    print(f"     BAD {rel} local={l} remote={r_}")
if bad:
    raise SystemExit("存在 MD5 不一致，请人工复核（未重启服务）")

# ---------- 4. 校验四件套（本批不重启）----------
remote2 = (
    "echo SERVICE:$(systemctl is-active study-workbench)\n"
    "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
    "echo HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)\n"
    "echo NRESTARTS:$(systemctl show -p NRestarts --value study-workbench)\n"
    "cd /opt/study-workbench/server && python3 -c \"\n"
    "import sqlite3\n"
    "c = sqlite3.connect('data.db')\n"
    "print('USERS:', c.execute('select count(*) from users').fetchone()[0])\n"
    "\"\n"
)
rc, out2, err2 = plink(remote2)
print(f"[4] 校验四件套 rc={rc}")
print(out2)
if err2.strip():
    print("STDERR:", err2[-400:]) 
