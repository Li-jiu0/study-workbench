# -*- coding: utf-8 -*-
"""2026-09-13i 部署：P0 批次上线（B1-B4 功能删减 + C 线修复 + E1 图标全站升级 + 引用驱动补 bump）

与 deploy_update_20260913h.py 的差异（其余安全机制逐条照搬）：
  1. STAMP / 包名 / 远端包名 / DB 备份名统一为 20260913i。
  2. **排除 blog_wechat.html**（本批不上线该页；远端保留 h 版已上线的文件不受影响）。
  3. ROOT 铁律显式校验：ROOT 绝不可指向 C:\\Users\\ATM\\WorkBuddy\\Worktrees\\ 下任何
     旧 worktree（实测旧 worktree 仍含已删除功能且无 E1 图标，直接部署会整体回退本批
     成果）；命中即 SystemExit（SW_ALLOW_WORKTREE_ROOT=1 可显式放行）。
  4. 三条资源硬断言原样保留：assets/icon-map.js、assets/subpage-router.js、
     data/mock-papers.js，缺失即 SystemExit。
  5. 探针逻辑原样（全部 SOFT-WARN 汇总后一次性 FATAL）：版本探针串更新为 20260913i；
     E1 blog_wechat 探针保留（远端文件仍为 h 版已上线内容，应继续通过）。

前端(web/)：
  32 个 HTML 页面排除 blog_wechat.html 后为 31 页（各页版本串以其本地 bump 状态为准）
  + assets/ 下全部 *.js / *.css
  + assets/data/*.json（glob 自动纳入，显式排除字段补产中间产物）
  + assets/emoji/manifest.js
  + 根目录 data/（递归收集；含 data/mock-papers.js）

本批 server/ 零改动 → 不部署 server 文件、**不重启 study-workbench 服务**
（Nginx 直接读静态目录 /opt/study-workbench/web，tar 解压即生效）。

安全机制（与 0913h 一致）：
  - 逐文件 MD5 **全量**比对（非抽查）；md5sum 输出解析为 {name: hash}（勿写 dict(...)）；
  - 凭据**惰性读取**（仅真正部署时），--dry-run 永不触碰；
  - **ASCII 包名中转**：只上传 deploy_20260913i.tar.gz，服务器端 tar xzf 落盘，
    规避 pscp 的 GBK→UTF-8 中文名错乱；
  - 排除清单：*.bak-* / *.tar.gz / tools/ 等（本脚本只收集白名单目录）。

用法：
  $env:SW_DRY_RUN=1;  python tools/deploy_update_20260913i.py   # 本地清单+打包，不联网
  $env:SW_SKIP_UPLOAD=1; python tools/deploy_update_20260913i.py  # 需凭据：解压+全量校验+探针
  python tools/deploy_update_20260913i.py                       # 正式部署（含上传）
"""
import os
import sys
import io
import re
import time
import base64
import hashlib
import tarfile
import subprocess

# ---------------- 常量 ----------------
# ✅ 项目主副本（含 B/C/E1 全部成果）；绝不可回退到旧 worktree
ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
STAMP = "20260913i"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
MANIFEST_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_0913i_manifest.txt")

SERVER_FILES = []                      # 本批 server/ 零改动

EXCLUDE_HTML = {"settings.html", "设置_旧版.html", "profile.html",
                "profile_v2.html", "profile_v3.html",
                "blog_wechat.html"}   # ← i 批新增排除：本批不上线该页
EXCLUDE_PREFIXES = ("settings_", "profile_", "_preview_", "_t")
ASSET_EXTS = {".js", ".css"}
MOCK_REL = "data/mock-papers.js"
# 硬断言：漏了会静默失效的前端关键文件
ASSETS_MUST = ("icon-map.js", "subpage-router.js")
DATA_MUST = ("mock-papers.js",)        # data/ 必含（漏了模考三页静默空题库）
MOCK_PAPERS_MARK = "MOCK_PAPERS_DATA"  # 见 data/mock-papers.js 末尾 window.MOCK_PAPERS_DATA

