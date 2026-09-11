# -*- coding: utf-8 -*-
"""2026-09-11 增量更新：上传全站统一后的前端页面到腾讯云服务器"""
import tarfile, os, subprocess

ROOT = r"D:\下载的文件\学习工作台"
TAR_PATH = os.path.join(ROOT, "tools", "frontend_update_20260911.tar.gz")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
# 凭据从环境变量读取，切勿把真实密码写进代码（历史泄漏事故：2026-09-11）
# 用法：set SW_HOST=root@1.2.3.4 && set SW_PASS=xxx && python tools/deploy_xxx.py
HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    raise SystemExit("请先设置环境变量 SW_HOST 与 SW_PASS（服务器地址与密码）")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

# 废弃的历史变体，不入包
EXCLUDE_HTML = {
    'settings.html', '设置_旧版.html', 'profile.html',
    'profile_v2.html', 'profile_v3.html', '学途.html',
}
EXCLUDE_PREFIXES = ('settings_', 'profile_v')
# assets 下只要前端代码
ASSET_EXTS = {'.js', '.css'}

count = 0
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for item in os.listdir(ROOT):
        full = os.path.join(ROOT, item)
        if os.path.isfile(full) and item.endswith('.html') and item not in EXCLUDE_HTML \
                and not item.startswith(EXCLUDE_PREFIXES):
            tar.add(full, arcname='web/' + item)
            count += 1
    assets = os.path.join(ROOT, 'assets')
    for f in os.listdir(assets):
        if os.path.splitext(f)[1].lower() in ASSET_EXTS:
            tar.add(os.path.join(assets, f), arcname='web/assets/' + f)
            count += 1

print(f"打包 {count} 个文件, {os.path.getsize(TAR_PATH)} bytes")

print("=== 上传 ===")
r = subprocess.run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY,
                    TAR_PATH, f"{HOST}:/opt/study-workbench/"],
                   capture_output=True, text=True, timeout=180)
print((r.stdout or '')[-300:], (r.stderr or '')[-300:], "exit:", r.returncode)
if r.returncode != 0:
    raise SystemExit("上传失败")

print("=== 服务器端解压 + 验证 ===")
remote = r"""set -e
cd /opt/study-workbench
tar xzf frontend_update_20260911.tar.gz -C /opt/study-workbench/
echo '--- 校验1: 私聊页新版底部导航(应为1) ---'
grep -c 'bn-label">互动' web/私聊.html || true
echo '--- 校验2: app.js 旧文件名残留(应为0) ---'
grep -c '分享广场.html' web/assets/app.js || true
echo '--- 校验3: 个人中心隐藏工具卡(应为1) ---'
grep -c 'style="display:none" data-page-node-id="s465Vz9Sr29Qmknx6OkMbw"' web/个人中心.html || true
echo '--- 校验4: 首页可访问 ---'
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1/"
echo '--- 校验5: 侧边栏一致性(个人中心应含"系统"区块) ---'
grep -c '>系统<' web/个人中心.html || true
echo DONE
rm -f frontend_update_20260911.tar.gz
"""
r = subprocess.run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, HOST, remote],
                   capture_output=True, text=True, timeout=120)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-300:])
print("exit:", r.returncode)
