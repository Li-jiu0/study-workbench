# -*- coding: utf-8 -*-
"""20260918 R87 前端+版本清单部署（AI 模型设置整改本批）。

以 deploy_update_20260917r72.py 为范式（打包 -> 本地 3 道闸 -> 上传 -> 远端解包 -> MD5 全量比对 -> 探活）。
本批差异：
  1) 版本戳已由 tools/r87_stamp_apply.py 刷到 20260918c（r72 是 20260916S）。
  2) 部署范围 = 前端 web + server/routers/version.json + web/static/apk/*。
     ⚠️ 本批不含任何 server/*.py 改动（后端契约已核验无缺口）。
  3) 3 道闸（SOP §5.0.1）按本批符号重写（闸2 新增符号 / 闸3 已删符号）。

环境变量：
  · SW_HOST / SW_PASS 可覆盖凭据（当前均未设置 → 从被 gitignore 的 upload_v23.ps1 正则提取，绝不 print 明文）。
  · SW_DRY_RUN=1 只做「本地闸 + 打包」，不上传、不触碰生产。

【version.json 读取时机结论】（见报告）
  server/routers/update.py 的 _load_manifest() 使用模块级 60 秒 TTL 内存缓存
  （_CACHE_TTL = 60；缓存过期后 _read_manifest() 重新读盘）。
  → **既非「启动时缓存」也非「每请求实时读」，而是 60 秒 TTL 缓存** ⇒ 覆盖 version.json 后
     无需 systemctl restart，最多 60 秒自动生效。
"""
from __future__ import annotations

import base64
import glob
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile

ROOT = r"D:\下载的文件\学习工作台"
STAMP = "20260918c"
TAR = os.path.join(ROOT, "tools", "frontend_r87_20260918.tar.gz")
REMOTE_TAR = "/tmp/frontend_r87_20260918.tar.gz"
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
CRED = os.path.join(ROOT, "upload_v23.ps1")
REMOTE_ROOT = "/opt/study-workbench"
OUT = os.path.join(ROOT, "tools", "r87_deploy_out.txt")

LOG = []


def log(s=""):
    LOG.append(str(s))


def flush(code=None):
    txt = "\n".join(LOG)
    try:
        io.open(OUT, "w", encoding="utf-8").write(txt + "\n")
    except OSError:
        pass
    try:
        print(txt)
    except Exception:
        pass
    if code is not None:
        sys.exit(code)


# ======================================================================
# 清单
# ======================================================================
EXCLUDE_HTML = {"blog_wechat.html"}
EOL_LF_EXCEPT = {"ai-settings.html"}

# 本批「内容真改过」的前端资产（ai-cap-registry.js 未改，不在上传清单）
ASSETS = [
    "ai-config.js", "ai-service.js", "ai-settings.js", "ai-page.js",
    "ai-cap-audio.js", "ai-cap-embed.js", "ai-cap-image.js", "ai-cap-vision.js",
    "ai-cap-translate.js", "ai-cap-video.js", "ai-cap-3d.js",
    "xt-aiusage.js", "xt-update.js",
]

# 版本清单（单一真源）
SERVER_FILES = [os.path.join("server", "routers", "version.json")]
# APK 产物目录（含 README/.gitkeep；真正 APK 由用户构建后放入，本批仅确保目录存在）
APK_DIR_REL = os.path.join("web", "static", "apk")

htmls = sorted(
    os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.html"))
    if os.path.basename(p) not in EXCLUDE_HTML
)
log("部署 HTML = %d 个（根 HTML 排除 %s）" % (len(htmls), ", ".join(sorted(EXCLUDE_HTML))))
log("部署 assets = %d 个: %s" % (len(ASSETS), ", ".join(ASSETS)))
log("部署 version.json + apk 目录")
if len(htmls) != 47:
    log("!!! 预期 47 个 HTML（48 根 - blog_wechat），实得 %d" % len(htmls))
    flush(1)

# ======================================================================
# 闸1 行尾闸（SOP §5.0.1）—— 防复现 §5.0「CRLF 静默变 LF 推生产」事故
# ======================================================================
eol_bad = []
for h in htmls:
    with open(os.path.join(ROOT, h), "rb") as f:
        b = f.read()
    crlf = b.count(b"\r\n")
    lone = b.count(b"\n") - crlf
    if h in EOL_LF_EXCEPT:
        if not (crlf == 0 and lone > 0):
            eol_bad.append((h, "EXCEPT_NOT_PURE_LF", "CRLF=%d loneLF=%d" % (crlf, lone)))
    else:
        if lone != 0:
            eol_bad.append((h, "LONE_LF", lone))