# 期望存在的 8 个词库分片（存在性自检，缺任一即标注“待生成”）
EXPECTED_SHARDS = [
    "vocab-cet4-ext-a-c.json", "vocab-cet4-ext-d-f.json", "vocab-cet4-ext-g-i.json",
    "vocab-cet4-ext-j-l.json", "vocab-cet4-ext-m-o.json", "vocab-cet4-ext-p-r.json",
    "vocab-cet4-ext-s-u.json", "vocab-cet4-ext-v-z.json",
]
VOCAB_INDEX = "vocab-cet4-ext-index.json"
OLD_VOCAB = "vocab-cet4-ext.json"      # 旧单文件：正式部署前必须已删除
# 显式排除：字段补产中间产物（无引用，不随包上线）
EXCLUDE_DATA_JSON = {"vocab-ext-fields-patch.json"}

USERS_BASELINE = 6                     # 部署前用户数基线（低于此值视为数据丢失）


# ---------------- 工具函数 ----------------
def assert_root_law():
    """ROOT 铁律校验：绝不允许部署旧 worktree（会整体回退 B/C/E1 成果）。"""
    norm = os.path.normcase(os.path.abspath(ROOT)).replace("\\", "/")
    if "worktrees/" in norm.lower() + "/" or "/worktrees/" in norm.lower():
        if os.environ.get("SW_ALLOW_WORKTREE_ROOT") != "1":
            raise SystemExit(
                "[ROOT 铁律] ROOT 指向旧 worktree：%s\n"
                "实测旧 worktree 仍含已删除功能且无 E1 图标，直接部署会整体回退本批成果。\n"
                "如确需覆盖，请设置 SW_ROOT=D:\\下载的文件\\学习工作台 "
                "（或 SW_ALLOW_WORKTREE_ROOT=1 显式放行）。" % ROOT)


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd, timeout=420):
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    return (r.returncode,
            r.stdout.decode("utf-8", "replace"),
            r.stderr.decode("utf-8", "replace"))


def load_credentials():
    """惰性读取凭据：仅在真正部署时调用；dry-run 永不触发。"""
    host = os.environ.get("SW_HOST", "")
    pwd = os.environ.get("SW_PASS", "")
    if not host or not pwd:
        s = open(CRED, encoding="utf-8", errors="replace").read()
        m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
        if not m:
            raise SystemExit("请设置 SW_HOST / SW_PASS 或检查凭据文件 " + CRED)
        pwd, host = m.group(1), m.group(2)
    return host, pwd


def plink(remote, host, pwd, timeout=420):
    return run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                "root@" + host, remote], timeout)


# ---------------- 清单收集 ----------------
def collect():
    pages = sorted(f for f in os.listdir(ROOT)
                   if f.endswith(".html") and f not in EXCLUDE_HTML
                   and not f.startswith(EXCLUDE_PREFIXES))
    assets_dir = os.path.join(ROOT, "assets")
    assets = sorted(f for f in os.listdir(assets_dir)
                    if os.path.splitext(f)[1].lower() in ASSET_EXTS
                    and os.path.isfile(os.path.join(assets_dir, f)))
    # --- 硬断言 1/3：关键前端 JS ---
    for must in ASSETS_MUST:
        if must not in assets:
            raise SystemExit("缺少关键前端文件 assets/%s（漏了它图标/子页路由会静默失效，"
                             "禁止部署）" % must)
    # assets/data/*.json（单层 glob；.bak-* 因扩展名天然排除）
    data_dir = os.path.join(assets_dir, "data")
    all_json = sorted(f for f in os.listdir(data_dir) if f.endswith(".json"))
    excluded_json = [f for f in all_json if f in EXCLUDE_DATA_JSON]
    datajson = [f for f in all_json if f not in EXCLUDE_DATA_JSON]
    # assets/emoji/*
    emoji_dir = os.path.join(assets_dir, "emoji")
    emoji = sorted(os.listdir(emoji_dir)) if os.path.isdir(emoji_dir) else []
    # --- 根 data/：递归收集（兼容将来新增子目录/文件）---
    root_data_dir = os.path.join(ROOT, "data")
    data_files = []
    if os.path.isdir(root_data_dir):
        for dp, _dns, fns in os.walk(root_data_dir):
            for fn in fns:
                data_files.append(
                    os.path.relpath(os.path.join(dp, fn), root_data_dir).replace(os.sep, "/"))
    data_files.sort()
    # --- 硬断言 2/3：data/ 必含文件 ---
    for must in DATA_MUST:
        if must not in data_files:
            raise SystemExit("缺少关键数据文件 data/%s（漏了它真题模考三页会静默空题库，"
                             "禁止部署）" % must)
    mock_abs = os.path.join(ROOT, MOCK_REL.replace("/", os.sep))
    if not os.path.isfile(mock_abs):
        raise SystemExit("缺少 " + MOCK_REL)
    return {
        "pages": pages, "assets": assets, "datajson": datajson,
        "excluded_json": excluded_json, "emoji": emoji, "data_files": data_files,
        "mock_abs": mock_abs, "assets_dir": assets_dir, "data_dir": data_dir,
        "emoji_dir": emoji_dir, "root_data_dir": root_data_dir,
    }


