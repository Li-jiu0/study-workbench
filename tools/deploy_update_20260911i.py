# -*- coding: utf-8 -*-
"""2026-09-11i 部署：批次四（隐私与群设置）+ BUG-1/BUG-2 修复

前端(web/)：
  全部在用页面（版本号统一 ?v=20260911i）+ 全量 assets + emoji
后端(server/)白名单（8 个文件）：
  main.py / database.py / schemas.py
  routers/{auth,users,friends,moments,groups}.py
  · 5 列守卫式 ALTER（moment_visibility/friend_allow/searchable/announcement/group_nickname）
  · PUT /api/users/me/privacy + GET /auth/me 增 privacy
  · 搜索过滤 + 加好友三档 + feed 剔除 private + BUG-1/BUG-2 修复
  · 群 PATCH ×2 + GET /gid 扩展 + 群名片序列化

流程：本地打包 → pscp 上传 → 备份 DB → 服务器端解压 → 全量 MD5 逐文件校验 → 重启 → 探针
"""
import tarfile, os, subprocess, hashlib, re, time

ROOT = r"D:\下载的文件\学习工作台"
STAMP = "20260911i"
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

EXCLUDE_HTML = {'settings.html', '设置_旧版.html', 'profile.html', 'profile_v2.html', 'profile_v3.html'}
EXCLUDE_PREFIXES = ('settings_', 'profile_', '_preview_', '_t')
ASSET_EXTS = {'.js', '.css'}
SERVER_FILES = [
    'main.py', 'database.py', 'schemas.py',
    'routers/auth.py', 'routers/users.py',
    'routers/friends.py', 'routers/moments.py', 'routers/groups.py',
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
    return run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, f"root@{HOST}", remote], timeout)


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
    raise SystemExit(f"缺少后端文件: {missing}")
print(f"页面 {len(pages)} + assets {len(assets)} + emoji {len(emoji)} + 后端 {len(SERVER_FILES)}")

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
    for rel in SERVER_FILES:
        tar.add(os.path.join(ROOT, 'server', rel.replace('/', os.sep)), arcname='server/' + rel)
print(f"[1] 打包完成 {os.path.getsize(TAR_PATH)} bytes -> {os.path.basename(TAR_PATH)}")

# ---------- 2. 上传（幂等：远端已有同 MD5 包则跳过）----------
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
              + ['web/assets/emoji/' + f for f in emoji] + ['server/' + f for f in SERVER_FILES])
remote = (
    f"cd {REMOTE_ROOT} || exit 1\n"
    f"mkdir -p backups\n"
    f"cp -a server/data.db backups/data.db.before-{STAMP} 2>/dev/null && echo DB-BACKUP-OK || echo DB-BACKUP-SKIP\n"
    f"tar xzf deploy_{STAMP}.tar.gz -C {REMOTE_ROOT}/ || exit 1\n"
    f"echo '---MD5-BEGIN---'\n"
    f"cd {REMOTE_ROOT}/web && find . -maxdepth 3 -type f \\( -name '*.html' -o -name '*.js' -o -name '*.css' \\) -print0 | xargs -0 md5sum\n"
    f"cd {REMOTE_ROOT} && md5sum " + ' '.join(f"server/{f}" for f in SERVER_FILES) + "\n"
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
remote2 = (
    "systemctl restart study-workbench\n"
    "sleep 8\n"
    "echo SERVICE:$(systemctl is-active study-workbench)\n"
    "echo NRESTARTS:$(systemctl show -p NRestarts --value study-workbench)\n"
    "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
    "echo HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)\n"
    "echo MORE:$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1/%E6%9B%B4%E5%A4%9A.html')\n"
    "echo OPENAPI_PRIVACY:$(curl -s http://127.0.0.1:8000/openapi.json | grep -c 'me/privacy')\n"
    "echo OPENAPI_PATCH_GRP:$(curl -s http://127.0.0.1:8000/openapi.json | grep -c '/groups/{gid}')\n"
    "echo OPENAPI_MOM_FEED:$(curl -s http://127.0.0.1:8000/openapi.json | grep -c '/moments/feed')\n"
    "echo OPENAPI_USERSEARCH:$(curl -s http://127.0.0.1:8000/openapi.json | grep -c '/friends/search')\n"
    "cd /opt/study-workbench/server && python3 -c \"\n"
    "import sqlite3\n"
    "c = sqlite3.connect('data.db')\n"
    "print('USERS:', c.execute('select count(*) from users').fetchone()[0])\n"
    "ucols = [r[1] for r in c.execute('PRAGMA table_info(users)').fetchall()]\n"
    "print('USERS.moment_visibility:', 'YES' if 'moment_visibility' in ucols else 'NO')\n"
    "print('USERS.friend_allow:', 'YES' if 'friend_allow' in ucols else 'NO')\n"
    "print('USERS.searchable:', 'YES' if 'searchable' in ucols else 'NO')\n"
    "gcols = [r[1] for r in c.execute('PRAGMA table_info(chat_groups)').fetchall()]\n"
    "print('GROUPS.announcement:', 'YES' if 'announcement' in gcols else 'NO')\n"
    "mcols = [r[1] for r in c.execute('PRAGMA table_info(chat_group_members)').fetchall()]\n"
    "print('MEMBERS.group_nickname:', 'YES' if 'group_nickname' in mcols else 'NO')\n"
    "\"\n"
    "echo TRACEBACK_10MIN:$(journalctl -u study-workbench --since '10 min ago' --no-pager -o cat | grep -icE 'traceback|exception')\n"
)
rc, out2, err2 = plink(remote2)
print(f"[4] 重启与探针 rc={rc}")
print(out2)
if err2.strip():
    print("STDERR:", err2[-400:])