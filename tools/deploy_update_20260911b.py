# -*- coding: utf-8 -*-
"""2026-09-11 第二轮增量更新：
   ① 全站「笔记」→「发贴」
   ② 广场编辑页改版（写作台 / 快速模板 / 字数统计 / 草稿自动保存）
   ③ 设置页新增实用功能（数据总览 / 发贴默认偏好 / 阅读与界面 / 每日学习提醒 / 维护重置 / 账号与安全）
   上传后用 MD5 校验关键文件，避免中文 grep 不可靠的问题。"""
import tarfile, os, subprocess, hashlib

ROOT = r"D:\下载的文件\学习工作台"
TAR_PATH = os.path.join(ROOT, "tools", "frontend_update_20260911b.tar.gz")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
# 凭据从环境变量读取，切勿把真实密码写进代码（历史泄漏事故：2026-09-11）
# 用法：set SW_HOST=root@1.2.3.4 && set SW_PASS=xxx && python tools/deploy_xxx.py
HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    raise SystemExit("请先设置环境变量 SW_HOST 与 SW_PASS（服务器地址与密码）")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

# 废弃的历史变体 / 本地临时文件，不入包
EXCLUDE_HTML = {
    'settings.html', '设置_旧版.html', 'profile.html',
    'profile_v2.html', 'profile_v3.html', '学途.html',
}
EXCLUDE_PREFIXES = ('settings_', 'profile_', '_preview_', '_t')
ASSET_EXTS = {'.js', '.css'}

# 需要远程 MD5 校验的关键文件（相对 web/）
VERIFY = ['assets/app.js', 'assets/api.js', 'assets/polish.css', '学习博客.html', '设置.html']


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
tar xzf frontend_update_20260911b.tar.gz -C /opt/study-workbench/
cd web
echo '---MD5-BEGIN---'
md5sum assets/app.js assets/api.js assets/polish.css 学习博客.html 设置.html
echo '---MD5-END---'
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1/"
rm -f /opt/study-workbench/frontend_update_20260911b.tar.gz
"""
r = subprocess.run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, HOST, remote],
                   capture_output=True, text=True, timeout=180)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-400:])
print("exit:", r.returncode)

# 解析远程 MD5 并与本地对比
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
        local = md5(os.path.join(ROOT, rel))   # 打包时根目录文件与 assets 均按原相对路径映射到 web/
        rm = remote_map.get(rel)
        same = (rm == local)
        ok = ok and same
        print(("✅" if same else "❌"), rel, "local", local[:10], "remote", (rm or 'MISSING')[:10])
    print("=== 校验结果:", "全部一致 ✅" if ok else "存在不一致 ❌", "===")
else:
    print("⚠️ 未取得远程 MD5 输出")
