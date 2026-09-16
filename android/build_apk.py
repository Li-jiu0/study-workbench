# -*- coding: utf-8 -*-
"""学习工作台 APK 打包脚本（Python 版，替代 build-apk.sh，用于无 Git Bash 环境）"""
import os, sys, shutil, subprocess, tempfile, glob

BUILD = r"C:\Users\ATM\android-build"
JDK = os.path.join(BUILD, "jdk", "jdk-17.0.20.1+1")
JDK_BIN = os.path.join(JDK, "bin")
SDK = os.path.join(BUILD, "sdk")
BT = os.path.join(SDK, "build-tools", "34.0.0")
ANDROID_JAR = os.path.join(SDK, "platforms", "android-35", "android.jar")

def jdk_tool(name):
    return os.path.join(JDK_BIN, name + (".exe" if not name.endswith(".exe") else ""))

ROOT = r"D:\下载的文件\学习工作台"
OUT = tempfile.mkdtemp(prefix="apkbuild_")
STAGE = os.path.join(OUT, "stage")
RES = os.path.join(OUT, "res")
MANIFEST = os.path.join(OUT, "AndroidManifest.xml")
JAVA_SRC = os.path.join(OUT, "javasrc")
JAVA_OUT = os.path.join(OUT, "java")
CLASSES = os.path.join(OUT, "classes")
DEX_OUT = os.path.join(OUT, "dex")
KEPT = os.path.join(ROOT, "android", "workbench.keystore")
FINAL_APK = os.path.join(ROOT, "学习工作台-安卓App.apk")
SIGNED = os.path.join(OUT, "app-signed.apk")

os.makedirs(os.path.join(STAGE, "assets"), exist_ok=True)
os.makedirs(os.path.join(STAGE, "data"), exist_ok=True)
for d in (RES, JAVA_OUT, CLASSES, DEX_OUT):
    os.makedirs(d, exist_ok=True)

print("工作目录:", OUT)

def run(cmd, **kw):
    print("  $", " ".join(str(c) for c in cmd) if isinstance(cmd, list) else cmd)
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if r.returncode != 0:
        print("STDOUT:", r.stdout[-2000:])
        print("STDERR:", r.stderr[-2000:])
        raise RuntimeError(f"Command failed: {cmd}")
    return r

# ---- 1) 整理站点文件（R70：二进制整页复制，保留 api.js 与行尾） ----
#   ⚠️ 历史坑（2026-09-17 修）：此处曾做两件事，都致命 ——
#   ① 正则剔除 <script src="assets/api.js">  → APK 失去全部联网能力
#      （好友私信 / 留言板 / 社区互动 / 语音 / 题库扩展均失效，只剩静态壳）
#   ② 文本模式读写（newline 归一化）    → LF 文件被静默改成 CRLF
#   现在：纯二进制复制，一个字节不改。
import re
html_count = 0
for f in glob.glob(os.path.join(ROOT, "*.html")):
    name = os.path.basename(f)
    if ".bak" in name.lower() or name.startswith("_"):
        continue
    with open(f, "rb") as fh:
        data = fh.read()
    with open(os.path.join(STAGE, name), "wb") as fh:
        fh.write(data)
    html_count += 1

# ---- 1a) APK 资源白名单（项目铁律「代码修好 ≠ 包里有」）：缺失即中止打包 ----
# 批次五（2026-09-12）新增 icon-map.js / subpage-router.js：
#   · icon-map.js 缺失 → 全站侧栏图标渲染空白（data-icon 无字典）
#   · subpage-router.js 缺失 → 设置/个人中心所有 [data-subpage] 默认隐藏，分组卡全程不可点
#   二者都是「静默失效」，只有在真机/APK 里才暴露，因此必须在打包期硬断言。
REQUIRED_ASSETS = [
    # --- 批次五新增（本批必打包） ---
    "icon-map.js",
    "subpage-router.js",
    # --- 运行时核心（缺一即白屏 / 静默失效） ---
    "common.css",
    "polish.css",
    "app.js",
    "config.js",
    "chat-local.js",
    "qbank.js",
    "study-stats.js",
    "voiceplayer.js",
    "mini.js",
    "importer.js",
    "quest.js",
    "hotnews.js",
    "group-discussion.js",
    "i-partner.js",
    "topic-express.js",
    "mini-cet.js",
    "mini-comm.js",
    "mini-exam.js",
    "mini-interview.js",
    "mini-ppt.js",
    # --- R70 新增：联网能力必需（缺 api.js = 所有在线功能变静态壳） ---
    "api.js",
    # --- R70 新增：AI 三件套 + 设置页（缺一即 AI 功能/检测不可用） ---
    "ai-config.js",
    "ai-presets.js",
    "ai-service.js",
    "ai-page.js",
    "ai-settings.js",
    # --- R70 新增：启动期基础设施 ---
    "xt-polyfill.js",
    "xt-toast.js",
    "error-boundary.js",
    "admin.js",
    "page-head.css",
    "states.css",
    # --- 子目录资源（build-apk.sh 早期版本用 cp 不带 -r 会静默漏掉） ---
    "emoji/manifest.js",
]

