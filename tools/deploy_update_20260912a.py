# -*- coding: utf-8 -*-
"""2026-09-12a 部署：批次五「图标与交互」—— lucide 图标升级 + 版本 bump

**本批零后端改动**（与 20260911i 最大的不同），因此：
  · SERVER_FILES 为空，不打包/不上传/不校验任何 server/ 文件
  · 远端 md5sum 的 server 段必须条件拼接（空列表会拼出裸 `md5sum` 导致 rc!=0）
  · DB 仍照例备份（防御性，零成本）

前端：24 个正式页（图标换 data-icon + 注入 icon-map.js）+ 全量 assets（含新增
      icon-map.js / subpage-router.js）+ emoji/manifest.js
      + 新增一级资源目录 data/（含 data/mock-papers.js）
探针新增：icon-map.js 可达性、线上页面 data-icon 标记数、20260912a 令牌数
      + data/mock-papers.js 可达性（HTTP 码 + 数据标记 MOCK_PAPERS_DATA 命中数）

**data/ 为何必须进清单**：真题模考三级独立页（mock_exam.html / mock_exam_run.html /
mock_exam_result.html）依赖 data/mock-papers.js（window.MOCK_PAPERS_DATA）。该目录漏传时
页面不报错、只显示空题库——典型静默失效。历史前科：assets/emoji/ 曾因 cp 不带 -r 漏拷
导致现网 APK 表情面板长期坏掉。因此本脚本对 data/ 做「本地硬断言 + 上传 + MD5 校验 +
线上探针硬失败」四道关卡。

流程：本地打包 → pscp 上传 → 备份 DB → 解压 → 全量 MD5 → 重启 → 探针
"""
import tarfile, os, subprocess, hashlib, re, time

ROOT = r"D:\下载的文件\学习工作台"
STAMP = "20260912a"
TAR_PATH = os.path.join(ROOT, "tools", f"deploy_{STAMP}.tar.gz")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"

HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    s = open(os.path.join(ROOT, "upload_v23.ps1"), encoding="utf-8", errors="replace").read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        raise SystemExit("请设置 SW_HOST / SW_PASS")
    PASS, HOST = m.group(1), m.group(2)

EXCLUDE_HTML = {'settings.html', '设置_旧版.html', 'profile.html',
                'profile_v2.html', 'profile_v3.html'}
EXCLUDE_PREFIXES = ('settings_', 'profile_', '_preview_', '_t')
ASSET_EXTS = {'.js', '.css'}
SERVER_FILES = []          # ← 本批零后端改动

# 真题模考数据契约标记（见 data/mock-papers.js 末尾 window.MOCK_PAPERS_DATA = {...}）
MOCK_PAPERS_MARK = "MOCK_PAPERS_DATA"
DATA_MUST = ('mock-papers.js',)   # data/ 必含文件：漏了模考三页静默空题库


def md5(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def run(cmd, timeout=420, decode=True):
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    out = r.stdout.decode('utf-8', 'replace') if decode else r.stdout
    err = r.stderr.decode('utf-8', 'replace') if decode else r.stderr
    return r.returncode, out, err


def plink(remote, timeout=420):
    return run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, f"root@{HOST}", remote], timeout)


# ---------- 0. 本地清单 ----------
pages = sorted(f for f in os.listdir(ROOT)
               if f.endswith('.html') and f not in EXCLUDE_HTML
               and not f.startswith(EXCLUDE_PREFIXES))
assets = sorted(f for f in os.listdir(os.path.join(ROOT, 'assets'))
                if os.path.splitext(f)[1].lower() in ASSET_EXTS)
emoji_dir = os.path.join(ROOT, 'assets', 'emoji')
emoji = sorted(os.listdir(emoji_dir)) if os.path.isdir(emoji_dir) else []

# 一级资源目录 data/（递归收集，兼容将来新增子目录／新文件）
data_dir = os.path.join(ROOT, 'data')
data_files = []
if os.path.isdir(data_dir):
    for _dp, _dns, _fns in os.walk(data_dir):
        for _fn in _fns:
            data_files.append(os.path.relpath(os.path.join(_dp, _fn), data_dir).replace(os.sep, '/'))
    data_files.sort()

for must in ('icon-map.js', 'subpage-router.js'):
    if must not in assets:
        raise SystemExit(f"缺少关键前端文件 assets/{must}（漏了它 APK 与网页会静默失效）")