def iter_entries(L):
    """产出 (arcname, abs_path) 序列，供打包与清单共用。"""
    for f in L["pages"]:
        yield "web/" + f, os.path.join(ROOT, f)
    for f in L["assets"]:
        yield "web/assets/" + f, os.path.join(L["assets_dir"], f)
    for f in L["datajson"]:
        yield "web/assets/data/" + f, os.path.join(L["data_dir"], f)
    for f in L["emoji"]:
        yield "web/assets/emoji/" + f, os.path.join(L["emoji_dir"], f)
    for rel in L["data_files"]:
        yield "web/data/" + rel, os.path.join(L["root_data_dir"], rel.replace("/", os.sep))


def build_manifest(L):
    entries = list(iter_entries(L))
    src_bytes = sum(os.path.getsize(p) for _, p in entries)
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for arc, p in entries:
            tar.add(p, arcname=arc)
    packed = buf.tell()

    lines = []
    lines.append("# %s 部署清单（本地生成，未联网）" % STAMP)
    lines.append("STAMP      : " + STAMP)
    lines.append("ROOT       : " + ROOT)
    lines.append("REMOTE_ROOT: " + REMOTE_ROOT)
    lines.append("")
    lines.append("--- 计数 ---")
    lines.append("HTML 页面            : %d（已排除 blog_wechat.html）" % len(L["pages"]))
    lines.append("assets JS/CSS        : %d" % len(L["assets"]))
    lines.append("assets/data JSON     : %d" % len(L["datajson"]))
    lines.append("assets/emoji         : %d" % len(L["emoji"]))
    lines.append("根 data/ 文件         : %d" % len(L["data_files"]))
    lines.append("合计                  : %d" % len(entries))
    lines.append("")
    lines.append("--- 字节 ---")
    lines.append("源文件总字节          : %d" % src_bytes)
    lines.append("内存打包(gz)字节      : %d" % packed)
    lines.append("")
    lines.append("--- 关键文件硬断言自检 ---")
    for must in ASSETS_MUST:
        lines.append("  assets/%s : %s" % (must, "在" if must in L["assets"] else "**缺失**"))
    for must in DATA_MUST:
        lines.append("  data/%s : %s" % (must, "在" if must in L["data_files"] else "**缺失**"))
    lines.append("")
    lines.append("--- 词库分片存在性自检 ---")
    for name in EXPECTED_SHARDS:
        p = os.path.join(L["data_dir"], name)
        lines.append("  %s : %s" % (name, "存在" if os.path.isfile(p) else "**待生成**"))
    idx_p = os.path.join(L["data_dir"], VOCAB_INDEX)
    lines.append("  %s : %s" % (VOCAB_INDEX, "存在" if os.path.isfile(idx_p) else "**待生成**"))
    old_p = os.path.join(L["data_dir"], OLD_VOCAB)
    if os.path.isfile(old_p):
        lines.append("  旧单文件 %s : **仍在本地**（%d 字节）——正式部署会被前置守卫拦下"
                     % (OLD_VOCAB, os.path.getsize(old_p)))
    else:
        lines.append("  旧单文件 %s : 不在本地（已删除，守卫可通过）" % OLD_VOCAB)
    lines.append("")
    lines.append("--- 显式排除 ---")
    lines.append("  已排除：web/blog_wechat.html（i 批不上线）")
    if L["excluded_json"]:
        for name in L["excluded_json"]:
            lines.append("  已排除：assets/data/%s" % name)
    else:
        lines.append("  （JSON 无显式排除项）")
    lines.append("")
    lines.append("--- 清单明细（arcname, 字节）---")
    for arc, p in entries:
        lines.append("%9d  %s" % (os.path.getsize(p), arc))
    return "\n".join(lines) + "\n"