# --- 一级资源目录 data/（2026-09-12 新增）：真题模考数据契约 ---
# mock_exam.html / mock_exam_run.html / mock_exam_result.html 依赖
# data/mock-papers.js（window.MOCK_PAPERS_DATA）。缺失时页面不报错、只显示空题库
# —— 与 assets/emoji/ 漏拷同一类构建期静默失效，必须递归复制 + 硬断言。
REQUIRED_DATA_ASSETS = [
    "mock-papers.js",
]

_data_dir = os.path.join(ROOT, "data")

_missing_src = [a for a in REQUIRED_ASSETS
                if not os.path.exists(os.path.join(ROOT, "assets", a.replace("/", os.sep)))]
if _missing_src:
    raise SystemExit("✖ APK 资源白名单缺失（源目录 assets/）：" + ", ".join(_missing_src))

_missing_data_src = [a for a in REQUIRED_DATA_ASSETS
                     if not os.path.exists(os.path.join(_data_dir, a.replace("/", os.sep)))]
if _missing_data_src:
    raise SystemExit("✖ APK 数据资源白名单缺失（源目录 data/）：" + ", ".join(_missing_data_src))

# 复制 assets
for item in os.listdir(os.path.join(ROOT, "assets")):
    src = os.path.join(ROOT, "assets", item)
    dst = os.path.join(STAGE, "assets", item)
    if os.path.isdir(src):
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        shutil.copy2(src, dst)

# 复制一级资源目录 data/（递归，含 data/mock-papers.js 及将来新增文件）
shutil.copytree(_data_dir, os.path.join(STAGE, "data"), dirs_exist_ok=True)
_data_count = sum(len(files) for _, _, files in os.walk(os.path.join(STAGE, "data")))
print(f"✓ 一级资源目录 data/ 已递归复制（{_data_count} 个文件）")

_missing_stage = [a for a in REQUIRED_ASSETS
                  if not os.path.exists(os.path.join(STAGE, "assets", a.replace("/", os.sep)))]
if _missing_stage:
    raise SystemExit("✖ APK 资源白名单缺失（打包暂存区 stage/assets/）：" + ", ".join(_missing_stage))

_missing_data_stage = [a for a in REQUIRED_DATA_ASSETS
                       if not os.path.exists(os.path.join(STAGE, "data", a.replace("/", os.sep)))]
if _missing_data_stage:
    raise SystemExit("✖ APK 数据资源白名单缺失（打包暂存区 stage/data/）：" + ", ".join(_missing_data_stage))

# ---- 1b) 联网能力硬断言：入口页必须仍引用 api.js（防「剔除逻辑」复活） ----
ENTRY = os.path.join(STAGE, "学习工作台.html")
if not os.path.exists(ENTRY):
    raise SystemExit("✖ 入口页缺失：学习工作台.html")
entry_bytes = open(ENTRY, "rb").read()
if b'assets/api.js' not in entry_bytes:
    raise SystemExit("✖ 入口页未引用 assets/api.js —— APK 将失去全部联网功能")
if b'assets/config.js' not in entry_bytes:
    raise SystemExit("✖ 入口页未引用 assets/config.js —— file:// 场景拿不到 API 绝对地址")
print("✓ 联网能力断言通过（入口页含 api.js + config.js）")
print(f"站点文件已就绪（{html_count} 个 html + assets/ + data/）")
print(f"✓ APK 资源白名单校验通过（{len(REQUIRED_ASSETS)} 项，含批次五 icon-map.js / subpage-router.js）")
print(f"✓ APK 数据资源白名单校验通过（{len(REQUIRED_DATA_ASSETS)} 项：data/mock-papers.js）")