for must in DATA_MUST:
    if must not in data_files:
        raise SystemExit(
            f"缺少关键前端文件 data/{must}（漏了它真题模考三页会静默空题库，务必人工复核）")

print(f"页面 {len(pages)} + assets {len(assets)} + emoji {len(emoji)} "
      f"+ data {len(data_files)} + 后端 {len(SERVER_FILES)}")

# ---------- 1. 打包 ----------
if os.path.exists(TAR_PATH):
    os.remove(TAR_PATH)
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for f in pages:
        tar.add(os.path.join(ROOT, f), arcname='web/' + f)
    for f in assets:
        tar.add(os.path.join(ROOT, 'assets', f), arcname='web/assets/' + f)
    for f in emoji:
        tar.add(os.path.join(emoji_dir, f), arcname='web/assets/emoji/' + f)
    for f in data_files:
        tar.add(os.path.join(data_dir, f.replace('/', os.sep)), arcname='web/data/' + f)
    for rel in SERVER_FILES:
        tar.add(os.path.join(ROOT, 'server', rel.replace('/', os.sep)), arcname='server/' + rel)
print(f"[1] 打包完成 {os.path.getsize(TAR_PATH)} bytes -> {os.path.basename(TAR_PATH)}")

# ---------- 2. 上传（幂等）----------
tar_md5 = md5(TAR_PATH)
if os.environ.get("SW_SKIP_UPLOAD") == "1":
    print("[2] SW_SKIP_UPLOAD=1，跳过上传")
else:
    rc, out, _ = plink(f"md5sum {REMOTE_ROOT}/deploy_{STAMP}.tar.gz 2>/dev/null")
    remote_tar_md5 = (out.split()[0] if out.strip() and len(out.split()[0]) == 32 else '')
    if remote_tar_md5 == tar_md5:
        print("[2] 远端已有同 MD5 包，跳过上传")
    else:
        ok_up = False
        for attempt in range(1, 4):
            rc, out, err = run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, TAR_PATH,
                                f"root@{HOST}:{REMOTE_ROOT}/"], timeout=300)
            rc2, out2, _ = plink(f"md5sum {REMOTE_ROOT}/deploy_{STAMP}.tar.gz 2>/dev/null")
            got = (out2.split()[0] if out2.strip() and len(out2.split()[0]) == 32 else '')
            print(f"[2] 上传第 {attempt} 次 rc={rc} 远端MD5={got[:10] or 'NONE'}")
            if got == tar_md5:
                ok_up = True
                break
            time.sleep(3)
        if not ok_up:
            raise SystemExit(f"上传失败（3 次）: {(err or '')[-400:]}")

# ---------- 3. 备份 + 解压 + 全量 MD5 ----------
verify_rel = (['web/' + f for f in pages] + ['web/assets/' + f for f in assets]
              + ['web/assets/emoji/' + f for f in emoji] + ['web/data/' + f for f in data_files]
              + ['server/' + f for f in SERVER_FILES])
# 空列表时不能拼出裸 md5sum
server_md5_cmd = ("md5sum " + ' '.join(f"server/{f}" for f in SERVER_FILES)) if SERVER_FILES else "true"
remote = (
    f"cd {REMOTE_ROOT} || exit 1\n"
    f"mkdir -p backups\n"
    f"cp -a server/data.db backups/data.db.before-{STAMP} 2>/dev/null && echo DB-BACKUP-OK || echo DB-BACKUP-SKIP\n"
    f"tar xzf deploy_{STAMP}.tar.gz -C {REMOTE_ROOT}/ || exit 1\n"
    f"echo '---MD5-BEGIN---'\n"
    f"cd {REMOTE_ROOT}/web && find . -maxdepth 3 -type f \\( -name '*.html' -o -name '*.js' -o -name '*.css' \\) -print0 | xargs -0 md5sum\n"
    f"cd {REMOTE_ROOT} && {server_md5_cmd}\n"
    f"echo '---MD5-END---'\n"
    f"rm -f {REMOTE_ROOT}/deploy_{STAMP}.tar.gz\n"
)
rc, out, err = plink(remote)
if rc != 0 or '---MD5-BEGIN---' not in out:
    print(f"[3][DEBUG] stderr={err[-300:]!r}")
    raise SystemExit(f"远端解压/校验失败 rc={rc}\n{out[-800:]}\n{err[-400:]}")
block = out.split('---MD5-BEGIN---')[1].split('---MD5-END---')[0]
remote_map = {}
for line in block.strip().splitlines():
    parts = line.split(maxsplit=1)
    if len(parts) == 2:
        remote_map[parts[1].strip().lstrip('./')] = parts[0]