# ---------------- 远端内容探针（剥注释后计数）----------------
PROBE_PY = r'''
import re
W = "/opt/study-workbench/web/"

def read(p):
    try:
        return open(W + p, encoding="utf-8", errors="replace").read()
    except Exception:
        return None

def strip_all(s):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    def js(m):
        b = re.sub(r"/\*.*?\*/", "", m.group(2), flags=re.S)
        b = re.sub(r"(?m)^[ \t]*//.*$", "", b)
        return m.group(1) + b + m.group(3)
    return re.sub(r"(<script\b[^>]*>)(.*?)(</script>)", js, s, flags=re.S | re.I)

def cnt(p, pat):
    t = read(p)
    if t is None:
        print("FILEREAD_FAIL:" + p)
        return -1
    return len(re.findall(pat, strip_all(t)))

def raw(p, pat):
    t = read(p)
    return -1 if t is None else len(re.findall(pat, t))

MOCK = ["mock_exam.html", "mock_exam_run.html", "mock_exam_result.html"]
print("CET_WRITE_CALL:" + str(cnt("\u56db\u7ea7\u5907\u8003.html", r"openMiniQuiz\('cet-write'\)")))
for k, pat in (("EXAM_QUANT_CALL", r"openMiniQuiz\('exam-quant'\)"),
               ("EXAM_DEDUCE_CALL", r"openMiniQuiz\('exam-deduce'\)"),
               ("EXAM_DATA_CALL", r"openMiniQuiz\('exam-data'\)")):
    print(k + ":" + str(cnt("\u592e\u56fd\u4f01\u7b14\u8bd5.html", pat)))
print("TOOLS_JINJU_LINK:" + str(cnt("\u5de5\u5177.html", r"location\.href='\u4e07\u80fd\u91d1\u53e5\u5e93\.html'")))
print("TOOLS_HUASHU_LINK:" + str(cnt("\u5de5\u5177.html", r"location\.href='\u573a\u666f\u8bdd\u672f\u5e93\.html'")))
print("TOOLS_JINJU_TITLE:" + str(cnt("\u5de5\u5177.html", r'mpc-title">\u4e07\u80fd\u91d1\u53e5')))
print("EQ_QUIZ_CARD:" + str(cnt("\u9ad8\u60c5\u5546\u8868\u8fbe.html", r"eqQuizCard")))
print("EQ_QUIZ_TITLE:" + str(cnt("\u9ad8\u60c5\u5546\u8868\u8fbe.html", r"\u60c5\u666f\u9009\u62e9\u5b9e\u6218")))
for i, f in enumerate(MOCK):
    print("MOCK%d_BACK_EXEC:" % i + str(cnt(f, r"javascript:history\.back\(\)")))
    print("MOCK%d_BACK_RAW:" % i + str(raw(f, r"javascript:history\.back\(\)")))
    print("MOCK%d_GOBACK:" % i + str(cnt(f, r'onclick="goBack')))
print("CET_VER_I:" + str(cnt("\u56db\u7ea7\u5907\u8003.html", r"20260913i")))
print("HOME_DATAICON:" + str(cnt("\u5b66\u4e60\u5de5\u4f5c\u53f0.html", r"data-icon=")))
print("HOME_VER_I:" + str(cnt("\u5b66\u4e60\u5de5\u4f5c\u53f0.html", r"20260913i")))
print("E1_BN_ICON_SPAN:" + str(cnt("blog_wechat.html", r'bn-icon"><span class="nav-icon"')))
print("E1_MPC_ICON_SPAN:" + str(cnt("\u5de5\u5177.html", r'mpc-icon" data-icon=')))
'''


