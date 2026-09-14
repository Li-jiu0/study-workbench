# -*- coding: utf-8 -*-
"""20260914c 部署（R44-C）：生产后端补上 /api/admin/* 路由 + 管理员超级账号。

背景（已取证，见 tools/qa/_r44c_preflight_out.txt）：
  生产 110.42.134.62 远端 /opt/study-workbench/server/routers/ **缺失 admin.py**，
  main.py 仍是 0913o 基线（无 admin 路由），users 表**无 is_admin 列**、**无「管理员」行**，
  因此 /api/admin/contact|overview|users|online|feedback 全部 404，管理员登录 400。

本批目标（只动 server/，前端一个字节都不碰）：
  1. 打包并上线 server/ 下全部 *.py（含 routers/admin.py，避免漏依赖）；
  2. 远端 server/.env **幂等**写入 ADMIN_PASSWORD（先 grep 判断：无则追加，
     有则只 sed 替换那一行；严禁覆盖整个 .env）；
  3. DB 备份（先于任何写操作）→ 解压 → py_compile 语法自检 → 重启 study-workbench；
  4. 管理员链路探针：无 token 401/403、管理员登录 200、带 token 访问 contact /
     overview / users / online / feedback 200、users 表有 is_admin 列且管理员行 is_admin=1。

环境变量读取机制（已取证）：
  systemd unit 里**没有 EnvironmentFile**，只有 Environment=PYTHONUNBUFFERED=1；
  config.py 用 python-dotenv 的 load_dotenv(BASE_DIR/".env")（override=False）。
  → 因此 ADMIN_PASSWORD 必须落到 /opt/study-workbench/server/.env，重启后生效。

与主模板 deploy_update_20260913k.py 的差异：
  - STAMP / 包名 / 清单名统一为 20260914c；
  - **不再打包任何前端**：本批纯 server（前端页面/资产一个都不进包，避免误伤
    其他批次正在进行中的前端改动）；前端探针降级为 INFO 级健康观察；
  - server 文件由「手写 2 个」改为「目录扫描全部 .py」（白名单目录 + 扩展名，
    并硬断言绝不夹带 data.db / .env / .venv / uploads）；
  - 新增：解压后 py_compile 语法自检（失败则在重启前中止，旧进程仍在内存里不受影响）；
  - 新增：本批管理员链路探针（PROBE_ADMIN_PY，全部走 urllib + \\uXXXX 转义中文，
    规避 plink 通道的中文编码问题；token 一律脱敏后输出）。

安全机制（沿用 k 版）：
  - ROOT 铁律校验（worktree 检测）；
  - 逐文件 MD5 **全量**比对（本批即 server 全部 .py）；
  - 凭据**惰性读取**（dry-run 永不触碰）；
  - **ASCII 包名中转**，规避 pscp 的中文名错乱；
  - DB 备份先于解压与重启；.env 只追加/单行替换，绝不整体覆盖。

用法：
  $env:SW_DRY_RUN=1;  python tools/deploy_update_20260914c.py   # 本地清单+打包，不联网
  python tools/deploy_update_20260914c.py                       # 正式部署（上传+重启+探针）
"""
import base64
import glob
import hashlib
import io
import os
import re
import subprocess
import sys
import tarfile
import time

# ---------------- 常量 ----------------
# ✅ 项目主副本（含 B/C/E1/J/R39-R43 全部成果）；绝不可回退到旧 worktree
ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
STAMP = "20260914c"
TAR_PATH = os.path.join(ROOT, "tools", "deploy_%s.tar.gz" % STAMP)
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
REMOTE_SERVER = REMOTE_ROOT + "/server"
SERVICE_NAME = "study-workbench"
MANIFEST_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_0914c_manifest.txt")
LOG_PATH = os.path.join(ROOT, "tools", "qa", "_r44c_deploy_out.txt")

# 本批核心：server 侧必需文件（硬断言，缺一即拒绝部署）
SERVER_MUST = ("server/routers/admin.py", "server/main.py",
               "server/database.py", "server/config.py")
SERVER_MAIN_MUST_INCLUDE = "admin.router"      # main.py 必须已挂载 admin 路由
SERVER_MAIN_MUST_ENSURE = "ensure_admin_user"  # main.py 必须调用管理员初始化
DB_MUST_MIGRATE = "is_admin"                   # database.py 必须有 is_admin 守卫式迁移

