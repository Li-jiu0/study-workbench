# -*- coding: utf-8 -*-
"""20260914f 部署：R49-R61 收官批（前端全量 + server 三件套 + 重启服务）。

本批内容（前端线 + 后端线均已改完并通过 QA 78/78 证伪）：
  前端：
    - 新增 assets/ppt-works.js（R58 PPT 作品集渲染器，注册 window.PPTV2['ppt-works']）
    - 改动 assets/app.js（R60 全局通知 xtNotifyMessage/xtSetUnread、R59 字号变量、
      R61 renderPostStatsOnly、R50 内联 718 题 INLINE_QUANT_BANK 前移至 examInit 之前）
    - 改动 assets/chat-local.js（R51 图片消息 kind:'image'、R49 好友不闪、R53 群头像、
      R54 群主转让、R56/R57 tab 与文案、R60 钩子 currentChatUserId/__xtChatTransportActive）
    - 改动 assets/common.css（.msg-toast 等）
    - 改动 私聊.html（R55 接收侧 study_workbench_share_forward_v1 + R56 tab）
    - 改动 学习博客.html（R55 分享三形态）
    - 改动 PPT训练.html + 个人中心.html 等；版本戳统一 bump 到 20260914f（36 文件/95 处）
  后端（**本批新增，必须重启**）：
    - server/routers/uploads.py  新增 POST /api/uploads/image（≤5MB + 魔数白名单）
    - server/routers/groups.py   新增 POST /api/groups/{gid}/transfer；PATCH 支持 avatar
    - server/schemas.py          配套字段
    （已做三层差异预检：本地为服务器版严格超集，无函数/路由/字段丢失）

安全机制（沿用 e 版骨架）：
  - ROOT 铁律（必须是 D:\\下载的文件\\学习工作台，worktree 直接拒绝）；
  - blog_wechat.html 继续排除；settings_/profile_/_preview_/_t 前缀排除；
  - 硬断言：assets/icon-map.js、assets/subpage-router.js、data/mock-papers.js 必在；
  - **硬闸门：包内 server/ 文件必须恰为 3 个**（本批后端必上）；
  - 本批静态断言：改动资源版本戳齐备、**旧版本号残留为 0**、新/改资源特征串在本地存在；
  - 逐文件 MD5 **全量**比对（含 server 三件套）；
  - 远端先备份 DB + 备份 3 个 .py → 解压 → py_compile 校验 → 重启 → 探针；
  - dry-run 永不联网。

用法：
  $env:SW_DRY_RUN=1;  python tools/deploy_update_20260914f.py   # 本地清单+打包，不联网
  python tools/deploy_update_20260914f.py                       # 正式部署（上传+解压+校验+重启+探针）
"""
import base64
import hashlib
import io
import os
import re
import subprocess
import sys
import tarfile
import time

# ---------------- 常量 ----------------
ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
STAMP = "20260914f"
NEW_VER = "20260914f"
OLD_VER = "20260913g"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
REMOTE_WEB = REMOTE_ROOT + "/web"
SERVICE_NAME = "study-workbench"
MANIFEST_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_0914f_manifest.txt")
LOG_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_20260914f_report.txt")

EXCLUDE_HTML = {"settings.html", "设置_旧版.html", "profile.html",
                "profile_v2.html", "profile_v3.html",
                "blog_wechat.html"}          # blog_wechat.html 继续不上线
EXCLUDE_PREFIXES = ("settings_", "profile_", "_preview_", "_t")
ASSET_EXTS = {".js", ".css"}
MOCK_REL = "data/mock-papers.js"
ASSETS_MUST = ("icon-map.js", "subpage-router.js")
DATA_MUST = ("mock-papers.js",)
EXCLUDE_DATA_JSON = {"vocab-ext-fields-patch.json"}

# ---- 本批被改动/新增的前端资源（版本戳必须全部 = 20260914f）----
CHANGED_RES = ("app.js", "common.css", "chat-local.js",
               "admin-contact.js", "ppt-works.js", "xt-content.js")
NEW_ASSETS = ("ppt-works.js",)          # 本批唯一新增资源

# ---- 本批后端改动（必须恰为 3 个）----
SERVER_FILES = ("server/routers/uploads.py",
                "server/routers/groups.py",
                "server/schemas.py")