# ---- 2) 复制工程文件到 ASCII 目录 ----
shutil.copytree(os.path.join(ROOT, "android", "res"), RES, dirs_exist_ok=True)
shutil.copy2(os.path.join(ROOT, "android", "AndroidManifest.xml"), MANIFEST)
shutil.copytree(os.path.join(ROOT, "android", "java"), JAVA_SRC, dirs_exist_ok=True)
print("工程文件已复制到 ASCII 临时目录")

# ---- 3) aapt2 compile 资源 ----
AAPT2 = os.path.join(BT, "aapt2.exe")
run([AAPT2, "compile", "--dir", RES, "-o", os.path.join(OUT, "res.zip")])
print("aapt2 compile 完成")

# ---- 4) aapt2 link ----
run([AAPT2, "link", "-I", ANDROID_JAR, "--manifest", MANIFEST,
     "--java", JAVA_OUT, "-o", os.path.join(OUT, "base.apk"),
     os.path.join(OUT, "res.zip")])
print("aapt2 link 完成 -> base.apk")

# ---- 5) javac 编译 Java ----
env = os.environ.copy()
env["JAVA_HOME"] = JDK
env["PATH"] = os.path.join(JDK, "bin") + os.pathsep + env.get("PATH", "")

src_files = []
for root_dir, _, files in os.walk(JAVA_OUT):
    for f in files:
        if f.endswith(".java"):
            src_files.append(os.path.join(root_dir, f))
for root_dir, _, files in os.walk(JAVA_SRC):
    for f in files:
        if f.endswith(".java"):
            src_files.append(os.path.join(root_dir, f))

src_list = os.path.join(OUT, "srcs.txt")
with open(src_list, "w", encoding="utf-8") as fh:
    fh.write("\n".join(src_files))

run([jdk_tool("javac"), "-encoding", "UTF-8", "-source", "8", "-target", "8",
     "-bootclasspath", ANDROID_JAR, "-d", CLASSES, "@" + src_list], env=env)
print("javac 完成")

# ---- 6) d8 打包 dex ----
classes_jar = os.path.join(OUT, "classes.jar")
run([jdk_tool("jar"), "cf", classes_jar, "."], cwd=CLASSES, env=env)
run([os.path.join(BT, "d8.bat"), "--release", "--min-api", "21",
     "--lib", ANDROID_JAR, "--output", DEX_OUT, classes_jar], env=env)
print("d8 完成")

# ---- 7) Python merge_apk.py 合并 ----
PY = r"C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not os.path.exists(PY):
    PY = sys.executable
run([PY, os.path.join(ROOT, "android", "merge_apk.py"),
     os.path.join(OUT, "base.apk"),
     os.path.join(DEX_OUT, "classes.dex"),
     STAGE,
     os.path.join(OUT, "merged.apk")])
print("合并 assets/dex 完成（含 assets/data/ 一级目录）")

# ---- 8) zipalign 对齐 ----
run([os.path.join(BT, "zipalign.exe"), "-f", "4",
     os.path.join(OUT, "merged.apk"), os.path.join(OUT, "aligned.apk")])
print("zipalign 完成")

# ---- 9) 签名 ----
if not os.path.exists(KEPT):
    run([jdk_tool("keytool"), "-genkeypair", "-v", "-keystore", KEPT, "-alias", "workbench",
         "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
         "-storepass", "workbench123", "-keypass", "workbench123",
         "-dname", "CN=Study Workbench, OU=Local, O=Personal, L=Local, ST=Local, C=CN"], env=env)
    print("已生成签名密钥", KEPT)

run([os.path.join(BT, "apksigner.bat"), "sign", "--ks", KEPT,
     "--ks-pass", "pass:workbench123", "--out", SIGNED,
     os.path.join(OUT, "aligned.apk")], env=env)
r = run([os.path.join(BT, "apksigner.bat"), "verify", "--print-certs", SIGNED], env=env)
print(r.stdout[:500])
print("签名验证完成")

# ---- 10) 复制回项目路径 ----
shutil.copy2(SIGNED, FINAL_APK)
size = os.path.getsize(FINAL_APK)
print(f"APK 生成: {FINAL_APK} ({size} bytes)")
