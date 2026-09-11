# -*- coding: utf-8 -*-
"""2026-09-11 第五轮部署：最终需求批次一（A1-A9）+ 语音链路修复（T06）+ 后端改密/语音上传（T02）

前端(web/)：
  全部在用页面（27 + 新增 更多.html / 工具.html = 29 个，含此前被错误排除的 学途.html / blog_wechat.html）
  assets：app.js / api.js / chat-local.js / common.css / study-stats.js 等（全量打包）
  版本号统一 ?v=20260911g
后端(server/)：
  config.py / database.py / filecheck.py / schemas.py / requirements.txt
  routers/{auth,chat,groups,social,uploads}.py

流程：本地打包 → pscp 上传 → 备份 DB → 服务器端解压 → **全量 MD5 逐文件校验** → 重启 → 探针
凭据：环境变量 SW_HOST / SW_PASS；缺失时从被 gitignore 的 upload_v23.ps1 正则提取（不硬编码、不落库）
"""
import tarfile, os, subprocess, hashlib, re, sys, time

ROOT = r"D:\下载的文件\学习工作台"
STAMP = "20260911e"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"

HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    _s = open(os.path.join(ROOT, "upload_v23.ps1"), encoding="utf-8", errors="replace").read()
    _m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', _s)
    if not _m:
        raise SystemExit("请先设置 SW_HOST / SW_PASS（或确保 upload_v23.ps1 可解析）")
    PASS, HOST = _m.group(1), _m.group(2)

# 页面排除规则：只排除明确的英文遗留副本；学途.html / blog_wechat.html 在服务器上存在且令牌陈旧，本次一并更新
EXCLUDE_HTML = {'settings.html', '设置_旧版.html', 'profile.html', 'profile_v2.html', 'profile_v3.html'}
EXCLUDE_PREFIXES = ('settings_', 'profile_', '_preview_', '_t')
ASSET_EXTS = {'.js', '.css'}

SERVER_FILES = [
    'config.py', 'database.py', 'filecheck.py', 'schemas.py', 'requirements.txt',
    'routers/auth.py', 'routers/chat.py', 'routers/groups.py',
    'routers/social.py', 'routers/uploads.py',
]


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
    return run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, "root@" + HOST, remote], timeout)


# ---------- 0. 本地清单 ----------
pages = sorted(f for f in os.listdir(ROOT)
               if f.endswith('.html') and f not in EXCLUDE_HTML
               and not f.startswith(EXCLUDE_PREFIXES))
assets = sorted(f for f in os.listdir(os.path.join(ROOT, 'assets'))
                if os.path.splitext(f)[1].lower() in ASSET_EXTS)
emoji_dir = os.path.join(ROOT, 'assets', 'emoji')
emoji = sorted(os.listdir(emoji_dir)) if os.path.isdir(emoji_dir) else []
missing = [rel for rel in SERVER_FILES
           if not os.path.isfile(os.path.join(ROOT, 'server', rel.replace('/', os.sep)))]
if missing:
    raise SystemExit("缺少后端文件: %s" % missing)
print("页面 %d + assets %d + emoji %d + 后端 %d" % (len(pages), len(assets), len(emoji), len(SERVER_FILES)))

# ---------- 1. 打包 ----------
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for f in pages:
        tar.add(os.path.join(ROOT, f), arcname='web/' + f)
    for f in assets:
        tar.add(os.path.join(ROOT, 'assets', f), arcname='web/assets/' + f)
    for f in emoji:
        tar.add(os.path.join(emoji_dir, f), arcname='web/assets/emoji/' + f)
    for rel in SERVER_FILES:
        tar.add(os.path.join(ROOT, 'server', rel.replace('/', os.sep)), arcname='server/' + rel)
print("[1] 打包完成 %d bytes -> %s" % (os.path.getsize(TAR_PATH), os.path.basename(TAR_PATH)))

# ---------- 2. 上传（幂等：远端已有同 MD5 包则跳过；否则重试 3 次；SW_SKIP_UPLOAD=1 时跳过） ----------
tar_md5 = md5(TAR_PATH)
if os.environ.get("SW_SKIP_UPLOAD") == "1":
    print("[2] SW_SKIP_UPLOAD=1，跳过上传（假定远端安装包已就位）")
else:
    rc, out, err = plink("md5sum %s/deploy_%s.tar.gz 2>/dev/null" % (REMOTE_ROOT, STAMP))
    remote_tar_md5 = (out.split()[0] if out.strip() and len(out.split()[0]) == 32 else '')
    if remote_tar_md5 == tar_md5:
        print("[2] 远端已有同 MD5 安装包，跳过上传")
    else:
        ok_up = False
        for attempt in range(1, 4):
            rc, out, err = run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, TAR_PATH,
                                "root@%s:%s/" % (HOST, REMOTE_ROOT)])
            rc2, out2, _ = plink("md5sum %s/deploy_%s.tar.gz 2>/dev/null" % (REMOTE_ROOT, STAMP))
            got = (out2.split()[0] if out2.strip() and len(out2.split()[0]) == 32 else '')
            print("[2] 上传第 %d 次 rc=%d 远端MD5=%s" % (attempt, rc, got[:10] or 'NONE'))
            if got == tar_md5:
                ok_up = True
                break
            time.sleep(3)
        if not ok_up:
            raise SystemExit("上传失败（3 次）: %s" % (err or '')[-400:])