CHANGED_RES_RE = re.compile(
    r"assets/(app\.js|common\.css|chat-local\.js|admin-contact\.js|ppt-works\.js|"
    r"xt-content\.js)\?v=([0-9A-Za-z]+)")

# 关键页面（本批必上且必含新戳/特征）
KEY_PAGES = {
    "私聊.html": ["study_workbench_share_forward_v1", "__imConsumeForward"],
    "学习博客.html": ["study_workbench_share_forward_v1"],
    "PPT训练.html": ["ppt-works.js", "PPTV2"],
    "个人中心.html": ["renderPostStatsOnly"],
}

# 关键资源特征串（证代码已落地）
FEATURES = {
    "app.js": ["xtNotifyMessage", "xtSetUnread", "INLINE_QUANT_BANK",
               "renderPostStatsOnly", "xtRefreshExamBankUI"],
    "chat-local.js": ["kind:'image'", "/api/uploads/image", "im-img-preview",
                      "currentChatUserId", "__xtChatTransportActive"],
    "common.css": [".msg-toast"],
    "ppt-works.js": ["xtc:lib:pptw:"],
}

USERS_BASELINE = 6          # 生产库真实用户数（不得减少）
NRESTARTS_MAX = 2


# ---------------- 工具函数 ----------------
def assert_root_law():
    norm = os.path.normcase(os.path.abspath(ROOT)).replace("\\", "/").lower()
    if "worktrees/" in norm or "/worktrees/" in norm:
        if os.environ.get("SW_ALLOW_WORKTREE_ROOT") != "1":
            raise SystemExit(
                "[ROOT 铁律] ROOT 指向旧 worktree：%s\n"
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
            m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
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


def stale_refs(text):
    """返回改动资源引用中「版本不是 20260914f」的条数（应为 0）。"""
    return sum(1 for _r, v in CHANGED_RES_RE.findall(text) if v != NEW_VER)


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
    missing_new = [a for a in NEW_ASSETS if a not in assets]
    if missing_new:
        raise SystemExit("本批新建资源缺失：%s（禁止部署）" % missing_new)

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
    if not os.path.isfile(os.path.join(ROOT, MOCK_REL.replace("/", os.sep))):
        raise SystemExit("缺少 " + MOCK_REL)

    # ---- 断言 1：server 三件套在本地存在 ----
    for rel in SERVER_FILES:
        p = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.isfile(p):
            raise SystemExit("缺少后端文件 %s（本批必上，禁止部署）" % rel)

    # ---- 断言 2：关键页面在清单且含特征串 ----
    key_hits = {}
    for page, feats in KEY_PAGES.items():
        if page not in pages:
            raise SystemExit("%s 未进清单（本批必上页）" % page)
        src = read_text(os.path.join(ROOT, page))
        key_hits[page] = {ft: src.count(ft) for ft in feats}
        for ft, n in key_hits[page].items():
            if n < 1:
                raise SystemExit("%s 缺少特征串 %s（改动未落地，禁止部署）" % (page, ft))

    # ---- 断言 3：关键资源特征串在本地文件里 ----
    feat_hits = {}
    for res, feats in FEATURES.items():
        if res not in assets:
            raise SystemExit("assets/%s 缺失（禁止部署）" % res)
        src = read_text(os.path.join(assets_dir, res))
        feat_hits[res] = {ft: src.count(ft) for ft in feats}
        for ft, n in feat_hits[res].items():
            if n < 1:
                raise SystemExit("assets/%s 缺少特征串 %s（改动未落地，禁止部署）" % (res, ft))

    # ---- 断言 4：所有页面的改动资源引用版本戳必须 = 20260914f，旧残留为 0 ----
    stale_map = {}
    for p in pages:
        n = stale_refs(read_text(os.path.join(ROOT, p)))
        if n:
            stale_map[p] = n
    if stale_map:
        raise SystemExit("以下页面仍残留旧版本戳引用（应为 0）：%s" % stale_map)

    # ---- 断言 5：引用了改动资源的页面，新戳必须出现（抽样统计）----
    bump_pages, ver_total = [], 0
    for p in pages:
        src = read_text(os.path.join(ROOT, p))
        hits = [v for _r, v in CHANGED_RES_RE.findall(src) if v == NEW_VER]
        if hits:
            bump_pages.append(p)
            ver_total += len(hits)

    # ---- 断言 6：后端三件套含本批新增内容 ----
    up = read_text(os.path.join(ROOT, SERVER_FILES[0].replace("/", os.sep)))
    gr = read_text(os.path.join(ROOT, SERVER_FILES[1].replace("/", os.sep)))
    if "/image" not in up:
        raise SystemExit("server/routers/uploads.py 未见 /image 路由（禁止部署）")
    if "transfer" not in gr or "avatar" not in gr:
        raise SystemExit("server/routers/groups.py 未见 transfer/avatar（禁止部署）")

    return {
        "pages": pages, "assets": assets, "datajson": datajson,
        "excluded_json": excluded_json, "emoji": emoji, "data_files": data_files,
        "assets_dir": assets_dir, "data_dir": data_dir, "emoji_dir": emoji_dir,
        "root_data_dir": root_data_dir,
        "key_hits": key_hits, "feat_hits": feat_hits,
        "bump_pages": bump_pages, "ver_total": ver_total,
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
    for rel in SERVER_FILES:
        yield rel, os.path.join(ROOT, rel.replace("/", os.sep))


def build_manifest(L, entries):
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
    lines.append("本批范围   : 前端全量 + server 三件套；重启 %s 服务" % SERVICE_NAME)
    lines.append("")
    lines.append("--- 计数 ---")
    lines.append("HTML 页面            : %d（已排除 blog_wechat.html）" % len(L["pages"]))
    lines.append("assets JS/CSS        : %d" % len(L["assets"]))
    lines.append("assets/data JSON     : %d" % len(L["datajson"]))
    lines.append("assets/emoji         : %d" % len(L["emoji"]))
    lines.append("根 data/ 文件         : %d" % len(L["data_files"]))
    lines.append("server 文件           : %d（%s）" % (len(SERVER_FILES), "、".join(SERVER_FILES)))
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
    for rel in SERVER_FILES:
        lines.append("  %s : 在" % rel)
    lines.append("")
    lines.append("--- 本批资源特征串自检 ---")
    for res, hits in L["feat_hits"].items():
        for ft, n in hits.items():
            lines.append("  assets/%s 含 %s : %d" % (res, ft, n))
    lines.append("")
    lines.append("--- 本批关键页面自检 ---")
    for page, hits in L["key_hits"].items():
        for ft, n in hits.items():
            lines.append("  %s 含 %s : %d" % (page, ft, n))
    lines.append("")
    lines.append("--- 版本戳自检 ---")
    lines.append("  带 %s 的页面数 : %d" % (NEW_VER, len(L["bump_pages"])))
    lines.append("  %s 命中总数   : %d" % (NEW_VER, L["ver_total"]))
    lines.append("  旧版本戳残留   : 0 处（已逐页断言）")
    lines.append("")
    lines.append("--- 安全闸门 ---")
    lines.append("  包内 server/ 文件数 : %d（硬闸门，本批必上后端）" % len(SERVER_FILES))
    lines.append("  已排除：web/blog_wechat.html（继续不上线）")
    if L["excluded_json"]:
        for name in L["excluded_json"]:
            lines.append("  已排除：assets/data/%s" % name)
    lines.append("")
    lines.append("--- 清单明细（arcname, 字节）---")
    for arc, p in entries:
        lines.append("%9d  %s" % (os.path.getsize(p), arc))
    return "\n".join(lines) + "\n"


# ---------------- 远端探针 ----------------
PROBE_PY = r'''
import json
import re
import sqlite3
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1"
API = "http://127.0.0.1:8000"
VER = "20260914f"

PPTW = "/assets/ppt-works.js"
PAGES = {
    "company": "\u4f01\u4e1a\u5b9a\u5411\u5e93.html",
    "im": "\u79c1\u804a.html",
    "blog": "\u5b66\u4e60\u535a\u5ba2.html",
}


def get(path, base=None):
    try:
        with urllib.request.urlopen((base or BASE) + path, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, "EXC:%s" % e


def cnt(text, pat):
    return len(re.findall(pat, text))


# 1) 本批新增资源 ppt-works.js（带新版本号取，证明缓存穿透）
code, pw = get("%s?v=%s" % (PPTW, VER))
print("PPTW_HTTP:" + str(code))
print("PPTW_BYTES:" + str(len(pw)))
print("PPTW_KEY:" + str(cnt(pw, "xtc:lib:pptw:")))

# 2) 首页：200 且含新版本戳
code, home = get("/")
print("HOME_HTTP:" + str(code))
print("HOME_VER_F:" + str(cnt(home, VER)))

# 3) app.js / chat-local.js 线上内容特征
code, appjs = get("/assets/app.js?v=" + VER)
print("APP_HTTP:" + str(code))
print("APP_NOTIFY:" + str(cnt(appjs, "xtNotifyMessage")))
print("APP_UNREAD:" + str(cnt(appjs, "xtSetUnread")))
print("APP_INLINE_QUANT:" + str(cnt(appjs, "INLINE_QUANT_BANK")))

code, cl = get("/assets/chat-local.js?v=" + VER)
print("CL_HTTP:" + str(code))
print("CL_IMAGE:" + str(cnt(cl, "kind:'image'")))
print("CL_UPLOAD:" + str(cnt(cl, "/api/uploads/image")))
print("CL_HOOK:" + str(cnt(cl, "__xtChatTransportActive")))

# 4) 关键页面 200 + 特征
for k, name in PAGES.items():
    code, body = get("/" + urllib.parse.quote(name))
    print("%s_HTTP:%s" % (k.upper(), code))
    print("%s_BYTES:%s" % (k.upper(), len(body)))
code, im = get("/" + urllib.parse.quote(PAGES["im"]))
print("IM_FWDKEY:" + str(cnt(im, "study_workbench_share_forward_v1")))
code, blog = get("/" + urllib.parse.quote(PAGES["blog"]))
print("BLOG_FWDKEY:" + str(cnt(blog, "study_workbench_share_forward_v1")))

# 5) 后端新端点（走 openapi.json 判定，避免 401/405 歧义）
code, spec = get("/openapi.json", base=API)
print("OPENAPI_HTTP:" + str(code))
paths = []
try:
    paths = list(json.loads(spec).get("paths", {}).keys())
except Exception:
    pass
print("EP_UPLOAD_IMAGE:" + str(1 if "/api/uploads/image" in paths else 0))
print("EP_TRANSFER:" + str(1 if any("transfer" in p for p in paths) else 0))
print("EP_PATHS:" + str(len(paths)))

# 5b) 兜底：openapi 不可用时，用「路由存在=405，不存在=404」直判
c_img, _ = get("/api/uploads/image", base=API)
c_tr, _ = get("/api/groups/1/transfer", base=API)
print("RAW_UPLOAD_IMAGE_GET:" + str(c_img))
print("RAW_TRANSFER_GET:" + str(c_tr))

# 6) 健康检查
code, _ = get("/api/health", base=API)
print("API_HEALTH:" + str(code))

# 7) 生产库：表数 + 用户数
try:
    con = sqlite3.connect("/opt/study-workbench/server/data.db", timeout=10)
    ntab = con.execute(
        "select count(*) from sqlite_master where type='table'").fetchone()[0]
    nuser = con.execute("select count(*) from users").fetchone()[0]
    con.close()
    print("DB_TABLES:" + str(ntab))
    print("DB_USERS:" + str(nuser))
except Exception as e:
    print("DB_TABLES:-1")
    print("DB_USERS:-1")
    print("DB_ERR:" + str(e)[:160])
print("PROBE_DONE:1")
'''


def build_probe_command(host, pwd):
    b64 = base64.b64encode(PROBE_PY.encode("utf-8")).decode("ascii")
    remote = (
        "echo SERVICE:$(systemctl is-active " + SERVICE_NAME + ")\n"
        "echo NRESTARTS:$(systemctl show -p NRestarts --value " + SERVICE_NAME + ")\n"
        "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
        "echo APIHEALTH:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1:8000/api/health)\n"
        "echo ---PROBES---\n"
        "echo " + b64 + " | base64 -d | python3 -\n"
        "echo TRACEBACK_10MIN:$(journalctl -u " + SERVICE_NAME + " --since -10min "
        "2>/dev/null | grep -icE 'traceback|exception|500 internal' || true)\n"
    )
    return plink(remote, host, pwd, timeout=300)


def probe(tag, text):
    m = re.search(r"^" + re.escape(tag) + r":(.*)$", text, re.M)
    return m.group(1).strip() if m else ""


def num_of(tag, out):
    v = probe(tag, out)
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def judge_probes(out):
    fatal, info = [], []

    svc = probe("SERVICE", out)
    if svc != "active":
        fatal.append("%s 服务非 active（=%s）" % (SERVICE_NAME, svc or "NONE"))
    else:
        info.append("SERVICE=active（本批已重启并恢复）")
    nr = num_of("NRESTARTS", out)
    if nr is None:
        info.append("NRESTARTS 无输出（按 INFO）")
    elif nr > NRESTARTS_MAX:
        fatal.append("NRESTARTS=%s > %s（疑似崩溃循环）" % (nr, NRESTARTS_MAX))
    else:
        info.append("NRESTARTS=%s" % nr)

    for tag, label in (("SITE", "站点根"), ("APIHEALTH", "/api/health")):
        if probe(tag, out) != "200":
            fatal.append("%s HTTP=%s（期望 200）" % (label, probe(tag, out) or "NONE"))
        else:
            info.append("%s HTTP=200" % label)

    # 新增资源 ppt-works.js
    if num_of("PPTW_HTTP", out) != 200:
        fatal.append("线上 assets/ppt-works.js HTTP=%s（期望 200）"
                     % (probe("PPTW_HTTP", out) or "NONE"))
    else:
        info.append("assets/ppt-works.js=200（%s 字节，含 xtc:lib:pptw: ×%s）"
                    % (probe("PPTW_BYTES", out), probe("PPTW_KEY", out)))
    if (num_of("PPTW_KEY", out) or 0) < 1:
        fatal.append("线上 ppt-works.js 未命中存储键 xtc:lib:pptw:")

    # 首页版本戳
    if (num_of("HOME_HTTP", out) or -1) != 200:
        fatal.append("首页 HTTP=%s" % (probe("HOME_HTTP", out) or "NONE"))
    elif (num_of("HOME_VER_F", out) or 0) < 1:
        fatal.append("线上首页未命中版本戳 %s（缓存未刷新？）" % NEW_VER)
    else:
        info.append("线上首页含 %s ×%s" % (NEW_VER, probe("HOME_VER_F", out)))

    # app.js / chat-local.js 线上特征
    if (num_of("APP_HTTP", out) or -1) != 200:
        fatal.append("线上 assets/app.js HTTP=%s" % (probe("APP_HTTP", out) or "NONE"))
    else:
        for tag, name, want in (("APP_NOTIFY", "xtNotifyMessage", 1),
                                ("APP_UNREAD", "xtSetUnread", 1),
                                ("APP_INLINE_QUANT", "INLINE_QUANT_BANK", 1)):
            n = num_of(tag, out) or 0
            if n < want:
                fatal.append("线上 app.js 未命中 %s（=%s，R60/R50 未上线）" % (name, n))
            else:
                info.append("线上 app.js 含 %s ×%s" % (name, n))
    if (num_of("CL_HTTP", out) or -1) != 200:
        fatal.append("线上 assets/chat-local.js HTTP=%s" % (probe("CL_HTTP", out) or "NONE"))
    else:
        for tag, name in (("CL_IMAGE", "kind:'image'"),
                          ("CL_UPLOAD", "/api/uploads/image"),
                          ("CL_HOOK", "__xtChatTransportActive")):
            n = num_of(tag, out) or 0
            if n < 1:
                fatal.append("线上 chat-local.js 未命中 %s（=%s）" % (name, n))
            else:
                info.append("线上 chat-local.js 含 %s ×%s" % (name, n))

    # 关键页面
    for k, label in (("COMPANY", "企业定向库.html"), ("IM", "私聊.html"),
                     ("BLOG", "学习博客.html")):
        if (num_of(k + "_HTTP", out) or -1) != 200:
            fatal.append("线上 %s HTTP=%s（期望 200）" % (label, probe(k + "_HTTP", out) or "NONE"))
        else:
            info.append("线上 %s HTTP=200（%s 字节）" % (label, probe(k + "_BYTES", out)))
    for tag, label in (("IM_FWDKEY", "私聊.html"), ("BLOG_FWDKEY", "学习博客.html")):
        n = num_of(tag, out) or 0
        if n < 1:
            fatal.append("线上 %s 未命中转发键 study_workbench_share_forward_v1（=%s）" % (label, n))
        else:
            info.append("线上 %s 含转发键 ×%s" % (label, n))

    # 后端新端点
    if (num_of("OPENAPI_HTTP", out) or -1) != 200:
        info.append("openapi.json 不可用（HTTP=%s），改用 405/404 直判"
                    % (probe("OPENAPI_HTTP", out) or "NONE"))
        if (num_of("RAW_UPLOAD_IMAGE_GET", out) or -1) == 404:
            fatal.append("/api/uploads/image 返回 404（R51 图片消息未上线，服务未重启？）")
        elif (num_of("RAW_UPLOAD_IMAGE_GET", out) or -1) in (401, 403, 405, 422):
            info.append("/api/uploads/image 已注册（HTTP=%s）"
                        % probe("RAW_UPLOAD_IMAGE_GET", out))
        else:
            fatal.append("/api/uploads/image HTTP=%s（无法判定）"
                         % (probe("RAW_UPLOAD_IMAGE_GET", out) or "NONE"))
        if (num_of("RAW_TRANSFER_GET", out) or -1) == 404:
            fatal.append("/api/groups/1/transfer 返回 404（R54 群主转让未上线）")
        elif (num_of("RAW_TRANSFER_GET", out) or -1) in (401, 403, 405, 422):
            info.append("/api/groups/{gid}/transfer 已注册（HTTP=%s）"
                        % probe("RAW_TRANSFER_GET", out))
        else:
            fatal.append("/api/groups/1/transfer HTTP=%s（无法判定）"
                         % (probe("RAW_TRANSFER_GET", out) or "NONE"))
    else:
        if (num_of("EP_UPLOAD_IMAGE", out) or 0) != 1:
            fatal.append("线上 openapi 未见 /api/uploads/image（R51 图片消息未上线，服务未重启？）")
        else:
            info.append("线上端点 /api/uploads/image 已注册")
        if (num_of("EP_TRANSFER", out) or 0) != 1:
            fatal.append("线上 openapi 未见 transfer 端点（R54 群主转让未上线）")
        else:
            info.append("线上端点 /api/groups/{gid}/transfer 已注册")
        info.append("openapi 路径总数=%s" % probe("EP_PATHS", out))

    # 探针内健康检查
    if probe("API_HEALTH", out) != "200":
        fatal.append("探针内 /api/health HTTP=%s（期望 200）" % (probe("API_HEALTH", out) or "NONE"))

    # 数据不减少
    nt = num_of("DB_TABLES", out)
    if nt is None or nt < 20:
        fatal.append("DB_TABLES=%s（期望 ≥20 张表）" % nt)
    else:
        info.append("DB_TABLES=%s" % nt)
    us = num_of("DB_USERS", out)
    if us is None:
        fatal.append("DB_USERS 无输出（数据库不可读？）")
    elif us < USERS_BASELINE:
        fatal.append("DB_USERS=%s < %s（用户数减少，禁止视为部署成功）" % (us, USERS_BASELINE))
    else:
        info.append("DB_USERS=%s（基线 %s，未减少）" % (us, USERS_BASELINE))
    if probe("DB_ERR", out):
        fatal.append("数据库直查异常：%s" % probe("DB_ERR", out))

    tb = num_of("TRACEBACK_10MIN", out)
    if tb is None:
        info.append("TRACEBACK_10MIN 无输出（journalctl 不可用？按 INFO）")
    elif tb > 0:
        fatal.append("近 10 分钟日志含 traceback/exception/500 ×%s（期望 0）" % tb)
    else:
        info.append("TRACEBACK_10MIN=0")
    if "PROBE_DONE:1" not in out:
        fatal.append("远端探针脚本未跑完（PROBE_DONE 缺失）")
    return fatal, info


# ---------------- 主流程 ----------------
def main():
    dry = ("--dry-run" in sys.argv[1:]) or (os.environ.get("SW_DRY_RUN") == "1")
    skip_upload = os.environ.get("SW_SKIP_UPLOAD") == "1"
    assert_root_law()
    L = collect()
    entries = list(iter_entries(L))

    # 硬闸门：包内 server/ 文件必须恰为 3 个
    serverish = [arc for arc, _ in entries if arc == "server" or arc.startswith("server/")]
    if sorted(serverish) != sorted(SERVER_FILES):
        raise SystemExit("包内 server/ 文件应为 %s，实际 %s（禁止部署）"
                         % (sorted(SERVER_FILES), sorted(serverish)))

    print("[0] ROOT=%s" % ROOT)
    print("[0] 页面 %d + assets %d + data.json %d + emoji %d + 根data %d + server %d = %d 个文件"
          % (len(L["pages"]), len(L["assets"]), len(L["datajson"]), len(L["emoji"]),
             len(L["data_files"]), len(serverish), len(entries)))
    print("[0] 版本戳 %s：命中页面 %d 个 / 引用 %d 处；旧残留=0（已逐页断言）"
          % (NEW_VER, len(L["bump_pages"]), L["ver_total"]))
    print("[0] 本批必上后端：%s" % "、".join(SERVER_FILES))

    manifest = build_manifest(L, entries)
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        f.write(manifest)
    print("[1] 清单已写 -> " + MANIFEST_PATH)

    if os.path.exists(TAR_PATH):
        os.remove(TAR_PATH)
    with tarfile.open(TAR_PATH, "w:gz") as tar:
        for arc, p in entries:
            tar.add(p, arcname=arc)
    print("[2] 打包完成 %d bytes -> %s" % (os.path.getsize(TAR_PATH),
                                           os.path.basename(TAR_PATH)))

    if dry:
        print("[DRY-RUN] 未联网、未读凭据、未上传、未改 .env、未重启服务。")
        print("[DRY-RUN] 清单条数=%d；server/ 文件数=%d；版本戳 %s 已就位"
              % (len(entries), len(serverish), NEW_VER))
        return

    host, pwd = load_credentials()
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        f.write("# %s 部署记录（增量落盘）\n" % STAMP)

    def log(line):
        print(line)
        try:
            with open(LOG_PATH, "a", encoding="utf-8") as _f:
                _f.write(line + "\n")
        except OSError:
            pass

    # ---------- 3. 上传（幂等）----------
    tar_md5 = md5(TAR_PATH)
    if skip_upload:
        log("[3] SW_SKIP_UPLOAD=1，跳过上传")
    else:
        rc, out, _ = plink("md5sum %s/deploy_%s.tar.gz 2>/dev/null" % (REMOTE_ROOT, STAMP),
                           host, pwd)
        remote_tar_md5 = (out.split()[0] if out.strip() and len(out.split()[0]) == 32 else "")
        if remote_tar_md5 == tar_md5:
            log("[3] 远端已有同 MD5 包，跳过上传")
        else:
            ok_up = False
            err = ""
            for attempt in range(1, 4):
                rc, out, err = run([PSCP, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                                    TAR_PATH, "root@%s:%s/" % (host, REMOTE_ROOT)],
                                   timeout=300)
                rc2, out2, _ = plink("md5sum %s/deploy_%s.tar.gz 2>/dev/null"
                                     % (REMOTE_ROOT, STAMP), host, pwd)
                got = (out2.split()[0] if out2.strip() and len(out2.split()[0]) == 32 else "")
                log("[3] 上传第 %d 次 rc=%s 远端MD5=%s" % (attempt, rc, got[:10] or "NONE"))
                if got == tar_md5:
                    ok_up = True
                    break
                time.sleep(3)
            if not ok_up:
                raise SystemExit("上传失败（3 次）: %s" % (err or "")[-400:])

    # ---------- 4. 备份 → 解压 → py_compile → 全量 MD5 ----------
    srv_bak = " ".join(
        "cp -a %s/%s backups/server-%s/%s 2>/dev/null || true"
        % (REMOTE_ROOT, rel, STAMP, rel.replace("/", "__"))
        for rel in SERVER_FILES)
    remote = (
        "cd %s || exit 1\n" % REMOTE_ROOT +
        "mkdir -p backups/server-%s\n" % STAMP +
        srv_bak + "\n"
        "cp -a server/data.db backups/data.db.before-%s 2>/dev/null && echo DB-BACKUP-OK "
        "|| echo DB-BACKUP-SKIP\n" % STAMP +
        "ls -l backups/data.db.before-%s 2>/dev/null | awk '{print \"DB-BACKUP-SIZE:\"$5}'\n" % STAMP +
        "tar xzf deploy_%s.tar.gz -C %s/ || exit 1\n" % (STAMP, REMOTE_ROOT) +
        "echo PYCHECK:$(python3 -c \"import py_compile,sys;"
        "m=[py_compile.compile('/opt/study-workbench/'+p, doraise=True) "
        "for p in ['server/routers/uploads.py','server/routers/groups.py','server/schemas.py']];"
        "print('OK')\" 2>&1 | tail -1)\n" +
        "echo '---MD5-BEGIN---'\n" +
        "cd %s/web && find . -maxdepth 3 -type f \\( -name '*.html' -o -name '*.js' "
        "-o -name '*.css' -o -name '*.json' \\) -print0 | xargs -0 md5sum\n" % REMOTE_ROOT +
        "cd %s && md5sum %s\n" % (REMOTE_ROOT, " ".join(SERVER_FILES)) +
        "echo '---MD5-END---'\n" +
        "rm -f %s/deploy_%s.tar.gz\n" % (REMOTE_ROOT, STAMP)
    )
    rc, out, err = plink(remote, host, pwd)
    if rc != 0 or "---MD5-BEGIN---" not in out:
        log("[4][DEBUG] stderr=%r" % err[-400:])
        raise SystemExit("远端解压/校验失败 rc=%s\n%s\n%s" % (rc, out[-800:], err[-400:]))
    if "DB-BACKUP-OK" not in out:
        raise SystemExit("DB 备份失败（未生成 backups/data.db.before-%s），中止部署" % STAMP)
    log("[4] DB 备份 %s 字节" % (probe("DB-BACKUP-SIZE", out) or "OK"))
    if probe("PYCHECK", out) != "OK":
        raise SystemExit("后端 py_compile 失败：%s（中止，未重启服务）" % probe("PYCHECK", out))
    log("[4] 后端 py_compile=OK")

    block = out.split("---MD5-BEGIN---")[1].split("---MD5-END---")[0]
    remote_map = {}
    for line in block.strip().splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            remote_map[parts[1].strip().lstrip("./")] = parts[0]
    bad = []
    for arc, local_path in entries:
        key = arc[len("web/"):] if arc.startswith("web/") else arc
        local = md5(local_path)
        rm = remote_map.get(key)
        if rm != local:
            bad.append((arc, local[:10], (rm or "MISSING")[:10]))
    log("[4] 全量 MD5 校验: %d/%d 一致（远端回读 %d 条）"
        % (len(entries) - len(bad), len(entries), len(remote_map)))
    for arc, lo, ro in bad[:20]:
        log("     BAD %s local=%s remote=%s" % (arc, lo, ro))
    if bad:
        raise SystemExit("存在 %d 个文件 MD5 不一致，中止（未重启服务）" % len(bad))

    # ---------- 5. 重启服务 ----------
    log("[5] 重启 %s ..." % SERVICE_NAME)
    rc, out, err = plink(
        "systemctl restart %s\n"
        "sleep 8\n"
        "echo RESTART_ISACTIVE:$(systemctl is-active %s)\n"
        "echo RESTART_NR:$(systemctl show -p NRestarts --value %s)\n"
        % (SERVICE_NAME, SERVICE_NAME, SERVICE_NAME), host, pwd)
    log("[5] 重启输出：%s" % out.strip().replace("\n", " | "))
    if probe("RESTART_ISACTIVE", out) != "active":
        raise SystemExit("重启后服务非 active（=%s），中止；stderr=%r"
                         % (probe("RESTART_ISACTIVE", out), err[-300:]))
    log("[5] 服务已 active，NRestarts=%s" % probe("RESTART_NR", out))

    # ---------- 6. 探针 ----------
    round_no = 0
    while True:
        round_no += 1
        rc2, out2, err2 = build_probe_command(host, pwd)
        log("=" * 60)
        log("探针第 %d 轮原始输出：" % round_no)
        log(out2.strip())
        log("=" * 60)
        if rc2 != 0:
            log("[6][WARN] 探针 rc=%s stderr=%r" % (rc2, err2[-300:]))
        fatal, info = judge_probes(out2)
        log("[6] 第 %d 轮 INFO：" % round_no)
        for m in info:
            log("     INFO " + m)
        if not fatal:
            log("[6] 全部探针通过（第 %d 轮）" % round_no)
            break
        log("[6] 第 %d 轮 FATAL：" % round_no)
        for m in fatal:
            log("     FATAL " + m)
        if round_no >= 3:
            raise SystemExit("探针连续 3 轮未通过，停止重试；证据见 " + LOG_PATH)
        log("[6] 等待 10s 后重跑（第 %d 轮）..." % (round_no + 1))
        time.sleep(10)

    log("[7] 部署完成（%d 个文件；含 server 三件套；服务已重启并通过探针）" % len(entries))


if __name__ == "__main__":
    main()