# ADMIN 环境变量（远端 server/.env；值可用 SW_ADMIN_PASSWORD 覆盖，不写死在报告里）
ADMIN_ENV_KEY = "ADMIN_PASSWORD"
ADMIN_ENV_VALUE = os.environ.get("SW_ADMIN_PASSWORD", "xingtu2026")
ADMIN_USERNAME_DEFAULT = "管理员"

# 严禁进包的远端敏感/大文件（白名单之外一律拒绝）
FORBIDDEN_BASENAMES = {"data.db", ".env", ".env.example"}
FORBIDDEN_PARTS = {".venv", "uploads", "__pycache__", "backups", "scripts"}

USERS_BASELINE = 6          # 部署前用户数基线（低于此值视为数据丢失）
NRESTARTS_MAX = 2           # 重启后允许的最大自动重启次数（超过=崩溃循环）

# 观察级（INFO）前端健康项：本批不动前端，仅确认站点未被打挂
FRONTEND_WATCH = (("SITE", "站点根"), ("ICONMAP", "assets/icon-map.js"),
                  ("SUBPAGEROUTER", "assets/subpage-router.js"),
                  ("MOCKPAPERS", "data/mock-papers.js"), ("HOMEPAGE", "首页"))


# ---------------- 工具函数 ----------------
def assert_root_law():
    """ROOT 铁律校验：绝不允许部署旧 worktree。"""
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


