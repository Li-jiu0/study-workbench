# -*- coding: utf-8 -*-
"""20260914d 部署：R44 前端修复批次（chat-local.js Bug C + admin-contact.js A/B 加固）。

本批内容（前端线已改完并通过自查，本脚本**不修改任何业务代码**）：
  - assets/chat-local.js：loadChats() 重建前后用 prevServerChats 快照并按 Number(serverId)
    去重合并，修复「管理员端/非好友会话回复后从列表消失」（Bug C）。
  - assets/admin-contact.js：fetchAdminId() 按 404 / 401-403 / 5xx 分流给不同文案；
    S.adminId 失败不清零；角标轮询 5s → 15s → 60s 退避自调度。
  - 只有 私聊.html 引用这两个 js，故**只 bump 这一页**的两个版本号 20260914b → 20260914d。

与 20260914c（后端批次）的关系：
  - **纯前端**：不打包 server/*.py、不改 .env、不重启服务（server 上一批已拉齐）。
  - 沿用 c 版骨架（ROOT 铁律、全量 MD5、DB 备份、增量落盘、凭据惰性读取、
    ASCII 包名中转）与 b 版的前端清单收集逻辑。

安全机制：
  - ROOT 铁律（必须是 D:\下载的文件\学习工作台，worktree 直接拒绝）；
  - blog_wechat.html 继续排除；settings_/profile_/_preview_/_t 前缀排除；
  - 硬断言：assets/icon-map.js、assets/subpage-router.js、data/mock-papers.js 必在；
  - **硬闸门：包内绝不允许出现任何 server/ 文件**（本批不动后端）；
  - 逐文件 MD5 **全量**比对；
  - DB 备份先于解压；dry-run 永不联网。

用法：
  $env:SW_DRY_RUN=1;  python tools/deploy_update_20260914d.py   # 本地清单+打包，不联网
  python tools/deploy_update_20260914d.py                       # 正式部署（上传+解压+校验+探针）
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
STAMP = "20260914d"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
REMOTE_WEB = REMOTE_ROOT + "/web"
SERVICE_NAME = "study-workbench"
MANIFEST_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_0914d_manifest.txt")
LOG_PATH = os.path.join(ROOT, "tools", "qa", "_r44d_deploy_out.txt")

EXCLUDE_HTML = {"settings.html", "设置_旧版.html", "profile.html",
                "profile_v2.html", "profile_v3.html",
                "blog_wechat.html"}          # blog_wechat.html 继续不上线
EXCLUDE_PREFIXES = ("settings_", "profile_", "_preview_", "_t")
ASSET_EXTS = {".js", ".css"}
MOCK_REL = "data/mock-papers.js"
ASSETS_MUST = ("icon-map.js", "subpage-router.js")
DATA_MUST = ("mock-papers.js",)
EXCLUDE_DATA_JSON = {"vocab-ext-fields-patch.json"}

# 本批唯一被 bump 的页面及其两处版本串
BUMP_PAGE = "私聊.html"
OLD_VER = "20260914b"
NEW_VER = "20260914d"
BUMP_ASSETS = ("assets/chat-local.js", "assets/admin-contact.js")

# 远端特征串探针（证明新代码已上线且版本号已穿透缓存）
FEAT_CHAT_LOCAL = "prevServerChats"          # Bug C：动态会话快照变量
FEAT_ADMIN_CONTACT = "该功能暂未开放"         # A：404 分流文案

USERS_BASELINE = 9          # 20260914c 部署后用户数（含管理员行），**不得减少**
NRESTARTS_MAX = 2


# ---------------- 工具函数 ----------------
def assert_root_law():
    norm = os.path.normcase(os.path.abspath(ROOT)).replace("\\", "/")
    if "worktrees/" in norm.lower() + "/" or "/worktrees/" in norm.lower():
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
    if not os.path.isfile(os.path.join(ROOT, MOCK_REL.replace("/", os.sep))):
        raise SystemExit("缺少 " + MOCK_REL)

    # ---- 本批静态断言 1：包内绝不允许出现 server/ 文件 ----
    # ---- 本批静态断言 2：私聊.html 两处版本串已 bump 到 20260914d ----
    if BUMP_PAGE not in pages:
        raise SystemExit("%s 未进清单（本批唯一 bump 页必须上线）" % BUMP_PAGE)
    bump_src = read_text(os.path.join(ROOT, BUMP_PAGE))
    bump_hits = {}
    for rel in BUMP_ASSETS:
        bump_hits[rel] = bump_src.count("%s?v=%s" % (rel, NEW_VER))
        if bump_hits[rel] < 1:
            raise SystemExit("%s 未找到 %s?v=%s（版本串未 bump，浏览器会命中旧缓存）"
                             % (BUMP_PAGE, rel, NEW_VER))
    stale = sum(bump_src.count("%s?v=%s" % (rel, OLD_VER)) for rel in BUMP_ASSETS)
    if stale:
        raise SystemExit("%s 仍残留 %d 处 ?v=%s（旧版本串未清干净）" % (BUMP_PAGE, stale, OLD_VER))
    # ---- 本批静态断言 3：只有 私聊.html 带 20260914d，其余页面不得被误 bump ----
    pages_with_new_ver = [p for p in pages
                          if NEW_VER in read_text(os.path.join(ROOT, p))]
    if pages_with_new_ver != [BUMP_PAGE]:
        raise SystemExit("带 %s 的页面应为 [%s]，实际为 %s（误 bump 其它页面，禁止部署）"
                         % (NEW_VER, BUMP_PAGE, pages_with_new_ver))
    # ---- 本批静态断言 4：两个 js 的特征串在本地确实存在 ----
    for rel, feat in ((BUMP_ASSETS[0], FEAT_CHAT_LOCAL), (BUMP_ASSETS[1], FEAT_ADMIN_CONTACT)):
        if feat not in read_text(os.path.join(ROOT, rel.replace("/", os.sep))):
            raise SystemExit("%s 缺少特征串 %s（改动未落地，禁止部署）" % (rel, feat))
    return {
        "pages": pages, "assets": assets, "datajson": datajson,
        "excluded_json": excluded_json, "emoji": emoji, "data_files": data_files,
        "assets_dir": assets_dir, "data_dir": data_dir, "emoji_dir": emoji_dir,
        "root_data_dir": root_data_dir, "bump_hits": bump_hits,
        "pages_with_new_ver": pages_with_new_ver,
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
    lines.append("--- 本批版本戳自检 ---")
    for rel in BUMP_ASSETS:
        lines.append("  %s 含 %s?v=%s : %d 处" % (BUMP_PAGE, rel, NEW_VER, L["bump_hits"][rel]))
    lines.append("  %s 残留 ?v=%s : 0 处（已断言）" % (BUMP_PAGE, OLD_VER))
    lines.append("  带 %s 的页面 : %s（应仅为 %s）" % (NEW_VER, L["pages_with_new_ver"], BUMP_PAGE))
    lines.append("  特征串 %s : 在（assets/chat-local.js）" % FEAT_CHAT_LOCAL)
    lines.append("  特征串 %s : 在（assets/admin-contact.js）" % FEAT_ADMIN_CONTACT)
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
VER = "20260914d"
PRIV = "\u79c1\u804a.html"          # 私聊.html
FEAT_CHAT = "prevServerChats"
FEAT_AC = "\u8be5\u529f\u80fd\u6682\u672a\u5f00\u653e"   # 该功能暂未开放


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, "EXC:%s" % e


def cnt(text, pat):
    return len(re.findall(pat, text))


# 1) 两个 js 走“带新版本号的 URL”取，证明浏览器会拿到新代码（缓存穿透）
for name, rel in (("CHAT_LOCAL", "/assets/chat-local.js"),
                  ("ADMIN_CONTACT", "/assets/admin-contact.js")):
    code, body = get("%s?v=%s" % (rel, VER))
    print("%s_HTTP:%s" % (name, code))
    print("%s_BYTES:%s" % (name, len(body)))

code, body = get("/assets/chat-local.js?v=" + VER)
print("FEAT_CHAT_HITS:" + str(cnt(body, FEAT_CHAT)))
code, body = get("/assets/admin-contact.js?v=" + VER)
print("FEAT_AC_HITS:" + str(cnt(body, FEAT_AC)))

# 2) 私聊.html：两处引用必须带新版本串，旧串必须为 0
code, html = get("/" + urllib.parse.quote(PRIV))
print("PRIV_HTTP:" + str(code))
print("PRIV_VER_D_CHAT:" + str(cnt(html, r"assets/chat-local\.js\?v=" + VER)))
print("PRIV_VER_D_AC:" + str(cnt(html, r"assets/admin-contact\.js\?v=" + VER)))
print("PRIV_VER_B_STALE:" + str(cnt(html, r"assets/(?:chat-local|admin-contact)\.js\?v=20260914b")))

# 3) 后端仍健康（本批不重启，确认未被打挂）
for name, path in (("HEALTH", "/api/health"),
                   ("ADMIN_NOAUTH", "/api/admin/contact")):
    code, _ = get(path)
    print("%s:%s" % (name, code))

# 4) 生产库用户数不得减少
try:
    con = sqlite3.connect("/opt/study-workbench/server/data.db", timeout=10)
    print("DB_USERS:" + str(con.execute("select count(*) from users").fetchone()[0]))
    print("DB_ADMIN_COUNT:" + str(con.execute(
        "select count(*) from users where is_admin=1").fetchone()[0]))
    con.close()
except Exception as e:
    print("DB_USERS:-1")
    print("DB_ERR:" + str(e)[:160])
print("PROBE_DONE:1")
'''


def build_probe_command(host, pwd):
    b64 = base64.b64encode(PROBE_PY.encode("utf-8")).decode("ascii")
    home_url = "http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html"
    remote = (
        "echo SERVICE:$(systemctl is-active " + SERVICE_NAME + ")\n"
        "echo NRESTARTS:$(systemctl show -p NRestarts --value " + SERVICE_NAME + ")\n"
        "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
        "echo HOMEPAGE:$(curl -s -o /dev/null -w '%{http_code}' '" + home_url + "')\n"
        "echo ICONMAP:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1/assets/icon-map.js)\n"
        "echo MOCKPAPERS:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1/data/mock-papers.js)\n"
        "echo ---PROBES---\n"
        "echo " + b64 + " | base64 -d | python3 -\n"
        "echo TRACEBACK_10MIN:$(journalctl -u " + SERVICE_NAME + " --since '10 min ago' "
        "2>/dev/null | grep -ci 'traceback\\|exception' || true)\n"
    )
    return plink(remote, host, pwd, timeout=300)


def probe(tag, text):
    m = re.search(r"^" + re.escape(tag) + r":(.*)$", text, re.M)
    return m.group(1).strip() if m else ""


def num_of(tag, out):
    v = probe(tag, out)
    return int(v) if v.lstrip("-").isdigit() else None


def judge_probes(out):
    fatal, info = [], []

    svc = probe("SERVICE", out)
    if svc != "active":
        fatal.append("%s 服务非 active（=%s）" % (SERVICE_NAME, svc or "NONE"))
    else:
        info.append("SERVICE=active（本批未重启，沿用 20260914c 的进程）")
    nr = num_of("NRESTARTS", out)
    if nr is None:
        info.append("NRESTARTS 无输出（按 INFO）")
    elif nr > NRESTARTS_MAX:
        fatal.append("NRESTARTS=%s > %s（疑似崩溃循环）" % (nr, NRESTARTS_MAX))
    else:
        info.append("NRESTARTS=%s" % nr)

    for tag, label in (("SITE", "站点根"), ("HOMEPAGE", "首页"),
                       ("ICONMAP", "assets/icon-map.js"),
                       ("MOCKPAPERS", "data/mock-papers.js")):
        if probe(tag, out) != "200":
            fatal.append("%s HTTP=%s（期望 200）" % (label, probe(tag, out) or "NONE"))
        else:
            info.append("%s HTTP=200" % label)

    # 特征串 1：chat-local.js 含 prevServerChats
    cl = probe("CHAT_LOCAL_HTTP", out)
    if cl != "200":
        fatal.append("assets/chat-local.js?v=%s HTTP=%s（期望 200）" % (NEW_VER, cl or "NONE"))
    hits = num_of("FEAT_CHAT_HITS", out)
    if hits is None or hits < 1:
        fatal.append("线上 chat-local.js 未命中特征串 %s（命中=%s，新代码未上线）"
                     % (FEAT_CHAT_LOCAL, hits))
    else:
        info.append("线上 chat-local.js 命中特征串 %s ×%s（%s 字节）"
                    % (FEAT_CHAT_LOCAL, hits, probe("CHAT_LOCAL_BYTES", out)))

    # 特征串 2：admin-contact.js 含「该功能暂未开放」
    ac = probe("ADMIN_CONTACT_HTTP", out)
    if ac != "200":
        fatal.append("assets/admin-contact.js?v=%s HTTP=%s（期望 200）" % (NEW_VER, ac or "NONE"))
    hits2 = num_of("FEAT_AC_HITS", out)
    if hits2 is None or hits2 < 1:
        fatal.append("线上 admin-contact.js 未命中特征串 %s（命中=%s，新代码未上线）"
                     % (FEAT_ADMIN_CONTACT, hits2))
    else:
        info.append("线上 admin-contact.js 命中特征串「%s」×%s（%s 字节）"
                    % (FEAT_ADMIN_CONTACT, hits2, probe("ADMIN_CONTACT_BYTES", out)))

    # 版本戳：私聊.html 两处引用带 20260914d，旧串 0
    pv = probe("PRIV_HTTP", out)
    if pv != "200":
        fatal.append("私聊.html HTTP=%s（期望 200）" % (pv or "NONE"))
    for tag, label in (("PRIV_VER_D_CHAT", "chat-local.js"),
                       ("PRIV_VER_D_AC", "admin-contact.js")):
        v = num_of(tag, out)
        if v is None or v < 1:
            fatal.append("线上私聊.html 未找到 %s?v=%s（计数=%s）" % (label, NEW_VER, v))
        else:
            info.append("线上私聊.html 引用 %s?v=%s ×%s" % (label, NEW_VER, v))
    stale = num_of("PRIV_VER_B_STALE", out)
    if stale != 0:
        fatal.append("线上私聊.html 仍残留 %s 处 ?v=%s（旧版本串未清）" % (stale, OLD_VER))
    else:
        info.append("线上私聊.html 旧版本串 ?v=%s 残留 0 处" % OLD_VER)

    # 后端健康
    if probe("HEALTH", out) != "200":
        fatal.append("/api/health HTTP=%s（期望 200）" % (probe("HEALTH", out) or "NONE"))
    else:
        info.append("/api/health=200")
    if probe("ADMIN_NOAUTH", out) != "401":
        fatal.append("/api/admin/contact（无 token）HTTP=%s（期望 401）"
                     % (probe("ADMIN_NOAUTH", out) or "NONE"))
    else:
        info.append("/api/admin/contact（无 token）=401（20260914c 的成果仍在）")

    # 数据不减少
    us = num_of("DB_USERS", out)
    if us is None:
        fatal.append("DB_USERS 无输出（数据库不可读？）")
    elif us < USERS_BASELINE:
        fatal.append("DB_USERS=%s < %s（用户数减少，禁止视为部署成功）" % (us, USERS_BASELINE))
    else:
        info.append("DB_USERS=%s（>= %s，未减少）" % (us, USERS_BASELINE))
    ad = num_of("DB_ADMIN_COUNT", out)
    if ad is None or ad < 1:
        fatal.append("DB_ADMIN_COUNT=%s（管理员行丢失）" % ad)
    else:
        info.append("DB_ADMIN_COUNT=%s" % ad)
    if probe("DB_ERR", out):
        fatal.append("数据库直查异常：%s" % probe("DB_ERR", out))

    tb = num_of("TRACEBACK_10MIN", out)
    if tb is None:
        info.append("TRACEBACK_10MIN 无输出（journalctl 不可用？按 INFO）")
    elif tb > 0:
        fatal.append("近 10 分钟日志含 traceback/exception %s 条（期望 0）" % tb)
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
    print("[0] 版本戳：%s 两处引用 -> ?v=%s（%s）；带新戳的页面=%s"
          % (BUMP_PAGE, NEW_VER, L["bump_hits"], L["pages_with_new_ver"]))

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
        print("[DRY-RUN] 清单条数=%d；server/ 文件数=0；%s 两处 ?v=%s 已就位"
              % (len(entries), BUMP_PAGE, NEW_VER))
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
        # 硬闸门回读：确认远端 server/ 未被本批改动（除新增备份外）
        "test -f %s/server/.env.bak-20260914d && echo ENV_BAK_0914d:KEPT || echo ENV_BAK_0914d:GONE\n" % REMOTE_ROOT +
        "rm -f %s/deploy_%s.tar.gz\n" % (REMOTE_ROOT, STAMP)
    )
    rc, out, err = plink(remote, host, pwd)
    if rc != 0 or "---MD5-BEGIN---" not in out:
        log("[4][DEBUG] stderr=%r" % err[-400:])
        raise SystemExit("远端解压/校验失败 rc=%s\n%s\n%s" % (rc, out[-800:], err[-400:]))
    if "DB-BACKUP-OK" not in out:
        raise SystemExit("DB 备份失败（未生成 backups/data.db.before-%s），中止部署" % STAMP)
    log("[4] DB 备份 %s 字节" % (probe("DB-BACKUP-SIZE", out) or "OK"))
    log("[4] 20260914d 的 .env 回滚点：%s" % probe("ENV_BAK_0914d", out))

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


if __name__ == "__main__":
    main()
