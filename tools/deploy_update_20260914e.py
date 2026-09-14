# -*- coding: utf-8 -*-
"""20260914e 部署：R48 第 1 批（A6 企业定向库独立页 + A7/B2 PPT V2 基建预埋）。

本批内容（**纯前端**，前端线已改完并通过自查，本脚本**不修改任何业务代码**）：
  - 新建 assets/ 7 个：
      xt-content.js（共用契约基建：XTC.registerView / renderIcons）、
      company-lib.js（A6 企业定向库渲染器）、
      data-exam-company.js（A6 企业定向库富结构数据，后置覆盖 EXAM['exam-company']）、
      data-ppt-templates.js（A7 实战模板库富结构数据）、
      tpl-preview.js（A7 渲染器，注册 window.PPTV2['ppt-templates']）、
      data-ppt-class.js（B2 设计课堂富结构数据）、
      design-class.js（B2 渲染器，注册 window.PPTV2['ppt-design']）。
  - 新建根页面 企业定向库.html（A6 独立页，自引 company-lib.js / data-exam-company.js）。
  - 改动 PPT训练.html：预埋 PPTV2 注册表 + 代理分发（一次性冻结）+ 引入 5 个新 js（带版本戳）
    + 3 处入口文案；改动 央国企笔试.html：L104 入口改跳新页 企业定向库.html。
  - 版本戳：本批统一 **20260914e**（仅 PPT训练.html 与 企业定向库.html 内新资源引用带该戳）。

与本批后端线的关系：
  - **server/ 一行未动** → 不打包 server/*.py、不改 .env、**不重启服务**。

安全机制（沿用 c/d 版骨架）：
  - ROOT 铁律（必须是 D:\\下载的文件\\学习工作台，worktree 直接拒绝）；
  - blog_wechat.html 继续排除；settings_/profile_/_preview_/_t 前缀排除；
  - 硬断言：assets/icon-map.js、assets/subpage-router.js、data/mock-papers.js 必在；
  - **硬闸门：包内绝不允许出现任何 server/ 文件**（本批不动后端）；
  - 本批静态断言：新资源版本戳齐备、**旧版本号残留为 0**、仅两页带 20260914e；
  - 逐文件 MD5 **全量**比对；
  - DB 备份先于解压；dry-run 永不联网。

用法：
  $env:SW_DRY_RUN=1;  python tools/deploy_update_20260914e.py   # 本地清单+打包，不联网
  python tools/deploy_update_20260914e.py                       # 正式部署（上传+解压+校验+探针）
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
STAMP = "20260914e"
NEW_VER = "20260914e"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
REMOTE_WEB = REMOTE_ROOT + "/web"
SERVICE_NAME = "study-workbench"
MANIFEST_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_0914e_manifest.txt")
LOG_PATH = os.path.join(ROOT, "tools", "qa", "_r48_e_deploy_out.txt")

EXCLUDE_HTML = {"settings.html", "设置_旧版.html", "profile.html",
                "profile_v2.html", "profile_v3.html",
                "blog_wechat.html"}          # blog_wechat.html 继续不上线
EXCLUDE_PREFIXES = ("settings_", "profile_", "_preview_", "_t")
ASSET_EXTS = {".js", ".css"}
MOCK_REL = "data/mock-papers.js"
ASSETS_MUST = ("icon-map.js", "subpage-router.js")
DATA_MUST = ("mock-papers.js",)
EXCLUDE_DATA_JSON = {"vocab-ext-fields-patch.json"}

# ---- 本批新建资源（7 个，全部随包上线）----
NEW_ASSETS = ("xt-content.js", "company-lib.js", "data-exam-company.js",
              "data-ppt-templates.js", "tpl-preview.js", "data-ppt-class.js",
              "design-class.js")
# PPT训练.html 引用的 5 个（顺序铁律：xt-content 必须最先）
PPT_ASSETS = ("xt-content.js", "data-ppt-templates.js", "tpl-preview.js",
              "data-ppt-class.js", "design-class.js")
# 企业定向库.html 自引的 2 个
COMPANY_ASSETS = ("company-lib.js", "data-exam-company.js")

PPT_PAGE = "PPT训练.html"
COMPANY_PAGE = "企业定向库.html"
YANG_PAGE = "央国企笔试.html"
PAGES_WITH_NEW_VER = sorted([PPT_PAGE, COMPANY_PAGE])

# 本批 7 个资源的版本号引用一律 20260914e；任何旧版本号残留都必须为 0
NEW_RES_RE = re.compile(
    r"assets/(xt-content\.js|company-lib\.js|data-exam-company\.js|data-ppt-templates\.js|"
    r"tpl-preview\.js|data-ppt-class\.js|design-class\.js)\?v=([0-9A-Za-z]+)")

# 各新资源的特征串（证代码已落地）
FEATURES = {
    "xt-content.js": "registerView",
    "company-lib.js": "window.CompanyLib",
    "data-exam-company.js": "exam-company",
    "data-ppt-templates.js": "ppt-templates",
    "tpl-preview.js": "TplPreview",
    "data-ppt-class.js": "ppt-design",
    "design-class.js": "DesignClass",
}

USERS_BASELINE = 6          # 本批部署后生产库真实用户数（不得减少）
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
            raise SystemExit("请设置 SW_HOST / SW_PASS 或检查凭据文件 " + CRED)
        pwd, host = m.group(1), m.group(2)
    return host, pwd


def plink(remote, host, pwd, timeout=420):
    return run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                "root@" + host, remote], timeout)


def read_text(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def res_ver_counts(text):
    """返回 {资源名: {版本号: 出现次数}}。"""
    out = {}
    for name, ver in NEW_RES_RE.findall(text):
        out.setdefault(name, {})
        out[name][ver] = out[name].get(ver, 0) + 1
    return out


def stale_refs(text):
    """返回新资源引用中「版本不是 20260914e」的条数（应为 0）。"""
    return sum(c for name, ver in NEW_RES_RE.findall(text) if ver != NEW_VER
               for c in [1])


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
    # 本批 7 个新建资源必须全部在库
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

    # ---- 本批静态断言 1：三个本批页面都必须在清单 ----
    for page in (PPT_PAGE, COMPANY_PAGE, YANG_PAGE):
        if page not in pages:
            raise SystemExit("%s 未进清单（本批必上页）" % page)

    ppt_src = read_text(os.path.join(ROOT, PPT_PAGE))
    company_src = read_text(os.path.join(ROOT, COMPANY_PAGE))
    yang_src = read_text(os.path.join(ROOT, YANG_PAGE))

    # ---- 本批静态断言 2：PPT训练.html 5 个新资源均带 ?v=20260914e ----
    ppt_ver = res_ver_counts(ppt_src)
    for a in PPT_ASSETS:
        n = ppt_ver.get(a, {}).get(NEW_VER, 0)
        if n < 1:
            raise SystemExit("%s 未找到 assets/%s?v=%s（版本串缺失，浏览器会命中旧缓存）"
                             % (PPT_PAGE, a, NEW_VER))
    # ---- 本批静态断言 3：企业定向库.html 2 个新资源均带 ?v=20260914e ----
    company_ver = res_ver_counts(company_src)
    for a in COMPANY_ASSETS:
        n = company_ver.get(a, {}).get(NEW_VER, 0)
        if n < 1:
            raise SystemExit("%s 未找到 assets/%s?v=%s（版本串缺失）"
                             % (COMPANY_PAGE, a, NEW_VER))
    # ---- 本批静态断言 4：旧版本号残留必须为 0（两页合计）----
    ppt_stale = stale_refs(ppt_src)
    company_stale = stale_refs(company_src)
    if ppt_stale or company_stale:
        raise SystemExit("新资源仍残留旧版本号引用：%s=%d、%s=%d（应为 0）"
                         % (PPT_PAGE, ppt_stale, COMPANY_PAGE, company_stale))
    # ---- 本批静态断言 5：PPT训练.html 预埋 PPTV2 注册表 + 入口文案 ----
    if "PPTV2" not in ppt_src:
        raise SystemExit("%s 缺少 PPTV2 注册表预埋（禁止部署）" % PPT_PAGE)
    # ---- 本批静态断言 6：央国企笔试.html 入口改跳新页 ----
    if "企业定向库.html" not in yang_src:
        raise SystemExit("%s 入口未改跳 企业定向库.html（禁止部署）" % YANG_PAGE)
    # ---- 本批静态断言 7：只有本批两页带 20260914e，其余页面不得被误 bump ----
    pages_with_new_ver = [p for p in pages
                          if NEW_VER in read_text(os.path.join(ROOT, p))]
    if sorted(pages_with_new_ver) != PAGES_WITH_NEW_VER:
        raise SystemExit("带 %s 的页面应为 %s，实际为 %s（误 bump 其它页面，禁止部署）"
                         % (NEW_VER, PAGES_WITH_NEW_VER, sorted(pages_with_new_ver)))
    # ---- 本批静态断言 8：7 个新资源特征串在本地确实存在 ----
    for a, feat in FEATURES.items():
        if feat not in read_text(os.path.join(ROOT, "assets", a)):
            raise SystemExit("assets/%s 缺少特征串 %s（改动未落地，禁止部署）" % (a, feat))

    return {
        "pages": pages, "assets": assets, "datajson": datajson,
        "excluded_json": excluded_json, "emoji": emoji, "data_files": data_files,
        "assets_dir": assets_dir, "data_dir": data_dir, "emoji_dir": emoji_dir,
        "root_data_dir": root_data_dir,
        "ppt_ver": ppt_ver, "company_ver": company_ver,
        "pages_with_new_ver": sorted(pages_with_new_ver),
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
    lines.append("本批范围   : 纯前端；server/ 0 个文件；不改 .env；不重启服务")
    lines.append("")
    lines.append("--- 计数 ---")
    lines.append("HTML 页面            : %d（已排除 blog_wechat.html）" % len(L["pages"]))
    lines.append("assets JS/CSS        : %d" % len(L["assets"]))
    lines.append("assets/data JSON     : %d" % len(L["datajson"]))
    lines.append("assets/emoji         : %d" % len(L["emoji"]))
    lines.append("根 data/ 文件         : %d" % len(L["data_files"]))
    lines.append("server 文件           : 0（本批不动后端）")
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
    lines.append("--- 本批新建资源自检（7 个）---")
    for a in NEW_ASSETS:
        lines.append("  assets/%s : %s" % (a, "在" if a in L["assets"] else "**缺失**"))
    lines.append("")
    lines.append("--- 本批版本戳自检 ---")
    for a in PPT_ASSETS:
        lines.append("  %s 含 assets/%s?v=%s : %d 处"
                     % (PPT_PAGE, a, NEW_VER, L["ppt_ver"].get(a, {}).get(NEW_VER, 0)))
    for a in COMPANY_ASSETS:
        lines.append("  %s 含 assets/%s?v=%s : %d 处"
                     % (COMPANY_PAGE, a, NEW_VER, L["company_ver"].get(a, {}).get(NEW_VER, 0)))
    lines.append("  旧版本号残留 : 0 处（已断言）")
    lines.append("  带 %s 的页面 : %s（应恰为 %s）"
                 % (NEW_VER, L["pages_with_new_ver"], PAGES_WITH_NEW_VER))
    lines.append("  %s 含 PPTV2 注册表 : 在" % PPT_PAGE)
    lines.append("  %s 入口跳 企业定向库.html : 在" % YANG_PAGE)
    lines.append("")
    lines.append("--- 安全闸门 ---")
    lines.append("  包内 server/ 文件数 : 0（硬闸门，本批不动后端）")
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
import re
import sqlite3
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1"
VER = "20260914e"
COMPANY = "\u4f01\u4e1a\u5b9a\u5411\u5e93"      # 企业定向库
COMPANY_PAGE = "\u4f01\u4e1a\u5b9a\u5411\u5e93.html"
PPT_PAGE = "PPT\u8bad\u7ec3.html"                # PPT训练.html

NEW_JS = [
    ("xt-content", "/assets/xt-content.js"),
    ("company-lib", "/assets/company-lib.js"),
    ("data-exam-company", "/assets/data-exam-company.js"),
    ("data-ppt-templates", "/assets/data-ppt-templates.js"),
    ("tpl-preview", "/assets/tpl-preview.js"),
    ("data-ppt-class", "/assets/data-ppt-class.js"),
    ("design-class", "/assets/design-class.js"),
]
NEW_REL = r"(?:xt-content|company-lib|data-exam-company|data-ppt-templates|" \
          r"tpl-preview|data-ppt-class|design-class)"


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, "EXC:%s" % e


def cnt(text, pat):
    return len(re.findall(pat, text))


# 1) 7 个新资源：走“带新版本号的 URL”取，证明浏览器会拿到新代码（缓存穿透）
ok = 0
for name, rel in NEW_JS:
    code, body = get("%s?v=%s" % (rel, VER))
    print("A_%s_HTTP:%s" % (name.replace("-", "_"), code))
    print("A_%s_BYTES:%s" % (name.replace("-", "_"), len(body)))
    if code == 200:
        ok += 1
print("ASSETS_TOTAL:%d" % len(NEW_JS))
print("ASSETS_200:%d" % ok)

# 2) 企业定向库.html：200 且内容含「企业定向库」
code, comp = get("/" + urllib.parse.quote(COMPANY_PAGE))
print("COMPANY_HTTP:" + str(code))
print("COMPANY_HITS:" + str(cnt(comp, COMPANY)))
print("COMPANY_XT_BYTES:" + str(len(comp)))

# 3) PPT训练.html：200 且含 PPTV2 与 20260914e
code, ppt = get("/" + urllib.parse.quote(PPT_PAGE))
print("PPT_HTTP:" + str(code))
print("PPT_PPTV2:" + str(cnt(ppt, "PPTV2")))
print("PPT_VER_E:" + str(cnt(ppt, VER)))

# 4) 旧版本号残留必须为 0：新资源引用版本 != 20260914e
print("PPT_OLD:" + str(cnt(ppt, r"assets/" + NEW_REL + r"\.js\?v=(?!" + VER + r")[0-9A-Za-z]+")))
print("COMPANY_OLD:" + str(cnt(comp, r"assets/" + NEW_REL + r"\.js\?v=(?!" + VER + r")[0-9A-Za-z]+")))

# 5) 后端仍健康（本批不重启，确认未被打挂）
code, _ = get("/api/health")
print("API_HEALTH:" + str(code))

# 6) 生产库用户数不得减少
try:
    con = sqlite3.connect("/opt/study-workbench/server/data.db", timeout=10)
    print("DB_USERS:" + str(con.execute("select count(*) from users").fetchone()[0]))
    con.close()
except Exception as e:
    print("DB_USERS:-1")
    print("DB_ERR:" + str(e)[:160])
print("PROBE_DONE:1")
'''


def build_probe_command(host, pwd):
    b64 = base64.b64encode(PROBE_PY.encode("utf-8")).decode("ascii")
    company_url = "http://127.0.0.1/%E4%BC%81%E4%B8%9A%E5%AE%9A%E5%90%91%E5%BA%93.html"
    ppt_url = "http://127.0.0.1/PPT%E8%AE%AD%E7%BB%83.html"
    remote = (
        "echo SERVICE:$(systemctl is-active " + SERVICE_NAME + ")\n"
        "echo NRESTARTS:$(systemctl show -p NRestarts --value " + SERVICE_NAME + ")\n"
        "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
        "echo APIHEALTH:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1:8000/api/health)\n"
        "echo COMPANYPAGE:$(curl -s -o /dev/null -w '%{http_code}' '" + company_url + "')\n"
        "echo PPTPAGE:$(curl -s -o /dev/null -w '%{http_code}' '" + ppt_url + "')\n"
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
        info.append("SERVICE=active（本批未重启，沿用上批进程）")
    nr = num_of("NRESTARTS", out)
    if nr is None:
        info.append("NRESTARTS 无输出（按 INFO）")
    elif nr > NRESTARTS_MAX:
        fatal.append("NRESTARTS=%s > %s（疑似崩溃循环）" % (nr, NRESTARTS_MAX))
    else:
        info.append("NRESTARTS=%s" % nr)

    for tag, label in (("SITE", "站点根"), ("APIHEALTH", "/api/health"),
                       ("COMPANYPAGE", "企业定向库.html"),
                       ("PPTPAGE", "PPT训练.html")):
        if probe(tag, out) != "200":
            fatal.append("%s HTTP=%s（期望 200）" % (label, probe(tag, out) or "NONE"))
        else:
            info.append("%s HTTP=200" % label)

    # 7 个新资源全部 200
    total = num_of("ASSETS_TOTAL", out)
    ok = num_of("ASSETS_200", out)
    if total != len(NEW_JS_TOTAL) or ok != len(NEW_JS_TOTAL):
        fatal.append("新资源 200 计数 %s/%s（期望 %d/%d，见 A_*_HTTP 明细）"
                     % (ok, total, len(NEW_JS_TOTAL), len(NEW_JS_TOTAL)))
    else:
        info.append("7 个新资源全部 HTTP=200")

    # 企业定向库.html 内容
    ch = num_of("COMPANY_HITS", out)
    if ch is None or ch < 1:
        fatal.append("线上 企业定向库.html 未命中内容串「企业定向库」（命中=%s）" % ch)
    else:
        info.append("线上 企业定向库.html 含「企业定向库」×%s（%s 字节）"
                    % (ch, probe("COMPANY_XT_BYTES", out)))

    # PPT训练.html 内容
    pv2 = num_of("PPT_PPTV2", out)
    if pv2 is None or pv2 < 1:
        fatal.append("线上 PPT训练.html 未命中 PPTV2（命中=%s，注册表未上线）" % pv2)
    else:
        info.append("线上 PPT训练.html 含 PPTV2 ×%s" % pv2)
    pve = num_of("PPT_VER_E", out)
    if pve is None or pve < 1:
        fatal.append("线上 PPT训练.html 未命中版本戳 %s（命中=%s）" % (NEW_VER, pve))
    else:
        info.append("线上 PPT训练.html 含版本戳 %s ×%s" % (NEW_VER, pve))

    # 旧版本号残留必须为 0
    for tag, label in (("PPT_OLD", "PPT训练.html"), ("COMPANY_OLD", "企业定向库.html")):
        v = num_of(tag, out)
        if v is None:
            fatal.append("%s 旧版本号计数无输出" % label)
        elif v != 0:
            fatal.append("线上 %s 仍残留 %s 处新资源引用旧版本号（期望 0）" % (label, v))
        else:
            info.append("线上 %s 旧版本号残留 0 处" % label)

    # 后端健康
    if probe("API_HEALTH", out) != "200":
        fatal.append("探针内 /api/health HTTP=%s（期望 200）" % (probe("API_HEALTH", out) or "NONE"))
    else:
        info.append("探针内 /api/health=200")

    # 数据不减少
    us = num_of("DB_USERS", out)
    if us is None:
        fatal.append("DB_USERS 无输出（数据库不可读？）")
    elif us < USERS_BASELINE:
        fatal.append("DB_USERS=%s < %s（用户数减少，禁止视为部署成功）" % (us, USERS_BASELINE))
    elif us == USERS_BASELINE:
        info.append("DB_USERS=%s（= 基线 %s，未减少）" % (us, USERS_BASELINE))
    else:
        info.append("DB_USERS=%s（> 基线 %s，请人工核对是否有多余账号）" % (us, USERS_BASELINE))
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

    # 硬闸门：包内绝不允许出现任何 server/ 文件（本批不动后端）
    serverish = [arc for arc, _ in entries if arc == "server" or arc.startswith("server/")]
    if serverish:
        raise SystemExit("包内出现 server/ 文件（本批纯前端，禁止打包后端）：%s" % serverish)

    print("[0] ROOT=%s" % ROOT)
    print("[0] 页面 %d（已排除 blog_wechat.html）+ assets %d + data.json %d + emoji %d "
          "+ 根data %d = %d 个文件；server 0 个"
          % (len(L["pages"]), len(L["assets"]), len(L["datajson"]), len(L["emoji"]),
             len(L["data_files"]), len(entries)))
    print("[0] 版本戳：%s 5 处 + %s 2 处 -> ?v=%s；带新戳的页面=%s"
          % (PPT_PAGE, COMPANY_PAGE, NEW_VER, L["pages_with_new_ver"]))
    print("[0] 旧版本号残留=0（已断言）；7 个新资源齐备=%s"
          % all(a in L["assets"] for a in NEW_ASSETS))

    manifest = build_manifest(L)
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
        print("[DRY-RUN] 清单条数=%d；server/ 文件数=0；%s / %s 版本戳 20260914e 已就位"
              % (len(entries), PPT_PAGE, COMPANY_PAGE))
        print("[DRY-RUN] ROOT 铁律通过；blog_wechat.html 已排除；硬断言 assets/%s + data/%s 齐备"
              % ("、".join(ASSETS_MUST), "、".join(DATA_MUST)))
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

    # ---------- 4. DB 备份 → 解压 → 全量 MD5 ----------
    remote = (
        "cd %s || exit 1\n" % REMOTE_ROOT +
        "mkdir -p backups\n" +
        "cp -a server/data.db backups/data.db.before-%s 2>/dev/null && echo DB-BACKUP-OK "
        "|| echo DB-BACKUP-SKIP\n" % STAMP +
        "ls -l backups/data.db.before-%s 2>/dev/null | awk '{print \"DB-BACKUP-SIZE:\"$5}'\n" % STAMP +
        "tar xzf deploy_%s.tar.gz -C %s/ || exit 1\n" % (STAMP, REMOTE_ROOT) +
        "echo '---MD5-BEGIN---'\n" +
        "cd %s/web && find . -maxdepth 3 -type f \\( -name '*.html' -o -name '*.js' "
        "-o -name '*.css' -o -name '*.json' \\) -print0 | xargs -0 md5sum\n" % REMOTE_ROOT +
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

    block = out.split("---MD5-BEGIN---")[1].split("---MD5-END---")[0]
    remote_map = {}
    for line in block.strip().splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            remote_map[parts[1].strip().lstrip("./")] = parts[0]
    bad = []
    for arc in [a for a, _ in entries]:
        key = arc[len("web/"):] if arc.startswith("web/") else arc
        local = md5(os.path.join(ROOT, key.replace("/", os.sep)))
        rm = remote_map.get(key)
        if rm != local:
            bad.append((arc, local[:10], (rm or "MISSING")[:10]))
    log("[4] 全量 MD5 校验: %d/%d 一致（远端回读 %d 条）"
        % (len(entries) - len(bad), len(entries), len(remote_map)))
    for arc, lo, ro in bad[:20]:
        log("     BAD %s local=%s remote=%s" % (arc, lo, ro))
    if bad:
        raise SystemExit("存在 %d 个文件 MD5 不一致，中止" % len(bad))

    # ---------- 5. 探针（本批不重启服务）----------
    log("[5] 纯前端批次：不改 .env、不重启服务，直接跑探针。")
    round_no = 0
    while True:
        round_no += 1
        rc2, out2, err2 = build_probe_command(host, pwd)
        log("=" * 60)
        log("探针第 %d 轮原始输出：" % round_no)
        log(out2.strip())
        log("=" * 60)
        if rc2 != 0:
            log("[5][WARN] 探针 rc=%s stderr=%r" % (rc2, err2[-300:]))
        fatal, info = judge_probes(out2)
        log("[5] 第 %d 轮 INFO：" % round_no)
        for m in info:
            log("     INFO " + m)
        if not fatal:
            log("[5] 全部探针通过（第 %d 轮）" % round_no)
            break
        log("[5] 第 %d 轮 FATAL：" % round_no)
        for m in fatal:
            log("     FATAL " + m)
        if round_no >= 3:
            raise SystemExit("探针连续 3 轮未通过，停止重试；证据见 " + LOG_PATH)
        log("[5] 等待 10s 后重跑（第 %d 轮）..." % (round_no + 1))
        time.sleep(10)

    log("[6] 部署完成（纯前端 %d 个文件；server/.env 未动、服务未重启）" % len(entries))


# 供 judge_probes 使用（与 PROBE_PY 中 NEW_JS 数量保持一致）
NEW_JS_TOTAL = ("xt-content", "company-lib", "data-exam-company", "data-ppt-templates",
                "tpl-preview", "data-ppt-class", "design-class")


if __name__ == "__main__":
    main()