def build_probe_command(host, pwd):
    """返回 (rc, out): 服务/HTTP/DB/日志 探针 + 内容探针（剥注释）"""
    b64 = base64.b64encode(PROBE_PY.encode("utf-8")).decode("ascii")
    home_url = "http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html"
    remote = (
        "echo SERVICE:$(systemctl is-active study-workbench)\n"
        "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
        "echo HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)\n"
        "echo NRESTARTS:$(systemctl show -p NRestarts --value study-workbench)\n"
        "echo ICONMAP:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/assets/icon-map.js)\n"
        "echo SUBPAGEROUTER:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1/assets/subpage-router.js)\n"
        "echo MOCKPAPERS:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1/data/mock-papers.js)\n"
        "echo MOCKPAPERS_MARK:$(curl -s http://127.0.0.1/data/mock-papers.js | grep -c '" +
        MOCK_PAPERS_MARK + "')\n"
        "echo HOMEPAGE:$(curl -s -o /dev/null -w '%{http_code}' '" + home_url + "')\n"
        "echo ---PROBES---\n"
        "echo " + b64 + " | base64 -d | python3 -\n"
        "echo ---DB---\n"
        "cd /opt/study-workbench/server && python3 -c \"\n"
        "import sqlite3\n"
        "c = sqlite3.connect('data.db')\n"
        "print('USERS:', c.execute('select count(*) from users').fetchone()[0])\n"
        "\"\n"
        "echo TRACEBACK_10MIN:$(journalctl -u study-workbench --since '10 min ago' 2>/dev/null "
        "| grep -ci 'traceback\\|exception' || true)\n"
    )
    return plink(remote, host, pwd, timeout=300)


def probe(tag, text):
    m = re.search(r"^" + re.escape(tag) + r":(.*)$", text, re.M)
    return m.group(1).strip() if m else ""


