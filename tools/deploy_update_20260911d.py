# -*- coding: utf-8 -*-
"""2026-09-11 第四轮增量部署（社交互动 7 项 + 六模块深度优化）

前端(web/)：
  新增 动态.html；改动 私聊/个人中心/设置/四级备考/央国企笔试/高情商表达/商务礼仪面试/PPT训练/学习工作台
  assets：chat-local.js / common.css 改动；新增 study-stats.js、emoji/manifest.js
后端(server/)：
  改动 database.py / main.py / schemas.py / security.py / routers/{chat,users,social}.py
  新增 routers/{groups,moments,feedback,study}.py
  （注意：本地 server/ 是旧副本，**只传上面这些**，绝不整目录覆盖）

流程：打包 tar.gz → pscp 上传 → 服务器端解压 → MD5 逐文件校验 → 重启服务 → 冒烟校验
凭据：环境变量 SW_HOST / SW_PASS（禁止硬编码）
"""
import tarfile, os, subprocess, hashlib, sys

ROOT = r"D:\下载的文件\学习工作台"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_20260911d.tar.gz")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")

HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    raise SystemExit("请先设置环境变量 SW_HOST 与 SW_PASS（服务器地址与密码）")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

EXCLUDE_HTML = {
    'settings.html', '设置_旧版.html', 'profile.html',
    'profile_v2.html', 'profile_v3.html', '学途.html',
    'blog_wechat.html',   # 历史遗留草稿（未被引用，真实页面为 学习博客.html）
}
EXCLUDE_PREFIXES = ('settings_', 'profile_', '_preview_', '_t')
ASSET_EXTS = {'.js', '.css'}

# 本次需要上传的 server 文件（相对 server/）
SERVER_FILES = [
    'database.py', 'main.py', 'schemas.py', 'security.py',
    'routers/chat.py', 'routers/users.py', 'routers/social.py',
    'routers/groups.py', 'routers/moments.py', 'routers/feedback.py', 'routers/study.py',
]

VERIFY_WEB = ['assets/chat-local.js', 'assets/common.css', 'assets/study-stats.js',
              'assets/emoji/manifest.js', '动态.html', '私聊.html', '设置.html']
VERIFY_SERVER = ['server/' + f for f in SERVER_FILES]


def md5(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def run(cmd, timeout=300):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


print("=== 0. 本地文件存在性预检 ===")
missing = []
for rel in VERIFY_SERVER:
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.isfile(p):
        missing.append(rel)
if missing:
    raise SystemExit("缺少文件：%s" % missing)
print("关键文件齐全")

print("=== 1. 打包 ===")
count = 0
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for item in sorted(os.listdir(ROOT)):
        full = os.path.join(ROOT, item)
        if os.path.isfile(full) and item.endswith('.html') and item not in EXCLUDE_HTML \
                and not item.startswith(EXCLUDE_PREFIXES):
            tar.add(full, arcname='web/' + item)
            count += 1
    assets = os.path.join(ROOT, 'assets')
    for f in sorted(os.listdir(assets)):
        if os.path.splitext(f)[1].lower() in ASSET_EXTS:
            tar.add(os.path.join(assets, f), arcname='web/assets/' + f)
            count += 1
    emoji = os.path.join(assets, 'emoji')
    if os.path.isdir(emoji):
        for f in sorted(os.listdir(emoji)):
            tar.add(os.path.join(emoji, f), arcname='web/assets/emoji/' + f)
            count += 1
    for rel in SERVER_FILES:
        tar.add(os.path.join(ROOT, 'server', rel.replace('/', os.sep)), arcname='server/' + rel)
        count += 1
print("打包 %d 个文件, %d bytes" % (count, os.path.getsize(TAR_PATH)))

print("=== 2. 上传 ===")
r = run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, TAR_PATH,
         "%s:/opt/study-workbench/" % HOST])
print((r.stdout or '')[-150:], (r.stderr or '')[-150:], "exit:", r.returncode)
if r.returncode != 0:
    raise SystemExit("上传失败")

print("=== 3. 服务器端：备份 DB → 解压 → MD5 校验 ===")
remote = r"""cd /opt/study-workbench || exit 1
cp -a server/data.db "server/data.db.backup-20260911-1600" 2>/dev/null && echo "DB-BACKUP-OK" || echo "DB-BACKUP-SKIP"
tar xzf deploy_20260911d.tar.gz -C /opt/study-workbench/ || exit 1
echo '---MD5-BEGIN---'
cd /opt/study-workbench/web && md5sum assets/chat-local.js assets/common.css assets/study-stats.js assets/emoji/manifest.js 动态.html 私聊.html 设置.html
cd /opt/study-workbench && md5sum server/database.py server/main.py server/schemas.py server/security.py server/routers/chat.py server/routers/users.py server/routers/social.py server/routers/groups.py server/routers/moments.py server/routers/feedback.py server/routers/study.py
echo '---MD5-END---'
rm -f /opt/study-workbench/deploy_20260911d.tar.gz
"""
r = run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, HOST, remote], timeout=300)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-500:])
if r.returncode != 0:
    raise SystemExit("远端解压/校验步骤失败 exit=%s" % r.returncode)

out = r.stdout or ''
if '---MD5-BEGIN---' not in out or '---MD5-END---' not in out:
    raise SystemExit("!! 未取得远程 MD5 输出，人工复核")
block = out.split('---MD5-BEGIN---')[1].split('---MD5-END---')[0]
remote_map = {}
for line in block.strip().splitlines():
    parts = line.split()
    if len(parts) >= 2:
        remote_map[parts[1].strip()] = parts[0]
ok = True
for rel in VERIFY_WEB + VERIFY_SERVER:
    local = md5(os.path.join(ROOT, rel.replace('/', os.sep)))
    rm = remote_map.get(rel)
    same = (rm == local)
    ok = ok and same
    print(("OK " if same else "BAD"), rel, "local", local[:10], "remote", (rm or 'MISSING')[:10])
print("=== MD5 校验:", "全部一致 OK" if ok else "存在不一致 BAD", "===")

print("=== 4. 重启服务并校验 ===")
remote2 = r"""systemctl restart study-workbench
sleep 8
echo "SERVICE:$(systemctl is-active study-workbench)"
echo "SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)"
echo "HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)"
echo "PRESENCE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/users/presence)"
echo "MOMENTS:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/moments/feed)"
echo "DONGTAI:$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1/%E5%8A%A8%E6%80%81.html')"
cd /opt/study-workbench/server && python3 -c "
import sqlite3
c=sqlite3.connect('data.db')
print('USERS:', c.execute('select count(*) from users').fetchone()[0])
t=[r[0] for r in c.execute(\"select name from sqlite_master where type='table'\").fetchall()]
for n in ['chat_groups','chat_group_members','moments','moment_likes','moment_comments','feedbacks','study_logs']:
    print('TABLE', n, 'YES' if n in t else 'NO')
cols=[r[1] for r in c.execute('PRAGMA table_info(users)').fetchall()]
print('USERS.last_seen_at:', 'YES' if 'last_seen_at' in cols else 'NO')
mcols=[r[1] for r in c.execute('PRAGMA table_info(messages)').fetchall()]
print('MESSAGES.group_id:', 'YES' if 'group_id' in mcols else 'NO')
"
"""
r2 = run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, HOST, remote2], timeout=300)
print(r2.stdout)
if r2.stderr:
    print("STDERR:", r2.stderr[-500:])
print("部署流程结束。请人工确认上面 SERVICE/SITE/HEALTH 与 TABLE 各项。")