def read_text(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


# ---------------- server 清单收集 ----------------
def collect_server_files():
    """扫描 server/ 与 server/routers/ 下的全部 *.py（排除 .bak-* / 敏感文件）。

    返回形如 ['server/main.py', 'server/routers/admin.py', ...] 的有序列表。
    """
    rels = []
    for rel in sorted(glob.glob("server/*.py")) + sorted(glob.glob("server/routers/*.py")):
        rel = rel.replace("\\", "/")
        base = os.path.basename(rel)
        parts = set(rel.split("/"))
        if base in FORBIDDEN_BASENAMES or parts & FORBIDDEN_PARTS:
            continue
        if ".bak-" in base:                       # 本地历史备份，绝不上线
            continue
        if not os.path.isfile(os.path.join(ROOT, rel.replace("/", os.sep))):
            continue
        if not rel.endswith(".py"):               # 双保险：本批只放行 .py
            raise SystemExit("拒绝打包非 .py 文件：%s" % rel)
        rels.append(rel)
    rels = sorted(set(rels))
    # 硬断言：必需文件齐备
    missing = [r for r in SERVER_MUST if r not in rels]
    if missing:
        raise SystemExit("缺少 server 侧关键文件（本批无法上线，禁止部署）：%s"
                         % "、".join(missing))
    # 硬断言：绝不夹带数据库 / .env
    for rel in rels:
        base = os.path.basename(rel)
        if base in FORBIDDEN_BASENAMES or not base.endswith(".py"):
            raise SystemExit("清单夹带禁止文件 %s（会覆盖生产数据/配置，已中止）" % rel)
    return rels


def assert_server_source(server_files):
    """本地源码静态断言：admin 路由已挂载、管理员初始化已调用、迁移已就位。"""
    main_src = read_text(os.path.join(ROOT, "server", "main.py"))
    if SERVER_MAIN_MUST_INCLUDE not in main_src:
        raise SystemExit("server/main.py 未 include %s（admin 路由未挂载，禁止部署）"
                         % SERVER_MAIN_MUST_INCLUDE)
    if SERVER_MAIN_MUST_ENSURE not in main_src:
        raise SystemExit("server/main.py 未调用 %s（管理员账号不会被创建，禁止部署）"
                         % SERVER_MAIN_MUST_ENSURE)
    db_src = read_text(os.path.join(ROOT, "server", "database.py"))
    if "ALTER TABLE users ADD COLUMN %s" % DB_MUST_MIGRATE not in db_src:
        raise SystemExit("server/database.py 缺少 %s 守卫式迁移（生产库补列会失败）"
                         % DB_MUST_MIGRATE)
    cfg_src = read_text(os.path.join(ROOT, "server", "config.py"))
    if ADMIN_ENV_KEY not in cfg_src:
        raise SystemExit("server/config.py 未读取 %s（环境变量写了也不会生效）" % ADMIN_ENV_KEY)
    admin_src = read_text(os.path.join(ROOT, "server", "routers", "admin.py"))
    if '"/contact"' not in admin_src and "'/contact'" not in admin_src:
        raise SystemExit("server/routers/admin.py 未提供 /contact 路由（前端联系管理员会 404）")
    return {
        "main_has_admin_router": SERVER_MAIN_MUST_INCLUDE in main_src,
        "main_has_ensure": SERVER_MAIN_MUST_ENSURE in main_src,
        "db_has_migration": DB_MUST_MIGRATE in db_src,
        "config_reads_env": ADMIN_ENV_KEY in cfg_src,
        "server_files": server_files,
    }


def iter_entries(server_files):
    for rel in server_files:
        yield rel, os.path.join(ROOT, rel.replace("/", os.sep))


def build_manifest(server_files, asserts):
    entries = list(iter_entries(server_files))
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
    lines.append("SERVICE    : " + SERVICE_NAME)
    lines.append("本批范围   : 仅 server/ 下的 *.py（前端 0 个文件，一个字节都不动）")
    lines.append("")
    lines.append("--- 计数 ---")
    lines.append("server 顶层 *.py      : %d"
                 % len([r for r in server_files if r.count("/") == 1]))
    lines.append("server/routers *.py   : %d"
                 % len([r for r in server_files if r.count("/") == 2]))
    lines.append("合计                  : %d" % len(entries))
    lines.append("前端文件              : 0（本批纯后端）")
    lines.append("")
    lines.append("--- 字节 ---")
    lines.append("源文件总字节          : %d" % src_bytes)
    lines.append("内存打包(gz)字节      : %d" % packed)
    lines.append("")
    lines.append("--- 关键文件硬断言自检 ---")
    for rel in SERVER_MUST:
        ok = os.path.isfile(os.path.join(ROOT, rel.replace("/", os.sep)))
        lines.append("  %s : %s" % (rel, "在" if ok else "**缺失**"))
    lines.append("  main.py include %s : %s"
                 % (SERVER_MAIN_MUST_INCLUDE, asserts["main_has_admin_router"]))
    lines.append("  main.py 调用 %s : %s"
                 % (SERVER_MAIN_MUST_ENSURE, asserts["main_has_ensure"]))
    lines.append("  database.py 含 %s 守卫迁移 : %s"
                 % (DB_MUST_MIGRATE, asserts["db_has_migration"]))
    lines.append("  config.py 读取 %s : %s" % (ADMIN_ENV_KEY, asserts["config_reads_env"]))
    lines.append("  routers/admin.py 提供 /contact : 在")
    lines.append("")
    lines.append("--- 安全闸门 ---")
    lines.append("  禁止夹带：data.db / .env / .env.example / .venv / uploads / __pycache__ ：已通过")
    for f in ("server/data.db", "server/.env"):
        lines.append("  本地存在但**不打包**：%s : %s"
                     % (f, "是" if os.path.exists(os.path.join(ROOT, f.replace("/", os.sep)))
                        else "否"))
    lines.append("")
    lines.append("--- 清单明细（arcname, 字节）---")
    for arc, p in entries:
        lines.append("%9d  %s" % (os.path.getsize(p), arc))
    return "\n".join(lines) + "\n"


# ---------------- 远端管理员链路探针 ----------------
# 说明：全部走 urllib + \uXXXX 转义中文，规避 plink 通道的中文编码/引号问题。
# token 一律脱敏（只输出长度与前 6 位），绝不在日志里落完整 JWT。
PROBE_ADMIN_PY = r'''
import json
import sqlite3
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
ADMIN_USER = "\u7ba1\u7406\u5458"          # 管理员
ADMIN_PWD = "__ADMIN_PWD__"


def req(method, path, body=None, token=None, timeout=20):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        return e.code, raw
    except Exception as e:
        return -1, "EXC:%s" % e


def mask_login(raw):
    """登录返回体脱敏：令牌只保留长度，不输出任何 JWT 片段。"""
    try:
        d = json.loads(raw)
    except Exception:
        return raw[:120].replace("\n", " ")
    for k in ("token", "refreshToken", "refresh_token", "accessToken"):
        if k in d and isinstance(d[k], str):
            d[k] = "<\u5df2\u7701\u7565 len=%d>" % len(d[k])
    return json.dumps(d, ensure_ascii=False)[:300]


def brief(raw, limit=200):
    s = raw.replace("\n", " ").strip()
    return s if len(s) <= limit else s[:limit] + "...<truncated>"


code, raw = req("GET", "/api/health")
print("HEALTH:" + str(code))

code, raw = req("GET", "/api/admin/contact")
print("ADMIN_NOAUTH_CONTACT:" + str(code))
print("ADMIN_NOAUTH_CONTACT_BODY:" + brief(raw, 120))

code, raw = req("GET", "/api/admin/overview")
print("ADMIN_NOAUTH_OVERVIEW:" + str(code))

code, raw = req("POST", "/api/auth/login",
                {"username": ADMIN_USER, "password": ADMIN_PWD})
print("LOGIN_ADMIN:" + str(code))
print("LOGIN_BODY_MASKED:" + mask_login(raw))

token = ""
is_admin_flag = ""
if code == 200:
    try:
        d = json.loads(raw)
        token = d.get("token") or ""
        is_admin_flag = str(bool(d.get("isAdmin") or d.get("is_admin") or
                                 (d.get("user") or {}).get("isAdmin") or
                                 (d.get("user") or {}).get("is_admin")))
    except Exception:
        token = ""
print("LOGIN_TOKEN_LEN:" + str(len(token)))
print("LOGIN_ISADMIN:" + (is_admin_flag or "NA"))

if token:
    code, raw = req("GET", "/api/admin/contact", token=token)
    print("CONTACT_AUTHED:" + str(code))
    print("CONTACT_BODY:" + brief(raw, 200))
    for name, path in (("OVERVIEW", "/api/admin/overview"),
                       ("USERS", "/api/admin/users"),
                       ("ONLINE", "/api/admin/online"),
                       ("FEEDBACK", "/api/admin/feedback")):
        code, raw = req("GET", path, token=token)
        print("%s_AUTHED:%s" % (name, code))
        if name == "USERS":
            total = "NA"
            try:
                total = str(json.loads(raw).get("total"))
            except Exception:
                pass
            print("USERS_TOTAL:" + total)
        if name == "OVERVIEW":
            print("OVERVIEW_BODY:" + brief(raw, 200))
        if name != "USERS" and code != 200:
            print("%s_BODY:%s" % (name, brief(raw, 160)))
else:
    for name in ("CONTACT_AUTHED", "OVERVIEW_AUTHED", "USERS_AUTHED",
                 "ONLINE_AUTHED", "FEEDBACK_AUTHED"):
        print(name + ":-1")
    print("USERS_TOTAL:NA")

# ---- 生产库直查：is_admin 列 + 管理员行 ----
try:
    con = sqlite3.connect("/opt/study-workbench/server/data.db", timeout=10)
    cur = con.cursor()
    cols = [r[1] for r in cur.execute("PRAGMA table_info(users)").fetchall()]
    print("DB_HAS_IS_ADMIN:" + ("1" if "is_admin" in cols else "0"))
    print("DB_USERS:" + str(cur.execute("select count(*) from users").fetchone()[0]))
    if "is_admin" in cols:
        row = cur.execute(
            "select id, username, is_admin from users where username = ?",
            (ADMIN_USER,)).fetchone()
        if row is None:
            print("DB_ADMIN_ROW:NONE")
        else:
            print("DB_ADMIN_ROW:id=%s,username=%s,is_admin=%s" % (row[0], row[1], row[2]))
        n = cur.execute("select count(*) from users where is_admin = 1").fetchone()[0]
        print("DB_ADMIN_COUNT:" + str(n))
    else:
        print("DB_ADMIN_ROW:NO_COLUMN")
        print("DB_ADMIN_COUNT:NA")
    con.close()
except Exception as e:
    print("DB_HAS_IS_ADMIN:-1")
    print("DB_ERR:" + brief(str(e), 160))
print("PROBE_ADMIN_DONE:1")
'''


def build_probe_command(host, pwd):
    """返回 (rc, out)：服务/站点健康 + 管理员链路探针 + DB + 日志。"""
    probe_src = PROBE_ADMIN_PY.replace("__ADMIN_PWD__", ADMIN_ENV_VALUE)
    b64 = base64.b64encode(probe_src.encode("utf-8")).decode("ascii")
    home_url = "http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html"
    remote = (
        "echo SERVICE:$(systemctl is-active " + SERVICE_NAME + ")\n"
        "echo NRESTARTS:$(systemctl show -p NRestarts --value " + SERVICE_NAME + ")\n"
        "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
        "echo ICONMAP:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1/assets/icon-map.js)\n"
        "echo SUBPAGEROUTER:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1/assets/subpage-router.js)\n"
        "echo MOCKPAPERS:$(curl -s -o /dev/null -w '%{http_code}' "
        "http://127.0.0.1/data/mock-papers.js)\n"
        "echo HOMEPAGE:$(curl -s -o /dev/null -w '%{http_code}' '" + home_url + "')\n"
        "echo ---ADMIN-PROBES---\n"
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
    """汇总全部探针 → (fatal:list, info:list)。"""
    fatal, info = [], []

    # --- 1. 服务与站点健康 ---
    svc = probe("SERVICE", out)
    if svc != "active":
        fatal.append("%s 服务非 active（=%s）" % (SERVICE_NAME, svc or "NONE"))
    else:
        info.append("SERVICE=active")
    nr = num_of("NRESTARTS", out)
    if nr is None:
        info.append("NRESTARTS 探针无输出（systemctl 不可读，按 INFO 处理）")
    elif nr > NRESTARTS_MAX:
        fatal.append("NRESTARTS=%s > %s（疑似崩溃循环）" % (nr, NRESTARTS_MAX))
    else:
        info.append("NRESTARTS=%s（<=%s，正常）" % (nr, NRESTARTS_MAX))
    for tag, label in FRONTEND_WATCH:
        if probe(tag, out) != "200":
            fatal.append("%s HTTP=%s（期望 200：本批未动前端，非 200 说明站点异常）"
                         % (label, probe(tag, out) or "NONE"))

    # --- 2. /api/health ---
    hb = probe("HEALTH", out)
    if hb != "200":
        fatal.append("GET /api/health HTTP=%s（期望 200）" % (hb or "NONE"))
    else:
        info.append("GET /api/health = 200")

    # --- 3. 无 token 访问 /api/admin/contact 必须是 401/403（404 = 路由没上线）---
    ac = probe("ADMIN_NOAUTH_CONTACT", out)
    if ac in ("401", "403"):
        info.append("GET /api/admin/contact（无 token）= %s（路由已上线且正确拒绝匿名）" % ac)
    elif ac == "404":
        fatal.append("GET /api/admin/contact（无 token）= 404（路由仍不存在，admin.py 未生效）")
    else:
        fatal.append("GET /api/admin/contact（无 token）= %s（期望 401/403）" % (ac or "NONE"))
    ao = probe("ADMIN_NOAUTH_OVERVIEW", out)
    if ao in ("401", "403"):
        info.append("GET /api/admin/overview（无 token）= %s" % ao)
    else:
        fatal.append("GET /api/admin/overview（无 token）= %s（期望 401/403）" % (ao or "NONE"))

    # --- 4. 管理员登录 ---
    lg = probe("LOGIN_ADMIN", out)
    if lg != "200":
        fatal.append("POST /api/auth/login（管理员）= %s（期望 200；400 说明账号未创建或密码未生效）"
                     % (lg or "NONE"))
    else:
        info.append("POST /api/auth/login（管理员）= 200，返回体（已脱敏）=%s"
                    % (probe("LOGIN_BODY_MASKED", out) or "(空)"))
    tl = num_of("LOGIN_TOKEN_LEN", out)
    if tl is None or tl <= 0:
        fatal.append("管理员登录未取到 token（LOGIN_TOKEN_LEN=%s）" % tl)
    else:
        info.append("管理员 token 长度=%d（完整 JWT <已省略>）" % tl)
    if probe("LOGIN_ISADMIN", out) not in ("True", "true", "1"):
        fatal.append("管理员登录返回 isAdmin=%s（期望 True：is_admin 标记未生效）"
                     % (probe("LOGIN_ISADMIN", out) or "NONE"))
    else:
        info.append("管理员登录返回 isAdmin=True")

    # --- 5. 带 token 访问 admin 各接口 ---
    if tl and tl > 0:
        for tag, label in (("CONTACT_AUTHED", "GET /api/admin/contact"),
                           ("OVERVIEW_AUTHED", "GET /api/admin/overview"),
                           ("USERS_AUTHED", "GET /api/admin/users"),
                           ("ONLINE_AUTHED", "GET /api/admin/online"),
                           ("FEEDBACK_AUTHED", "GET /api/admin/feedback")):
            v = probe(tag, out)
            if v != "200":
                fatal.append("%s（带管理员 token）= %s（期望 200）" % (label, v or "NONE"))
            else:
                info.append("%s（带管理员 token）= 200" % label)
        cb = probe("CONTACT_BODY", out)
        if cb:
            ok_fields = all(k in cb for k in ("id", "username", "nickname"))
            if not ok_fields:
                fatal.append("/api/admin/contact 响应体缺 id/username/nickname：%s" % cb)
            else:
                info.append("/api/admin/contact 响应体=%s" % cb)
        ut = num_of("USERS_TOTAL", out)
        if ut is None or ut < 1:
            fatal.append("/api/admin/users total=%s（期望 >=1）" % ut)
        else:
            info.append("/api/admin/users total=%s" % ut)
        ob = probe("OVERVIEW_BODY", out)
        if ob:
            info.append("/api/admin/overview 响应体=%s" % ob)

    # --- 6. 生产库结构 ---
    if probe("DB_HAS_IS_ADMIN", out) != "1":
        fatal.append("生产库 users 表无 is_admin 列（DB_HAS_IS_ADMIN=%s）"
                     % (probe("DB_HAS_IS_ADMIN", out) or "NONE"))
    else:
        info.append("生产库 users 表已有 is_admin 列")
    row = probe("DB_ADMIN_ROW", out)
    if not row or row in ("NONE", "NO_COLUMN"):
        fatal.append("生产库未找到「管理员」行（DB_ADMIN_ROW=%s）" % (row or "NONE"))
    elif not row.endswith("is_admin=1"):
        fatal.append("生产库「管理员」行 is_admin != 1（DB_ADMIN_ROW=%s）" % row)
    else:
        info.append("生产库管理员行：%s" % row)
    us = num_of("DB_USERS", out)
    if us is None:
        fatal.append("DB_USERS 探针无输出（数据库不可读？）")
    elif us < USERS_BASELINE:
        fatal.append("DB_USERS=%s < 基线 %s（疑似数据丢失，禁止视为部署成功）" % (us, USERS_BASELINE))
    else:
        info.append("DB_USERS=%s（>= 基线 %s，无数据丢失）" % (us, USERS_BASELINE))
    if probe("DB_ERR", out):
        fatal.append("数据库直查异常：%s" % probe("DB_ERR", out))

    # --- 7. 日志干净 ---
    tb = num_of("TRACEBACK_10MIN", out)
    if tb is None:
        info.append("TRACEBACK_10MIN 探针无输出（journalctl 不可用？按 INFO 处理）")
    elif tb > 0:
        fatal.append("近 10 分钟 %s 日志含 traceback/exception %s 条（期望 0）"
                     % (SERVICE_NAME, tb))
    else:
        info.append("TRACEBACK_10MIN=0（重启后干净）")
    if "PROBE_ADMIN_DONE:1" not in out:
        fatal.append("管理员探针脚本未跑完（PROBE_ADMIN_DONE 缺失，远端 python3 可能报错）")
    return fatal, info


# ---------------- 主流程 ----------------
def main():
    dry = ("--dry-run" in sys.argv[1:]) or (os.environ.get("SW_DRY_RUN") == "1")
    skip_upload = os.environ.get("SW_SKIP_UPLOAD") == "1"
    assert_root_law()
    server_files = collect_server_files()
    asserts = assert_server_source(server_files)
    entries = list(iter_entries(server_files))

    print("[0] ROOT=%s" % ROOT)
    print("[0] 本批纯 server：%d 个 .py（顶层 %d + routers %d），前端 0 个文件"
          % (len(entries),
             len([r for r in server_files if r.count("/") == 1]),
             len([r for r in server_files if r.count("/") == 2])))
    print("[0] 静态断言：main.py include %s / 调用 %s；database.py 含 %s 迁移；"
          "config.py 读取 %s"
          % (SERVER_MAIN_MUST_INCLUDE, SERVER_MAIN_MUST_ENSURE, DB_MUST_MIGRATE,
             ADMIN_ENV_KEY))

    manifest = build_manifest(server_files, asserts)
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
        print("[DRY-RUN] 未联网、未读凭据、未上传、未改远端 .env、未重启服务。")
        print("[DRY-RUN] 清单条数=%d；必需文件 %s 齐备" % (len(entries), "、".join(SERVER_MUST)))
        print("[DRY-RUN] ROOT 铁律校验通过；前端 0 文件（blog_wechat.html 等一律不触碰）；"
              "data.db / .env 未进包。")
        return

    host, pwd = load_credentials()
    transcript = []
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        f.write("# %s 部署记录（增量落盘）\n" % STAMP)

    def log(line):
        print(line)
        transcript.append(line)
        # 增量落盘：任何一步失败都能留下完整取证，不依赖末尾一次写
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

    # ---------- 4. DB 备份 → 解压 → 语法自检 → 全量 MD5 ----------
    # py_compile 在 REMOTE_SERVER 目录内执行，需去掉 'server/' 前缀
    server_rel = [r[len("server/"):] for r in server_files]
    remote = (
        "cd %s || exit 1\n" % REMOTE_ROOT +
        "mkdir -p backups\n" +
        "cp -a server/data.db backups/data.db.before-%s 2>/dev/null && echo DB-BACKUP-OK "
        "|| echo DB-BACKUP-SKIP\n" % STAMP +
        "ls -l backups/data.db.before-%s 2>/dev/null | awk '{print \"DB-BACKUP-SIZE:\"$5}'\n" % STAMP +
        "tar xzf deploy_%s.tar.gz -C %s/ || exit 1\n" % (STAMP, REMOTE_ROOT) +
        # 语法自检：优先用服务同款 venv 解释器（/opt/study-workbench/server/.venv），
        # 缺失时回落到系统 python3（py_compile 只用标准库，不依赖第三方包）。
        "PY=$(test -x %s/.venv/bin/python && echo %s/.venv/bin/python || echo python3)\n"
        % (REMOTE_SERVER, REMOTE_SERVER) +
        "echo PYCOMPILE_BIN:$PY\n" +
        "echo PYCOMPILE:$(cd %s && $PY -m py_compile %s 2>&1 | "
        "head -n 5 | tr '\\n' ' ' | sed 's/ *$//')\n"
        % (REMOTE_SERVER, " ".join(server_rel)) +
        "cd %s && $PY -m py_compile %s >/dev/null 2>&1 "
        "&& echo PYCOMPILE_RC:0 || echo PYCOMPILE_RC:1\n" % (REMOTE_SERVER, " ".join(server_rel)) +
        "echo '---MD5-BEGIN---'\n" +
        "cd %s && md5sum %s\n" % (REMOTE_ROOT, " ".join(server_files)) +
        "echo '---MD5-END---'\n" +
        "test -f %s/routers/admin.py && echo ADMIN_PY_PRESENT || echo ADMIN_PY_MISSING\n" % REMOTE_SERVER +
        "rm -f %s/deploy_%s.tar.gz\n" % (REMOTE_ROOT, STAMP)
    )
    rc, out, err = plink(remote, host, pwd)
    if rc != 0 or "---MD5-BEGIN---" not in out:
        log("[4][DEBUG] stderr=%r" % err[-400:])
        raise SystemExit("远端解压/校验失败 rc=%s\n%s\n%s" % (rc, out[-800:], err[-400:]))
    if "DB-BACKUP-OK" not in out:
        log("[4][FATAL] DB 备份失败（未生成 backups/data.db.before-%s），中止部署" % STAMP)
        raise SystemExit("DB 备份缺失，禁止继续（红线：重启前必须先备份）")
    log("[4] DB 备份 %s" % (probe("DB-BACKUP-SIZE", out) or "OK"))
    if probe("PYCOMPILE_RC", out) != "0":
        log("[4][FATAL] 远端 py_compile 失败：%s" % (probe("PYCOMPILE", out) or "(无输出)"))
        raise SystemExit("server/*.py 语法自检未通过，已中止（此时尚未重启，旧进程仍在运行）")
    log("[4] py_compile 语法自检通过；routers/admin.py %s"
        % ("已在远端就位" if "ADMIN_PY_PRESENT" in out else "**仍缺失**"))
    if "ADMIN_PY_MISSING" in out:
        raise SystemExit("解压后远端仍无 routers/admin.py，中止")

    block = out.split("---MD5-BEGIN---")[1].split("---MD5-END---")[0]
    remote_map = {}
    for line in block.strip().splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            remote_map[parts[1].strip().lstrip("./")] = parts[0]
    bad = []
    for rel in server_files:
        local = md5(os.path.join(ROOT, rel.replace("/", os.sep)))
        rm = remote_map.get(rel)
        if rm != local:
            bad.append((rel, local[:10], (rm or "MISSING")[:10]))
    log("[4] 全量 MD5 校验: %d/%d 一致（远端回读 %d 条）"
        % (len(server_files) - len(bad), len(server_files), len(remote_map)))
    for rel, lo, ro in bad[:20]:
        log("     BAD %s local=%s remote=%s" % (rel, lo, ro))
    if bad:
        raise SystemExit("存在 %d 个 server 文件 MD5 不一致，中止（未重启服务）" % len(bad))

    # ---------- 5. 远端 .env 幂等写入 ADMIN_PASSWORD（严禁覆盖整个 .env）----------
    remote = (
        "cd %s || exit 1\n" % REMOTE_SERVER +
        "if [ ! -f .env ]; then echo ENV-FILE-MISSING; exit 1; fi\n" +
        "cp -a .env .env.bak-%s 2>/dev/null && echo ENV-BACKUP-OK || echo ENV-BACKUP-SKIP\n" % STAMP +
        "if grep -q '^%s=' .env; then "
        "sed -i 's|^%s=.*$|%s=%s|' .env && echo ENV-KEY-UPDATED; "
        "else printf '\\n%s=%s\\n' >> .env && echo ENV-KEY-APPENDED; fi\n"
        % (ADMIN_ENV_KEY, ADMIN_ENV_KEY, ADMIN_ENV_KEY, ADMIN_ENV_VALUE,
           ADMIN_ENV_KEY, ADMIN_ENV_VALUE) +
        "echo ENV-KEY-COUNT:$(grep -c '^%s=' .env)\n" % ADMIN_ENV_KEY +
        "echo ENV-LINES:$(wc -l < .env)\n" +
        "echo ENV-OTHER-KEYS:$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=' .env)\n"
    )
    rc, out, err = plink(remote, host, pwd)
    env_count = probe("ENV-KEY-COUNT", out)
    if rc != 0 or not env_count.isdigit() or int(env_count) < 1:
        log("[5][DEBUG] stderr=%r out=%r" % (err[-300:], out[-300:]))
        raise SystemExit("远端 .env 写入/校验失败 rc=%s ENV-KEY-COUNT=%s" % (rc, env_count))
    action = "已追加" if "ENV-KEY-APPENDED" in out else "已就地更新该行"
    log("[5] .env %s %s：%s；.env 共 %s 行、%s 个键（整文件未被覆盖，已备份为 .env.bak-%s）"
        % (ADMIN_ENV_KEY, action, out.splitlines()[0].strip(), probe("ENV-LINES", out),
           probe("ENV-OTHER-KEYS", out), STAMP))

    # ---------- 6. 重启 study-workbench（敏感操作，独立分步）----------
    if os.environ.get("SW_SKIP_SERVER_RESTART") == "1":
        log("[6] SW_SKIP_SERVER_RESTART=1，跳过重启（探针将按旧进程评估）")
    else:
        remote = (
            "systemctl restart %s && echo RESTART-OK || echo RESTART-FAIL\n" % SERVICE_NAME +
            "sleep 3\n"
            "echo SERVICE_AFTER:$(systemctl is-active %s)\n" % SERVICE_NAME +
            "echo UPTIME_S:$(systemctl show -p NRestarts --value %s)\n" % SERVICE_NAME
        )
        rc, out, err = plink(remote, host, pwd, timeout=120)
        if "RESTART-OK" not in out or probe("SERVICE_AFTER", out) != "active":
            log("[6][DEBUG] stderr=%r out=%r" % (err[-300:], out[-300:]))
            log("[6][FATAL] 重启后服务未回到 active，请人工 journalctl -u %s -n 100" % SERVICE_NAME)
            raise SystemExit("STEP-SERVER-RESTART 失败（DB 备份在 backups/data.db.before-%s）"
                             % STAMP)
        log("[6] %s 已重启且 active（NRestarts=%s）" % (SERVICE_NAME, probe("UPTIME_S", out)))

    # ---------- 7. 探针 ----------
    round_no = 0
    out2 = ""
    while True:
        round_no += 1
        rc2, out2, err2 = build_probe_command(host, pwd)
        log("=" * 60)
        log("探针第 %d 轮原始输出：" % round_no)
        log(out2.strip())
        log("=" * 60)
        if rc2 != 0:
            log("[7][WARN] 探针 rc=%s stderr=%r" % (rc2, err2[-300:]))
        fatal, info = judge_probes(out2)
        log("[7] 第 %d 轮 INFO：" % round_no)
        for m in info:
            log("     INFO " + m)
        if not fatal:
            log("[7] 全部探针通过（第 %d 轮）" % round_no)
            break
        log("[7] 第 %d 轮 FATAL 汇总：" % round_no)
        for m in fatal:
            log("     FATAL " + m)
        if round_no >= 3:
            raise SystemExit("探针连续 3 轮未通过，停止重试；已取证见 " + LOG_PATH)
        log("[7] 等待 10s 后重跑探针（第 %d 轮）..." % (round_no + 1))
        time.sleep(10)

    with open(LOG_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(transcript) + "\n")
    print("[8] 部署完成，完整记录 -> " + LOG_PATH)


if __name__ == "__main__":
    main()