def judge_probes(out):
    """汇总全部探针 → (fatal:list, info:list)。所有 SOFT-WARN 一次收齐，避免逐条误杀。"""
    fatal, info = [], []

    def num(tag):
        v = probe(tag, out)
        return int(v) if v.lstrip("-").isdigit() else None

    # --- 服务/站点/依赖可达性 ---
    if probe("SERVICE", out) != "active":
        fatal.append("study-workbench 服务非 active（=%s）" % (probe("SERVICE", out) or "NONE"))
    for tag, label in (("SITE", "站点根"), ("HEALTH", "后端 /api/health"),
                       ("ICONMAP", "assets/icon-map.js"),
                       ("SUBPAGEROUTER", "assets/subpage-router.js"),
                       ("HOMEPAGE", "首页")):
        if probe(tag, out) != "200":
            fatal.append("%s HTTP=%s（期望 200）" % (label, probe(tag, out) or "NONE"))

    # --- data/ 四道关卡 ---
    if probe("MOCKPAPERS", out) != "200":
        fatal.append("data/mock-papers.js HTTP=%s（期望 200：非 200 说明 data/ 未随包解压）"
                     % (probe("MOCKPAPERS", out) or "NONE"))
    mk = probe("MOCKPAPERS_MARK", out)
    if not mk.isdigit() or int(mk) < 1:
        fatal.append("data/mock-papers.js 标记 %s 命中 %s（期望 >=1：0 说明上线文件不对）"
                     % (MOCK_PAPERS_MARK, mk or "0"))
    info.append("data/ 关卡：MOCKPAPERS 200 + 标记命中 " + (mk or "0") + " + 全量 MD5 覆盖（见上）")

    # --- B1/B2 删减（可执行调用必须为 0；注释已剥离）---
    for tag, label in (("CET_WRITE_CALL", "四级备考 openMiniQuiz('cet-write')"),
                       ("EXAM_QUANT_CALL", "央国企笔试 openMiniQuiz('exam-quant')"),
                       ("EXAM_DEDUCE_CALL", "央国企笔试 openMiniQuiz('exam-deduce')"),
                       ("EXAM_DATA_CALL", "央国企笔试 openMiniQuiz('exam-data')")):
        v = num(tag)
        if v != 0:
            fatal.append("%s 仍存在可执行调用（计数=%s，期望 0）" % (label, v))
    # --- B3 删减 ---
    for tag, label in (("EQ_QUIZ_CARD", "高情商表达 eqQuizCard"),
                       ("EQ_QUIZ_TITLE", "高情商表达「情景选择实战」")):
        v = num(tag)
        if v != 0:
            fatal.append("%s 仍存在（计数=%s，期望 0）" % (label, v))
    # --- B4 删减 ---
    for tag, label in (("TOOLS_JINJU_LINK", "工具页「万能金句」跳转"),
                       ("TOOLS_HUASHU_LINK", "工具页「场景话术」跳转"),
                       ("TOOLS_JINJU_TITLE", "工具页「万能金句」标题")):
        v = num(tag)
        if v != 0:
            fatal.append("%s 仍存在（计数=%s，期望 0）" % (label, v))
    # --- 模考三页：禁 history.back()（可执行）、必须有 goBack ---
    for i in range(3):
        back = num("MOCK%d_BACK_EXEC" % i)
        if back != 0:
            fatal.append("mock 第%d页 仍存在可执行 javascript:history.back()（计数=%s，期望 0）"
                         % (i, back))
        gb = num("MOCK%d_GOBACK" % i)
        if gb is None or gb < 1:
            fatal.append("mock 第%d页 未找到 onclick=\"goBack（计数=%s，期望 >=1）" % (i, gb))
        info.append("mock 第%d页：BACK 可执行=%s（raw 文档提及=%s，已剥离注释）GOBACK=%s"
                    % (i, back, probe("MOCK%d_BACK_RAW" % i, out), gb))
    # --- 版本探针 ---
    cv = num("CET_VER_I")
    if cv is None or cv < 10:
        fatal.append("四级备考.html 版本串 20260913i 计数=%s（期望 >=10：漏 bump 会命中旧缓存）"
                     % cv)
    hv = num("HOME_VER_I")
    if hv is None or hv < 10:
        fatal.append("首页 学习工作台.html 版本串 20260913i 计数=%s（期望 >=10）" % hv)
    hd = num("HOME_DATAICON")
    if hd is None or hd < 1:
        fatal.append("首页 data-icon 计数=%s（期望 >=1）" % hd)
    # --- E1 图标（blog_wechat.html 本批不上线，远端仍为 h 版文件，应继续通过）---
    for tag, label in (("E1_BN_ICON_SPAN", "blog_wechat bn-icon 图标 span"),
                       ("E1_MPC_ICON_SPAN", "工具页 mpc-icon 图标 span")):
        v = num(tag)
        if v is None or v < 1:
            fatal.append("%s 计数=%s（期望 >=1：E1 升级未生效）" % (label, v))

    # --- DB / 日志 ---
    us = num("USERS")
    if us is None:
        fatal.append("USERS 探针无输出（数据库不可读？）")
    elif us < USERS_BASELINE:
        fatal.append("USERS=%s < 基线 %s（疑似数据丢失，禁止视为部署成功）" % (us, USERS_BASELINE))
    elif us > USERS_BASELINE:
        info.append("USERS=%s > 基线 %s（新增注册用户，正常）" % (us, USERS_BASELINE))
    else:
        info.append("USERS=%s（= 基线，符合预期）" % us)
    if probe("FILEREAD_FAIL", out):
        fatal.append("远端探针无法读取页面文件：%s" % probe("FILEREAD_FAIL", out))
    tb = num("TRACEBACK_10MIN")
    if tb is None:
        info.append("TRACEBACK_10MIN 探针无输出（journalctl 不可用？按 INFO 处理）")
    elif tb > 0:
        fatal.append("近 10 分钟 study-workbench 日志含 traceback/exception %s 条（本批不重启服务，"
                     "若为历史日志请人工确认后再放行）" % tb)
    else:
        info.append("TRACEBACK_10MIN=0（干净）")
    return fatal, info