log("")
log("[闸1 行尾] %d 个 HTML，违规 %d %s" % (len(htmls), len(eol_bad), eol_bad if eol_bad else ""))
if eol_bad:
    log("!!! 闸1 失败：行尾被改坏，中止部署（sys.exit(3)）")
    flush(3)

# ======================================================================
# 打包
# ======================================================================
members = []  # (local_abspath, arcname)
for h in htmls:
    members.append((os.path.join(ROOT, h), "web/" + h))
for a in ASSETS:
    members.append((os.path.join(ROOT, "assets", a), "web/assets/" + a))
for rel in SERVER_FILES:
    members.append((os.path.join(ROOT, rel), rel.replace(os.sep, "/")))
for p in sorted(glob.glob(os.path.join(ROOT, APK_DIR_REL, "*"))):
    if os.path.isfile(p):
        members.append((p, "web/static/apk/" + os.path.basename(p)))

with tarfile.open(TAR, "w:gz") as tar:
    for local, arc in members:
        tar.add(local, arcname=arc)
names = tarfile.open(TAR).getnames()
log("")
log("打包 %d 个成员, %d bytes -> %s" % (len(names), os.path.getsize(TAR), os.path.basename(TAR)))


def tar_read(path):
    with tarfile.open(TAR) as t:
        try:
            return t.extractfile(path).read()
        except Exception:
            return None


def tar_all_bytes():
    """把所有成员内容拼起来（闸2 的「全站存在性」判定用）。"""
    blob = b""
    with tarfile.open(TAR) as t:
        for m in t.getmembers():
            if not m.isfile():
                continue
            d = t.extractfile(m)
            if d:
                blob += d.read() + b"\n"
    return blob


# ======================================================================
# 闸2 新增符号闸（SOP §5.0.1）—— 本批新增符号必须存在
# ======================================================================
# 本批新增符号（跨文件聚合判定；任一缺失即失败）
NEW_SYMBOLS = [
    "probeNoAuto",          # T01：video/3D 探针不进自动批量
    "aiHealthCheckBatch",   # T02：批量健康检查
    "unsupported_probe",    # T01/T02：无 probe 能力的 err 值
    "three_d",              # T03：3D 分类 key
    "hideUnavailable",      # T03：不可用模型隐藏开关
    "xt:health-changed",    # T03 派发 / T04 监听
    "setSortCat",           # T03：排序弹窗分类下拉
    "displayNameOf",        # T03/T04：展示名工具
    "ark-seedance-1-0-pro", # T01：视频模型条目
]
blob = tar_all_bytes()
sym_missing = [tok for tok in NEW_SYMBOLS if tok.encode("utf-8") not in blob]
log("")
log("[闸2 新增符号] %d 项，缺失 %d %s" % (len(NEW_SYMBOLS), len(sym_missing), sym_missing))

# 「check_version_consistency 相关」= 一致性检查脚本存在（工具，不入前端 tar）→ 本地校验
consistency_tool = os.path.join(ROOT, "tools", "qa", "check_version_consistency.py")
consistency_ok = os.path.isfile(consistency_tool)
log("    一致性命中: tools/qa/check_version_consistency.py 存在 = %s" % consistency_ok)

if sym_missing or not consistency_ok:
    log("!!! 闸2 失败：本批新增符号缺失（可能 T02/T03/T04 尚未落地 / 尚未刷戳），中止（sys.exit(5)）")
    flush(5)

# ======================================================================
# 闸3 已删符号闸（SOP §5.0.1）—— 本批应归零的符号必须为 0
# ======================================================================
DEL_SYMBOLS = ["probeCostly"]
del_resid = [tok for tok in DEL_SYMBOLS if tok.encode("utf-8") in blob]
log("")
log("[闸3 已删符号] %d 项，残留 %d %s" % (len(DEL_SYMBOLS), len(del_resid), del_resid))
if del_resid:
    log("!!! 闸3 失败：应归零符号仍残留，中止（sys.exit(6)）")
    flush(6)

log("")
log("三道闸全部通过 ✅")

