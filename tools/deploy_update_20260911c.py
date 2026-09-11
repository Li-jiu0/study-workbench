# -*- coding: utf-8 -*-
"""2026-09-11 第三轮增量更新（编辑资料改版 + 公开主页资料展示）：
   前端： 个人中心.html（编辑资料弹窗 v3：完成度/迷你预览/字数统计/备考标签chips/学习目标）
          assets/api.js （公开主页资料展示、他人主页创作数据、标签/目标行）
          assets/polish.css（编辑弹窗与公开主页新样式）
          tools/bump_versions_safe.py 已把 assets/api.js / polish.css 版本号统一到 20260911c
   后端： server/database.py（User 增加 goal/tags 列 + 无损 ALTER 迁移）
          server/schemas.py （ProfileIn 增加 goal/tags）
          server/routers/users.py（PUT /me 保存 goal/tags 并清洗标签；GET /{id} 返回 goal/tags/createdAt/isMe/stats）
          server/routers/auth.py （/auth/me 返回 goal/tags）
   上传后用 MD5 校验关键文件，并重启后端使新列/迁移生效。"""
import tarfile, os, subprocess, hashlib

ROOT = r"D:\下载的文件\学习工作台"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_20260911c.tar.gz")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
# 凭据从环境变量读取，切勿把真实密码写进代码（历史泄漏事故：2026-09-11）
# 用法：set SW_HOST=root@1.2.3.4 && set SW_PASS=xxx && python tools/deploy_xxx.py
HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    raise SystemExit("请先设置环境变量 SW_HOST 与 SW_PASS（服务器地址与密码）")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

EXCLUDE_HTML = {
    'settings.html', '设置_旧版.html', 'profile.html',
    'profile_v2.html', 'profile_v3.html', '学途.html',
    'blog_wechat.html',   # 历史遗留草稿（未被任何页面引用，真实页面为 学习博客.html）
}
EXCLUDE_PREFIXES = ('settings_', 'profile_', '_preview_', '_t')
ASSET_EXTS = {'.js', '.css'}

# 需要远程 MD5 校验的关键文件（相对 web/ 或 server/）
VERIFY_WEB = ['assets/api.js', 'assets/polish.css', '个人中心.html']
VERIFY_SERVER = ['server/database.py', 'server/schemas.py', 'server/routers/users.py',
                 'server/routers/auth.py']
VERIFY = VERIFY_WEB + VERIFY_SERVER


def md5(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


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
    server = os.path.join(ROOT, 'server')
    for rel in ['database.py', 'schemas.py', 'routers/users.py', 'routers/auth.py']:
        tar.add(os.path.join(server, rel), arcname='server/' + rel)
        count += 1
print(f"打包 {count} 个文件, {os.path.getsize(TAR_PATH)} bytes")

print("=== 上传 ===")
r = subprocess.run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY,
                    TAR_PATH, f"{HOST}:/opt/study-workbench/"],
                   capture_output=True, text=True, timeout=300)
print((r.stdout or '')[-200:], (r.stderr or '')[-200:], "exit:", r.returncode)
if r.returncode != 0:
    raise SystemExit("上传失败")

print("=== 服务器端解压 + MD5 校验 ===")
remote = r"""set -e
cd /opt/study-workbench
tar xzf deploy_20260911c.tar.gz -C /opt/study-workbench/
echo '---MD5-BEGIN---'
cd /opt/study-workbench/web && md5sum assets/api.js assets/polish.css 个人中心.html
cd /opt/study-workbench && md5sum server/database.py server/schemas.py server/routers/users.py server/routers/auth.py
echo '---MD5-END---'
rm -f /opt/study-workbench/deploy_20260911c.tar.gz
"""
r = subprocess.run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, HOST, remote],
                   capture_output=True, text=True, timeout=180)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-400:])
print("exit:", r.returncode)

out = r.stdout or ''
if '---MD5-BEGIN---' in out and '---MD5-END---' in out:
    block = out.split('---MD5-BEGIN---')[1].split('---MD5-END---')[0]
    remote_map = {}
    for line in block.strip().splitlines():
        parts = line.split()
        if len(parts) >= 2:
            remote_map[parts[1].strip()] = parts[0]
    ok = True
    for rel in VERIFY:
        local = md5(os.path.join(ROOT, rel.replace('/', os.sep)))
        rm = remote_map.get(rel)
        same = (rm == local)
        ok = ok and same
        print(("OK " if same else "BAD"), rel, "local", local[:10], "remote", (rm or 'MISSING')[:10])
    print("=== 校验结果:", "全部一致 OK" if ok else "存在不一致 BAD", "===")
else:
    print("!! 未取得远程 MD5 输出")