# ---------- 3. 备份 + 解压 + 全量 MD5 ----------
verify_rel = (['web/' + f for f in pages] + ['web/assets/' + f for f in assets]
              + ['web/assets/emoji/' + f for f in emoji] + ['server/' + f for f in SERVER_FILES])
remote = r"""cd %s || exit 1
mkdir -p backups
cp -a server/data.db "backups/data.db.before-%s" 2>/dev/null && echo "DB-BACKUP-OK" || echo "DB-BACKUP-SKIP"
tar xzf deploy_%s.tar.gz -C %s/ || exit 1
echo '---MD5-BEGIN---'
cd %s/web && find . -maxdepth 3 -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) -print0 | xargs -0 md5sum
cd %s && md5sum %s
echo '---MD5-END---'
rm -f %s/deploy_%s.tar.gz
""" % (REMOTE_ROOT, STAMP, STAMP, REMOTE_ROOT, REMOTE_ROOT, REMOTE_ROOT,
       ' '.join('server/' + f for f in SERVER_FILES), REMOTE_ROOT, STAMP)
rc, out, err = plink(remote)
if rc != 0 or '---MD5-BEGIN---' not in out:
    print("[3][DEBUG] remote 命令长度=%d 行数=%d" % (len(remote), len(remote.split('\n'))))
    print("[3][DEBUG] 首行=%r 末行=%r" % (remote.split('\n')[0], remote.split('\n')[-1]))
    print("[3][DEBUG] stderr=%r" % (err[-300:],))
    raise SystemExit("远端解压/校验失败 rc=%d\n%s\n%s" % (rc, out[-800:], err[-400:]))
block = out.split('---MD5-BEGIN---')[1].split('---MD5-END---')[0]
remote_map = {}
for line in block.strip().splitlines():
    parts = line.split()
    if len(parts) >= 2:
        remote_map[parts[1].strip().lstrip('./')] = parts[0]
print("[3] 远端返回 MD5 %d 条；备份: %s" % (len(remote_map), 'DB-BACKUP-OK' if 'DB-BACKUP-OK' in out else 'SKIP'))

def to_local(rel):
    """verify_rel 带 'web/' 前缀（包内路径），本地无 web/ 子目录：
    web/xxx.html -> ROOT\\xxx.html ; web/assets/y -> ROOT\\assets\\y ; server/z -> ROOT\\server\\z"""
    r = rel[len('web/'):] if rel.startswith('web/') else rel
    return os.path.join(ROOT, r.replace('/', os.sep))


bad = []
for rel in verify_rel:
    key = rel[len('web/'):] if rel.startswith('web/') else rel
    local = md5(to_local(rel))
    rm = remote_map.get(key)
    if rm != local:
        bad.append((rel, local[:10], (rm or 'MISSING')[:10]))
print("[3] 全量 MD5 校验: %d/%d 一致" % (len(verify_rel) - len(bad), len(verify_rel)))
for rel, l, r in bad[:20]:
    print("     BAD %s local=%s remote=%s" % (rel, l, r))
if bad:
    raise SystemExit("存在 MD5 不一致，请人工复核（未重启服务）")

# ---------- 4. 重启 + 探针 ----------
remote2 = r"""systemctl restart study-workbench
sleep 8
echo "SERVICE:$(systemctl is-active study-workbench)"
echo "NRESTARTS:$(systemctl show -p NRestarts --value study-workbench)"
echo "SITE:$(curl -s -o /dev/null -w '%%{http_code}' http://127.0.0.1/)"
echo "HEALTH:$(curl -s -o /dev/null -w '%%{http_code}' http://127.0.0.1:8000/api/health)"
echo "MORE:$(curl -s -o /dev/null -w '%%{http_code}' 'http://127.0.0.1/%%E6%%9B%%B4%%E5%%A4%%9A.html')"
echo "TOOLS:$(curl -s -o /dev/null -w '%%{http_code}' 'http://127.0.0.1/%%E5%%B7%%A5%%E5%%85%%B7.html')"
echo "XUETU:$(curl -s -o /dev/null -w '%%{http_code}' 'http://127.0.0.1/%%E5%%AD%%A6%%E9%%80%%94.html')"
echo "OPENAPI_CP:$(curl -s http://127.0.0.1:8000/openapi.json | grep -c change-password)"
echo "OPENAPI_VOICE:$(curl -s http://127.0.0.1:8000/openapi.json | grep -c 'uploads/voice')"
cd %s/server && python3 -c "
import sqlite3
c = sqlite3.connect('data.db')
print('USERS:', c.execute('select count(*) from users').fetchone()[0])
cols = [r[1] for r in c.execute('PRAGMA table_info(users)').fetchall()]
print('USERS.token_version:', 'YES' if 'token_version' in cols else 'NO')
t = [r[0] for r in c.execute(\"select name from sqlite_master where type='table'\").fetchall()]
print('TABLES:', len(t))
"
echo "TRACEBACK_10MIN:$(journalctl -u study-workbench --since '10 min ago' --no-pager -o cat | grep -icE 'traceback|exception')"
""" % REMOTE_ROOT
rc, out2, err2 = plink(remote2)
print("[4] 重启与探针 rc=%d" % rc)
print(out2)
if err2.strip():
    print("STDERR:", err2[-400:])
