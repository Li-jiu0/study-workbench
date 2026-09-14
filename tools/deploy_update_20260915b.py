# -*- coding: utf-8 -*-
"""20260915a 部署：批次八首波 —— 申论模块上线 + bug 修复批 + 页面合规批（纯前端，不重启服务）。

本批内容（全部前端，server/ 无改动，因此**不需要**重启 FastAPI）：
  新增：
    - 申论刷题.html（1637 行，Tab1 题目精练三视图 + Tab2 阅读积累四视图）
    - assets/data/shenlun-questions.json（申论 100 题，1.8MB）
    - assets/data/shenlun-inline.js（window.INLINE_SHENLUN_BANK，供 file:// 直接引入）
  改动：
    - assets/app.js：③最近学习/④薄弱点首页刷新（refreshHomeCards L1910 + L1922-1933）、
      题型进度缺失即补建（L5078-5081）、①错题本题型分类筛选（renderWrongBook 重写）
    - assets/chat-local.js：⑤消息通知顶端横幅 imTopNotify（L166-194）、轮询 2000ms（L3132）、
      visibilitychange 即时拉取（L3136）
    - 私聊.html：⑥拆除 #imAddFriendModal 的 .im-overlay/.im-modal 外壳，改为页面内 .im-af-sec
    - PPT训练.html：⑭ ppt-tips 入口文案对齐真实数据（5 专题 / 13 练习 / 6 实战）
    - 个人中心.html：学习偏好竖排修复 + ?user= 直达 TA 主页
    - 错题本.html：新增题型分类筛选条（页面级样式 + #wrongTypeFilter 挂载点）
    - 23 个页面侧边栏新增「申论刷题」入口
  版本戳：统一 bump 到 20260915a（98 处 / 33 文件）

安全机制：
  - ROOT 铁律（必须是 D:\\下载的文件\\学习工作台）；
  - 只打包 *.html 与 assets/，绝不打包 server/、tools/、.git；
  - 远端先备份 web 目录为 web_bak_<stamp>.tar.gz，再解压覆盖；
  - dry-run（SW_DRY_RUN=1）只打包不联网。

用法：
  $env:SW_DRY_RUN=1;  python tools/deploy_update_20260915a.py
  python tools/deploy_update_20260915a.py
"""
import os, re, sys, io, glob, tarfile, subprocess, hashlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
if os.path.abspath(ROOT) != os.path.abspath(r"D:\下载的文件\学习工作台"):
    raise SystemExit("ROOT 铁律：只允许部署源 D:\\下载的文件\\学习工作台")

STAMP = "20260915b"
CRED = os.path.join(ROOT, "upload_v23.ps1")
TAR = os.path.join(ROOT, "tools", "frontend_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
REMOTE_WEB = REMOTE_ROOT + "/web"

EXCLUDE_HTML = {"blog_wechat.html"}
EXCLUDE_DIRS = {"server", "android", "tools", ".git", "node_modules", "__pycache__"}
# 注意：本批首次带上行测切图（assets/images/*.png，约 44MB），故不再排除 .png
EXCLUDE_EXTS = {".apk", ".jpg", ".jpeg", ".gif", ".md", ".py", ".pyc",
                ".zip", ".tar.gz", ".docx", ".xlsx", ".pptx", ".txt", ".keystore", ".jks"}

# ---------- 1. 打包 ----------
print("=== 打包（仅 html + assets）===")
count, missing = 0, []
with tarfile.open(TAR, "w:gz") as tar:
    for p in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        fn = os.path.basename(p)
        if fn in EXCLUDE_HTML:
            continue
        tar.add(p, arcname="web/" + fn)
        count += 1
    assets = os.path.join(ROOT, "assets")
    for root, dirs, files in os.walk(assets):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if os.path.splitext(f)[1].lower() in EXCLUDE_EXTS:
                continue
            fp = os.path.join(root, f)
            tar.add(fp, arcname="web/" + os.path.relpath(fp, ROOT).replace("\\", "/"))
            count += 1

# 关键文件必在包内
names = tarfile.open(TAR).getnames()
for must in ("web/申论刷题.html", "web/assets/data/shenlun-inline.js",
             "web/assets/app.js", "web/assets/chat-local.js",
             "web/assets/icon-map.js", "web/assets/subpage-router.js"):
    if must not in names:
        missing.append(must)
if missing:
    raise SystemExit("包内缺关键文件: %s" % missing)
print("打包 %d 个文件, %d bytes" % (count, os.path.getsize(TAR)))
print("关键文件断言: 全部在位 ✅")

if os.environ.get("SW_DRY_RUN") == "1":
    print("\n[dry-run] 不联网，结束。")
    sys.exit(0)

# ---------- 2. 凭据 ----------
host = os.environ.get("SW_HOST", "")
pwd = os.environ.get("SW_PASS", "")
if not host or not pwd:
    s = open(CRED, encoding="utf-8", errors="replace").read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        raise SystemExit("拿不到凭据")
    pwd, host = m.group(1), m.group(2)
print("\n目标主机: root@%s" % host)

# ---------- 3. 上传 ----------
print("=== 上传 ===")
r = subprocess.run([PSCP, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, TAR,
                    "root@%s:%s/" % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=300)
print((r.stdout or "")[-400:], (r.stderr or "")[-400:])
print("上传 exit:", r.returncode)
if r.returncode != 0:
    sys.exit(r.returncode)

# ---------- 4. 远端备份 + 解压 + 校验 ----------
print("\n=== 远端备份 + 解压 ===")
cmd = (
    "cd {root} && "
    "tar -czf web_bak_{st}.tar.gz web >/dev/null 2>&1 && echo BACKUP_OK && "
    "tar -xzf frontend_{st}.tar.gz -C {root} && echo EXTRACT_OK && "
    "ls -l {web}/申论刷题.html && "
    "ls -l {web}/assets/data/shenlun-inline.js && "
    "grep -c '申论刷题' {web}/学习工作台.html"
).format(root=REMOTE_ROOT, web=REMOTE_WEB, st=STAMP)
r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                    "root@%s" % host, cmd],
                   capture_output=True, text=True, timeout=300)
print((r.stdout or "")[-1500:])
print((r.stderr or "")[-500:])
print("远端 exit:", r.returncode)
print("\nDONE 20260915a")