# ---------------- 主流程 ----------------
def main():
    dry = ("--dry-run" in sys.argv[1:]) or (os.environ.get("SW_DRY_RUN") == "1")
    skip_upload = os.environ.get("SW_SKIP_UPLOAD") == "1"
    assert_root_law()
    L = collect()

    print("[0] ROOT=%s" % ROOT)
    print("[0] 页面 %d（已排除 blog_wechat.html）+ assets(js/css) %d + assets/data.json %d "
          "+ emoji %d + 根data %d = %d 个文件"
          % (len(L["pages"]), len(L["assets"]), len(L["datajson"]), len(L["emoji"]),
             len(L["data_files"]),
             len(L["pages"]) + len(L["assets"]) + len(L["datajson"]) + len(L["emoji"])
             + len(L["data_files"])))

    # ---- 清单（dry-run 与正式部署都会生成，便于人工复核）----
    manifest = build_manifest(L)
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        f.write(manifest)
    print("[1] 清单已写 -> " + MANIFEST_PATH)

    # ---- 打包 ----
    if os.path.exists(TAR_PATH):
        os.remove(TAR_PATH)
    with tarfile.open(TAR_PATH, "w:gz") as tar:
        for arc, p in iter_entries(L):
            tar.add(p, arcname=arc)
    print("[2] 打包完成 %d bytes -> %s" % (os.path.getsize(TAR_PATH), os.path.basename(TAR_PATH)))

    if dry:
        print("[DRY-RUN] 未联网、未读凭据、未上传。清单条数=%d"
              % (len(L["pages"]) + len(L["assets"]) + len(L["datajson"]) + len(L["emoji"])
                 + len(L["data_files"])))
        print("[DRY-RUN] 硬断言通过：assets/%s + data/%s"
              % ("、".join(ASSETS_MUST), "、".join(DATA_MUST)))
        print("[DRY-RUN] ROOT 铁律校验通过；blog_wechat.html 已排除（不上线）")
        return

    # ===== 以下为真正部署（需凭据）=====
    old_p = os.path.join(L["data_dir"], OLD_VOCAB)
    if os.path.isfile(old_p):
        raise SystemExit("停止：旧单文件 assets/data/%s 仍存在，请先确认无引用后删除再部署。"
                         % OLD_VOCAB)

    host, pwd = load_credentials()

    # ---------- 3. 上传（幂等）----------
    tar_md5 = md5(TAR_PATH)
    if skip_upload:
        print("[3] SW_SKIP_UPLOAD=1，跳过上传")
    else:
        rc, out, _ = plink("md5sum %s/deploy_%s.tar.gz 2>/dev/null" % (REMOTE_ROOT, STAMP),
                           host, pwd)
        remote_tar_md5 = (out.split()[0] if out.strip() and len(out.split()[0]) == 32 else "")
        if remote_tar_md5 == tar_md5:
            print("[3] 远端已有同 MD5 包，跳过上传")
        else:
            ok_up = False
            err = ""
            for attempt in range(1, 4):
                rc, out, err = run([PSCP, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, TAR_PATH,
                                    "root@%s:%s/" % (host, REMOTE_ROOT)], timeout=300)
                rc2, out2, _ = plink("md5sum %s/deploy_%s.tar.gz 2>/dev/null"
                                     % (REMOTE_ROOT, STAMP), host, pwd)
                got = (out2.split()[0] if out2.strip() and len(out2.split()[0]) == 32 else "")
                print("[3] 上传第 %d 次 rc=%s 远端MD5=%s" % (attempt, rc, got[:10] or "NONE"))
                if got == tar_md5:
                    ok_up = True
                    break
                time.sleep(3)
            if not ok_up:
                raise SystemExit("上传失败（3 次）: %s" % (err or "")[-400:])

    # ---------- 4. 备份 DB + 解压 + 全量 MD5 ----------
    verify_rel = [arc for arc, _ in iter_entries(L)]
    remote = (
        "cd %s || exit 1\n" % REMOTE_ROOT +
        "mkdir -p backups\n" +
        "cp -a server/data.db backups/data.db.before-%s 2>/dev/null && echo DB-BACKUP-OK "
        "|| echo DB-BACKUP-SKIP\n" % STAMP +
        "tar xzf deploy_%s.tar.gz -C %s/ || exit 1\n" % (STAMP, REMOTE_ROOT) +
        "echo '---MD5-BEGIN---'\n" +
        "cd %s/web && find . -maxdepth 3 -type f \\( -name '*.html' -o -name '*.js' "
        "-o -name '*.css' -o -name '*.json' \\) -print0 | xargs -0 md5sum\n" % REMOTE_ROOT +
        "echo '---MD5-END---'\n" +
        "rm -f %s/deploy_%s.tar.gz\n" % (REMOTE_ROOT, STAMP)
    )
    rc, out, err = plink(remote, host, pwd)
    if rc != 0 or "---MD5-BEGIN---" not in out:
        print("[4][DEBUG] stderr=%r" % err[-300:])
        raise SystemExit("远端解压/校验失败 rc=%s\n%s\n%s" % (rc, out[-800:], err[-400:]))
    block = out.split("---MD5-BEGIN---")[1].split("---MD5-END---")[0]
    remote_map = {}
    for line in block.strip().splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            # 反转成 {name: hash}（勿用 dict(...)，否则键值颠倒 → 全部误报 MISMATCH）
            remote_map[parts[1].strip().lstrip("./")] = parts[0]
    print("[4] 远端 MD5 %d 条；DB 备份: %s"
          % (len(remote_map), "OK" if "DB-BACKUP-OK" in out else "SKIP"))

    bad = []
    for rel in verify_rel:
        key = rel[len("web/"):] if rel.startswith("web/") else rel
        local = md5(os.path.join(ROOT, key.replace("/", os.sep)))
        rm = remote_map.get(key)
        if rm != local:
            bad.append((rel, local[:10], (rm or "MISSING")[:10]))
    print("[4] 全量 MD5 校验: %d/%d 一致" % (len(verify_rel) - len(bad), len(verify_rel)))
    for rel, lo, ro in bad[:20]:
        print("     BAD %s local=%s remote=%s" % (rel, lo, ro))

    # ---------- 5. 探针（不重启服务）----------
    rc2, out2, err2 = build_probe_command(host, pwd)
    print("=" * 60)
    print(out2.strip())
    print("=" * 60)
    if rc2 != 0:
        print("[5][WARN] 探针 rc=%s stderr=%r" % (rc2, err2[-300:]))

    fatal, info = judge_probes(out2)
    if bad:
        fatal.insert(0, "存在 %d 个文件 MD5 不一致（前 20 见上）" % len(bad))
    print("[5] 探针 INFO：")
    for m in info:
        print("     INFO " + m)
    if fatal:
        print("[5] 部署验收失败（FATAL 汇总）：")
        for m in fatal:
            print("     FATAL " + m)
        raise SystemExit("存在 FATAL 项，禁止视为部署成功（未重启服务，可安全重跑）")
    print("[5] 全部探针通过，部署完成（本批 server 零改动，未重启服务）")


if __name__ == "__main__":
    main()
