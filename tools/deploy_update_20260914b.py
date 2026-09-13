# -*- coding: utf-8 -*-
"""20260914b 部署：R39-R43 私聊/管理员前端批次上线（纯前端，不动 server/）。

与 deploy_update_20260913o.py 的差异：
  1. STAMP / 包名 / 清单名统一为 20260914b。
  2. 沿用全部安全机制：blog_wechat.html 排除、ROOT 铁律校验、
     资源硬断言（icon-map.js/subpage-router.js/mock-papers.js）、
     探针剥注释、SW_DRY_RUN/SW_SKIP_UPLOAD、全量 MD5 逐文件比对、
     凭据惰性读取、USERS=6 基线、DB 备份。
  3. 本批内容探针（证明 R39-R43 已上线）：
     - 私聊.html 含 `chat-local.js?v=20260914b` 与 `admin-contact.js?v=20260914b`
     - 私聊.html 含 `acEntryBadge`（R43 角标 DOM）
     - assets/chat-local.js 含 `imOpenChatWithUser`（R41）、`imShowUserProfile`（R42）、
       `imAdminUsersHtml`（R40）、`imFmtLastActive`（R40）
     - assets/admin-contact.js 含 `refreshEntryBadge` + `ac-badge`（R43）
  4. 保留旧批次回归探针：R33 im-tab 激活态、R34 ST_ACCT_RETRIES、R36 dailyReview、
     B1-B4 删减计数=0、模考三页禁 history.back()、首页 data-icon>=1、E1 图标 span>=1。
     旧页版本串仍为 20260913o（本批只 bump 私聊.html 的两个资源引用）。

前端(web/)：
  31 个 HTML 页面（排除 blog_wechat.html）+ assets/*.js/*.css
  + assets/data/*.json + assets/emoji/manifest.js + 根 data/。
  server/ 不打包（无改动）。

用法：
  $env:SW_DRY_RUN=1;  python tools/deploy_update_20260914b.py   # 本地清单+打包，不联网
  python tools/deploy_update_20260914b.py                       # 正式部署（上传+解压+全量校验+探针）
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
ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
STAMP = "20260914b"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
MANIFEST_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_0914b_manifest.txt")

EXCLUDE_HTML = {"settings.html", "设置_旧版.html", "profile.html",
                "profile_v2.html", "profile_v3.html",
                "blog_wechat.html"}   # 沿用：本批不上线该页
EXCLUDE_PREFIXES = ("settings_", "profile_", "_preview_", "_t")
ASSET_EXTS = {".js", ".css"}
MOCK_REL = "data/mock-papers.js"
ASSETS_MUST = ("icon-map.js", "subpage-router.js")
DATA_MUST = ("mock-papers.js",)
MOCK_PAPERS_MARK = "MOCK_PAPERS_DATA"

SETTINGS_PAGE = "设置.html"
FEEDBACK_API_MARK = "/api/feedback"   # 沿用 m 批静态断言：反馈表单仍在

EXPECTED_SHARDS = [
    "vocab-cet4-ext-a-c.json", "vocab-cet4-ext-d-f.json", "vocab-cet4-ext-g-i.json",
    "vocab-cet4-ext-j-l.json", "vocab-cet4-ext-m-o.json", "vocab-cet4-ext-p-r.json",
    "vocab-cet4-ext-s-u.json", "vocab-cet4-ext-v-z.json",
]
VOCAB_INDEX = "vocab-cet4-ext-index.json"
OLD_VOCAB = "vocab-cet4-ext.json"
EXCLUDE_DATA_JSON = {"vocab-ext-fields-patch.json"}

USERS_BASELINE = 6


# ---------------- 工具函数 ----------------
def assert_root_law():
    norm = os.path.normcase(os.path.abspath(ROOT)).replace("\\", "/")
    if "worktrees/" in norm.lower() + "/" or "/worktrees/" in norm.lower():
        if os.environ.get("SW_ALLOW_WORKTREE_ROOT") != "1":
            raise SystemExit(
                "[ROOT 铁律] ROOT 指向旧 worktree：%s\n"
                "实测旧 worktree 仍含已删除功能且无 J 批成果，直接部署会整体回退本批成果。\n"
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


def read_text(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


# ---------------- 清单收集 ----------------
def collect():
    pages = sorted(f for f in os.listdir(ROOT)
                   if f.endswith(".html") and f not in EXCLUDE_HTML
                   and not f.startswith(EXCLUDE_PREFIXES))
    assets_dir = os.path.join(ROOT, "assets")
    assets = sorted(f for f in os.listdir(assets_dir)
                    if os.path.splitext(f)[1].lower() in ASSET_EXTS
                    and os.path.isfile(os.path.join(assets_dir, f)))
    for must in ASSETS_MUST:
        if must not in assets:
            raise SystemExit("缺少关键前端文件 assets/%s（禁止部署）" % must)
    data_dir = os.path.join(assets_dir, "data")
    all_json = sorted(f for f in os.listdir(data_dir) if f.endswith(".json"))
    excluded_json = [f for f in all_json if f in EXCLUDE_DATA_JSON]
    datajson = [f for f in all_json if f not in EXCLUDE_DATA_JSON]
    emoji_dir = os.path.join(assets_dir, "emoji")
    emoji = sorted(os.listdir(emoji_dir)) if os.path.isdir(emoji_dir) else []
    root_data_dir = os.path.join(ROOT, "data")
    data_files = []
    if os.path.isdir(root_data_dir):
        for dp, _dns, fns in os.walk(root_data_dir):
            for fn in fns:
                data_files.append(
                    os.path.relpath(os.path.join(dp, fn), root_data_dir).replace(os.sep, "/"))
    data_files.sort()
    for must in DATA_MUST:
        if must not in data_files:
            raise SystemExit("缺少关键数据文件 data/%s（禁止部署）" % must)
    mock_abs = os.path.join(ROOT, MOCK_REL.replace("/", os.sep))
    if not os.path.isfile(mock_abs):
        raise SystemExit("缺少 " + MOCK_REL)
    settings_abs = os.path.join(ROOT, SETTINGS_PAGE)
    if not os.path.isfile(settings_abs):
        raise SystemExit("缺少页面 %s（无法完成反馈表单静态断言，禁止部署）" % SETTINGS_PAGE)
    fb_count = read_text(settings_abs).count(FEEDBACK_API_MARK)
    if fb_count < 1:
        raise SystemExit("%s 未含 %s（帮助与反馈表单未上线，禁止部署）"
                         % (SETTINGS_PAGE, FEEDBACK_API_MARK))
    return {
        "pages": pages, "assets": assets, "datajson": datajson,
        "excluded_json": excluded_json, "emoji": emoji, "data_files": data_files,
        "mock_abs": mock_abs, "assets_dir": assets_dir, "data_dir": data_dir,
        "emoji_dir": emoji_dir, "root_data_dir": root_data_dir,
        "fb_count": fb_count,
    }


def iter_entries(L):
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
    lines.append("server 文件           : 0（本批纯前端，不动 server/）" % ())
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
    lines.append("  %s 含 %s : %d 处（>=1 通过）"
                 % (SETTINGS_PAGE, FEEDBACK_API_MARK, L["fb_count"]))
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
    lines.append("  已排除：web/blog_wechat.html（本批不上线）")
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
# ---- 本批 R33/R34/R36 回归探针（上一批内容，须仍在线）----
print("R33_IMTAB:" + str(cnt("\u79c1\u804a.html", r'\.im-tab\.active\{background:var\(--primary\);color:#fff')))
print("R34_ACCT_RETRY:" + str(cnt("\u8bbe\u7f6e.html", r"ST_ACCT_RETRIES")))
print("R36_DAILY_REVIEW_UI:" + str(cnt("\u8bbe\u7f6e.html", r"\u6bcf\u65e5\u590d\u4e60\u91cf")))
print("R36_DAILY_REVIEW_JS:" + str(cnt("\u8bbe\u7f6e.html", r"dailyReview")))
# ---- 本批 R39-R43 内容探针（JS 用 raw，避免剥注释逻辑误伤）----
print("PRIV_VER_B:" + str(cnt("\u79c1\u804a.html", r"20260914b")))
print("R43_ENTRY_DOM:" + str(cnt("\u79c1\u804a.html", r"acEntryBadge")))
print("R41_OPEN_WITH_USER:" + str(raw("assets/chat-local.js", r"imOpenChatWithUser")))
print("R42_SHOW_PROFILE:" + str(raw("assets/chat-local.js", r"imShowUserProfile")))
print("R40_ADMIN_USERS:" + str(raw("assets/chat-local.js", r"imAdminUsersHtml")))
print("R40_FMT_LASTACTIVE:" + str(raw("assets/chat-local.js", r"imFmtLastActive")))
print("R39_DYNAMIC_CHAT:" + str(raw("assets/chat-local.js", r"imEnsureServerChat")))
print("R43_BADGE_FN:" + str(raw("assets/admin-contact.js", r"refreshEntryBadge")))
print("R43_BADGE_CLS:" + str(raw("assets/admin-contact.js", r"ac-badge")))
print("CET_VER_N:" + str(cnt("\u56db\u7ea7\u5907\u8003.html", r"20260913o")))
print("HOME_DATAICON:" + str(cnt("\u5b66\u4e60\u5de5\u4f5c\u53f0.html", r"data-icon=")))
print("HOME_VER_N:" + str(cnt("\u5b66\u4e60\u5de5\u4f5c\u53f0.html", r"20260913o")))
print("E1_BN_ICON_SPAN:" + str(cnt("blog_wechat.html", r'bn-icon"><span class="nav-icon"')))
print("E1_MPC_ICON_SPAN:" + str(cnt("\u5de5\u5177.html", r'mpc-icon" data-icon=')))
'''


def build_probe_command(host, pwd):
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
        "echo MOCKPAPERS_MARK:$(curl -s http://127.0.0.1/data/mock-papers.js | grep -c '"
        + MOCK_PAPERS_MARK + "')\n"
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
    fatal, info = [], []

    def num(tag):
        v = probe(tag, out)
        return int(v) if v.lstrip("-").isdigit() else None

    if probe("SERVICE", out) != "active":
        fatal.append("study-workbench 服务非 active（=%s）" % (probe("SERVICE", out) or "NONE"))
    nr = num("NRESTARTS")
    if nr is None:
        info.append("NRESTARTS 探针无输出（按 INFO 处理）")
    else:
        info.append("NRESTARTS=%s（前端批次不重启服务，仅作 INFO；放行门槛为 SERVICE active + HEALTH 200）" % nr)
    for tag, label in (("SITE", "站点根"), ("HEALTH", "后端 /api/health"),
                       ("ICONMAP", "assets/icon-map.js"),
                       ("SUBPAGEROUTER", "assets/subpage-router.js"),
                       ("HOMEPAGE", "首页")):
        if probe(tag, out) != "200":
            fatal.append("%s HTTP=%s（期望 200）" % (label, probe(tag, out) or "NONE"))

    if probe("MOCKPAPERS", out) != "200":
        fatal.append("data/mock-papers.js HTTP=%s（期望 200）" % (probe("MOCKPAPERS", out) or "NONE"))
    mk = probe("MOCKPAPERS_MARK", out)
    if not mk.isdigit() or int(mk) < 1:
        fatal.append("data/mock-papers.js 标记 %s 命中 %s（期望 >=1）" % (MOCK_PAPERS_MARK, mk or "0"))
    else:
        info.append("data/ 关卡：MOCKPAPERS 200 + 标记命中 " + mk)

    for tag, label in (("CET_WRITE_CALL", "四级备考 openMiniQuiz('cet-write')"),
                       ("EXAM_QUANT_CALL", "央国企笔试 openMiniQuiz('exam-quant')"),
                       ("EXAM_DEDUCE_CALL", "央国企笔试 openMiniQuiz('exam-deduce')"),
                       ("EXAM_DATA_CALL", "央国企笔试 openMiniQuiz('exam-data')")):
        v = num(tag)
        if v != 0:
            fatal.append("%s 仍存在可执行调用（计数=%s，期望 0）" % (label, v))
    for tag, label in (("EQ_QUIZ_CARD", "高情商表达 eqQuizCard"),
                       ("EQ_QUIZ_TITLE", "高情商表达「情景选择实战」")):
        v = num(tag)
        if v != 0:
            fatal.append("%s 仍存在（计数=%s，期望 0）" % (label, v))
    for tag, label in (("TOOLS_JINJU_LINK", "工具页「万能金句」跳转"),
                       ("TOOLS_HUASHU_LINK", "工具页「场景话术」跳转"),
                       ("TOOLS_JINJU_TITLE", "工具页「万能金句」标题")):
        v = num(tag)
        if v != 0:
            fatal.append("%s 仍存在（计数=%s，期望 0）" % (label, v))
    for i in range(3):
        back = num("MOCK%d_BACK_EXEC" % i)
        if back != 0:
            fatal.append("mock 第%d页 仍存在可执行 javascript:history.back()（计数=%s，期望 0）" % (i, back))
        gb = num("MOCK%d_GOBACK" % i)
        if gb is None or gb < 1:
            fatal.append("mock 第%d页 未找到 onclick=\"goBack（计数=%s，期望 >=1）" % (i, gb))
        else:
            info.append("mock 第%d页：BACK 可执行=%s GOBACK=%s" % (i, back, gb))

    # ---- 上一批 R33/R34/R36 回归探针（仍须在线）----
    r33 = num("R33_IMTAB")
    if r33 is None or r33 < 1:
        fatal.append("回归：R33 私聊.html 未含 .im-tab.active{background:var(--primary);color:#fff（计数=%s）" % r33)
    r34 = num("R34_ACCT_RETRY")
    if r34 is None or r34 < 1:
        fatal.append("回归：R34 设置.html 未含 ST_ACCT_RETRIES（计数=%s）" % r34)
    r36ui = num("R36_DAILY_REVIEW_UI")
    if r36ui is None or r36ui < 1:
        fatal.append("回归：R36 设置.html 未含「每日复习量」设置项（计数=%s）" % r36ui)
    r36js = num("R36_DAILY_REVIEW_JS")
    if r36js is None or r36js < 1:
        fatal.append("回归：R36 设置.html 未含 dailyReview（计数=%s）" % r36js)

    # ---- 本批 R39-R43 内容探针 ----
    pvb = num("PRIV_VER_B")
    if pvb is None or pvb < 2:
        fatal.append("私聊.html 版本串 20260914b 计数=%s（期望 >=2：chat-local.js 与 admin-contact.js 均须 bump）" % pvb)
    else:
        info.append("私聊.html 版本串 20260914b 已上线（计数=%s）" % pvb)
    checks = [
        ("R43_ENTRY_DOM", "R43 私聊.html 角标 DOM #acEntryBadge", 1),
        ("R41_OPEN_WITH_USER", "R41 chat-local.js imOpenChatWithUser", 1),
        ("R42_SHOW_PROFILE", "R42 chat-local.js imShowUserProfile", 1),
        ("R40_ADMIN_USERS", "R40 chat-local.js imAdminUsersHtml（全部用户分组）", 1),
        ("R40_FMT_LASTACTIVE", "R40 chat-local.js imFmtLastActive（活跃时间格式化）", 1),
        ("R39_DYNAMIC_CHAT", "R39 chat-local.js imEnsureServerChat（动态会话）", 1),
        ("R43_BADGE_FN", "R43 admin-contact.js refreshEntryBadge", 1),
        ("R43_BADGE_CLS", "R43 admin-contact.js .ac-badge 样式/渲染", 1),
    ]
    for tag, label, need in checks:
        v = num(tag)
        if v is None or v < need:
            fatal.append("%s 计数=%s（期望 >=%s）" % (label, v, need))
        else:
            info.append("%s 已上线（计数=%s）" % (label, v))

    cv = num("CET_VER_N")
    if cv is None or cv < 10:
        fatal.append("四级备考.html 版本串 20260913o 计数=%s（期望 >=10：漏 bump 会命中旧缓存）" % cv)
    hv = num("HOME_VER_N")
    if hv is None or hv < 10:
        fatal.append("首页 学习工作台.html 版本串 20260913o 计数=%s（期望 >=10）" % hv)
    hd = num("HOME_DATAICON")
    if hd is None or hd < 1:
        fatal.append("首页 data-icon 计数=%s（期望 >=1）" % hd)
    for tag, label in (("E1_BN_ICON_SPAN", "blog_wechat bn-icon 图标 span"),
                       ("E1_MPC_ICON_SPAN", "工具页 mpc-icon 图标 span")):
        v = num(tag)
        if v is None or v < 1:
            fatal.append("%s 计数=%s（期望 >=1：E1 升级未生效）" % (label, v))

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
        fatal.append("近 10 分钟 study-workbench 日志含 traceback/exception %s 条（禁止放行）" % tb)
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
    print("[0] 静态断言：%s 含 %s ×%d（>=1 通过）"
          % (SETTINGS_PAGE, FEEDBACK_API_MARK, L["fb_count"]))

    manifest = build_manifest(L)
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        f.write(manifest)
    print("[1] 清单已写 -> " + MANIFEST_PATH)

    if os.path.exists(TAR_PATH):
        os.remove(TAR_PATH)
    with tarfile.open(TAR_PATH, "w:gz") as tar:
        for arc, p in iter_entries(L):
            tar.add(p, arcname=arc)
    print("[2] 打包完成 %d bytes -> %s（纯前端，server/ 不打包）"
          % (os.path.getsize(TAR_PATH), os.path.basename(TAR_PATH)))

    if dry:
        print("[DRY-RUN] 未联网、未读凭据、未上传、未改远端 .env、未重启服务。清单条数=%d"
              % (len(L["pages"]) + len(L["assets"]) + len(L["datajson"]) + len(L["emoji"])
                 + len(L["data_files"])))
        print("[DRY-RUN] 硬断言通过：assets/%s + data/%s" % ("、".join(ASSETS_MUST), "、".join(DATA_MUST)))
        print("[DRY-RUN] ROOT 铁律校验通过；blog_wechat.html 已排除；%s 含 %s（%d 处）"
              % (SETTINGS_PAGE, FEEDBACK_API_MARK, L["fb_count"]))
        return

    old_p = os.path.join(L["data_dir"], OLD_VOCAB)
    if os.path.isfile(old_p):
        raise SystemExit("停止：旧单文件 assets/data/%s 仍存在，请先确认无引用后删除再部署。" % OLD_VOCAB)

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

    # ---------- 7. 探针（服务健康检查 + 内容探针；本批不重启服务）----------
    print("[5] 本批纯前端，跳过服务器重启（server/ 无改动）。直接跑健康检查 + 内容探针。")
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
        raise SystemExit("存在 FATAL 项，禁止视为部署成功（可安全重跑；重跑时上传/MD5 幂等）")
    print("[5] 全部探针通过，部署完成（纯前端，server 未重启；服务仍 active 且健康）")


if __name__ == "__main__":
    main()