print(f"[3] 远端 MD5 {len(remote_map)} 条；备份: {'OK' if 'DB-BACKUP-OK' in out else 'SKIP'}")


def to_local(rel):
    r = rel[len('web/'):] if rel.startswith('web/') else rel
    return os.path.join(ROOT, r.replace('/', os.sep))


bad = []
for rel in verify_rel:
    key = rel[len('web/'):] if rel.startswith('web/') else rel
    local = md5(to_local(rel))
    rm = remote_map.get(key)
    if rm != local:
        bad.append((rel, local[:10], (rm or 'MISSING')[:10]))
print(f"[3] 全量 MD5 校验: {len(verify_rel) - len(bad)}/{len(verify_rel)} 一致")
for rel, l, r_ in bad[:20]:
    print(f"     BAD {rel} local={l} remote={r_}")
if bad:
    raise SystemExit("存在 MD5 不一致，请人工复核（未重启服务）")

# ---------- 4. 重启 + 探针 ----------
HOME_URL = 'http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html'
remote2 = (
    "systemctl restart study-workbench\n"
    "sleep 8\n"
    "echo SERVICE:$(systemctl is-active study-workbench)\n"
    "echo NRESTARTS:$(systemctl show -p NRestarts --value study-workbench)\n"
    "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
    "echo HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)\n"
    f"echo ICONMAP:$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1/assets/icon-map.js)\n"
    f"echo SUBPAGEROUTER:$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1/assets/subpage-router.js)\n"
    f"echo MOCKPAPERS:$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1/data/mock-papers.js)\n"
    f"echo MOCKPAPERS_MARK:$(curl -s http://127.0.0.1/data/mock-papers.js | grep -c '{MOCK_PAPERS_MARK}')\n"
    f"echo HOME_DATAICON:$(curl -s '{HOME_URL}' | grep -c 'data-icon=')\n"
    f"echo HOME_VER2026:$(curl -s '{HOME_URL}' | grep -c '20260912a')\n"
    f"echo HOME_OLDVER:$(curl -s '{HOME_URL}' | grep -c '20260911i')\n"
    "cd /opt/study-workbench/server && python3 -c \"\n"
    "import sqlite3\n"
    "c = sqlite3.connect('data.db')\n"
    "print('USERS:', c.execute('select count(*) from users').fetchone()[0])\n"
    "print('TABLES:', c.execute('select count(*) from sqlite_master where type=chr(116)||chr(97)||chr(98)||chr(108)||chr(101)').fetchone()[0])\n"
    "\"\n"
    "echo TRACEBACK_10MIN:$(journalctl -u study-workbench --since '10 min ago' 2>/dev/null | grep -ci 'traceback\\|exception' || true)\n"
)
rc2, out2, err2 = plink(remote2, timeout=300)
print("=" * 60)
print(out2.strip())
print("=" * 60)
if rc2 != 0:
    print(f"[4][WARN] 探针 rc={rc2} stderr={err2[-300:]!r}")


def probe(tag, text):
    """探针取值：从 plink 输出里取 `TAG:值` 行的值，缺失返回空串。"""
    m = re.search(rf'^{re.escape(tag)}:(.*)$', text, re.M)
    return m.group(1).strip() if m else ''


mock_code = probe('MOCKPAPERS', out2)
mock_mark = probe('MOCKPAPERS_MARK', out2)
fatal = []
if mock_code != '200':
    fatal.append(f"data/mock-papers.js HTTP={mock_code or 'NONE'}（期望 200："
                 f"非 200 说明 data/ 未随包解压或静态目录未放行）")
if not mock_mark.isdigit() or int(mock_mark) < 1:
    fatal.append(f"data/mock-papers.js 数据标记 {MOCK_PAPERS_MARK} 命中 {mock_mark or 0} 次"
                 f"（期望 >=1：命中 0 说明上线的文件不是真题库）")
if fatal:
    print("[4] data/ 交付管线校验失败（真题模考三页会静默空题库，禁止视为部署成功）：")
    for msg in fatal:
        print("     FATAL " + msg)
    raise SystemExit("data/mock-papers.js 线上不可达或内容不匹配，请检查上传清单与静态目录配置")
print(f"[4] data/ 探针: HTTP={mock_code} {MOCK_PAPERS_MARK}命中={mock_mark}")
print("[4] 部署流程结束")