# ======================================================================
# 本地 MD5 manifest
# ======================================================================
def md5f(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

man = {}
for local, arc in members:
    man[arc] = md5f(local)
keys = sorted(man)
b64 = base64.b64encode(json.dumps(man, ensure_ascii=False).encode("utf-8")).decode("ascii")
log("本地 MD5 manifest：%d 个文件" % len(man))

# ======================================================================
# 凭据（绝不 print 明文）
# ======================================================================
host = os.environ.get("SW_HOST", "")
pwd = os.environ.get("SW_PASS", "")
if not host or not pwd:
    s = io.open(CRED, encoding="utf-8", errors="replace").read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        log("NO CRED"); flush(2)
    pwd, host = m.group(1), m.group(2)
log("目标 root@%s（凭据长度 %d，不打印）" % (host, len(pwd)))

if os.environ.get("SW_DRY_RUN") == "1":
    log("")
    log("[DRY-RUN] 本地闸 + 打包完成；跳过上传与远端解包（未触碰生产）。")
    flush(0)

# ======================================================================
# 上传
# ======================================================================
if not os.path.isfile(PSCP):
    log("!!! 找不到 pscp.exe：%s" % PSCP); flush(1)
r = subprocess.run(
    [PSCP, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, TAR, "root@%s:%s" % (host, REMOTE_TAR)],
    capture_output=True, text=True, timeout=600, errors="replace")
log("上传 exit=%d %s" % (r.returncode, (r.stderr or "")[-300:]))
if r.returncode != 0:
    log("!!! 上传失败，中止（sys.exit(7)）"); flush(7)

# ======================================================================
# 远端：预快照 -> tarfile 落位 -> MD5 全量比对 -> 探活
# ======================================================================
remote_py = "\n".join([
    "import tarfile, os, io, hashlib, base64, json, urllib.request, urllib.error",
    "ROOT='/opt/study-workbench'; TAR='" + REMOTE_TAR + "'",
    "man=json.loads(base64.b64decode('" + b64 + "').decode('utf-8'))",
    "keys=sorted(man)",
    "def m5(p):",
    "    return hashlib.md5(io.open(p,'rb').read()).hexdigest()",
    "pre={}",
    "for k in keys:",
    "    p=os.path.join(ROOT,k)",
    "    pre[k]=m5(p) if os.path.exists(p) else 'ABSENT'",
    "changed=[k for k in keys if pre[k]!='ABSENT' and pre[k]!=man[k]]",
    "new=[k for k in keys if pre[k]=='ABSENT']",
    "print('PRE_SNAPSHOT changed=%d new=%d unchanged=%d' % (len(changed), len(new), len(keys)-len(changed)-len(new)))",
    "with tarfile.open(TAR,'r:gz') as t:",
    "    mem=t.getmembers(); t.extractall(ROOT)",
    "print('EXTRACT_OK members=%d' % len(mem))",
    "ok=0; bad=[]",
    "for i,k in enumerate(keys):",
    "    p=os.path.join(ROOT,k)",
    "    if not os.path.exists(p): bad.append((i,'MISSING','')); continue",
    "    h=m5(p)",
    "    if h==man[k]: ok+=1",
    "    else: bad.append((i,man[k],h))",
    "print('MD5_OK=%d/%d' % (ok,len(keys)))",
    "for b in bad: print('MD5_BAD idx=%d exp=%s got=%s' % b)",
    "def code(u):",
    "    try: return urllib.request.urlopen(u,timeout=10).status",
    "    except urllib.error.HTTPError as e: return e.code",
    "    except Exception as e: return 'ERR:%s'%e",
    "print('HTTP_HOME=%s' % code('http://127.0.0.1/'))",
    "print('HTTP_HEALTH=%s' % code('http://127.0.0.1:8000/api/health'))",
    "print('HTTP_VERSION=%s' % code('http://127.0.0.1/api/app/version'))",
    "d=urllib.request.urlopen('http://127.0.0.1/assets/ai-service.js?v=" + STAMP + "',timeout=20).read()",
    "print('FETCH_ai_service_unsupported_probe=%d' % d.count(b'unsupported_probe'))",
    "d2=urllib.request.urlopen('http://127.0.0.1/api/app/version',timeout=20).read()",
    "print('FETCH_version_json=%s' % d2[:200])",
    "try: os.remove(TAR)",
    "except Exception as e: print('TAR_CLEANUP_ERR=%s'%e)",
    "print('TAR_CLEANED=%s' % (not os.path.exists(TAR)))",
])
remote_cmd = "python3 - <<'PYEOF'\n" + remote_py + "\nPYEOF"

r = subprocess.run(
    [PLINK, "-ssh", "-pw", pwd, "-batch", "-hostkey", HOSTKEY, "root@" + host, remote_cmd],
    capture_output=True, text=True, timeout=900, errors="replace")
log("--- 远端执行 rc=%d ---" % r.returncode)
log(r.stdout or "")
if r.stderr:
    log("[STDERR] " + r.stderr[-1500:])

log("")
log("注意：version.json 生效无需重启 —— update.py _load_manifest() 为 60 秒 TTL 缓存。")
flush(0)
