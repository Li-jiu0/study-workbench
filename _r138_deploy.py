# -*- coding: utf-8 -*-
"""R138 v1.32 发版 · 第2步：上传 APK + version.json + xt-update.js，并做在线验证。

沿用 _deploy_v131.py 的成熟做法：
  pscp 传 ASCII 临时名 -> plink 远端 python 用 \\u 转义 mv 落位 -> md5 逐文件比对 -> HTTP 验证
凭据从 upload_v23.ps1 正则提取，绝不打印明文。
"""
import hashlib, io, json, os, re, subprocess, sys, time, urllib.request

ROOT = r"D:\下载的文件\学习工作台"
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
CRED = os.path.join(ROOT, "upload_v23.ps1")
OUT = os.path.join(ROOT, "_r138_deploy_out.txt")
LOCAL_APK = os.path.join(ROOT, "\u661f\u9014-\u5b89\u5353App.apk")
LOG = []

def log(s=""):
    LOG.append(str(s))

def flush(code=None):
    io.open(OUT, "w", encoding="utf-8").write("\n".join(LOG) + "\n")
    if code is not None:
        sys.exit(code)

def md5f(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

s = io.open(CRED, encoding="utf-8", errors="replace").read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
if not m:
    log("NO CRED"); flush(2)
pwd, host = m.group(1), m.group(2)
log("目标 root@%s（凭据长度 %d，不打印）" % (host, len(pwd)))

FINAL = {
    "version.json": "/opt/study-workbench/server/routers/version.json",
    "xt-update.js": "/opt/study-workbench/web/assets/xt-update.js",
    "apk": "/opt/study-workbench/web/static/apk/\u661f\u9014-1.32.apk",
}
PLAN = [
    (os.path.join(ROOT, "server", "routers", "version.json"), "/tmp/_v132_version.json", "version.json"),
    (os.path.join(ROOT, "assets", "xt-update.js"), "/tmp/_v132_xt_update.js", "xt-update.js"),
    (LOCAL_APK, "/tmp/_v132.apk", "apk"),
]

md5man = {}
for local, tmp, key in PLAN:
    if not os.path.isfile(local):
        log("!!! 本地缺失: %s" % local); flush(1)
    md5man[key] = md5f(local)
    log("上传 %s (%d bytes, md5=%s) -> %s" % (os.path.basename(local), os.path.getsize(local), md5man[key][:12] + "...", FINAL[key]))

for local, tmp, key in PLAN:
    r = subprocess.run([PSCP, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, local, "root@%s:%s" % (host, tmp)],
                       capture_output=True, text=True, timeout=1800, errors="replace")
    log("pscp %s exit=%d %s" % (key, r.returncode, (r.stderr or "")[-160:]))
    if r.returncode != 0:
        log("!!! 上传失败：%s" % key); flush(7)

remote_py = "\n".join([
    "import hashlib, io, os, shutil, time, urllib.request, urllib.error",
    "FINAL = " + json.dumps(FINAL, ensure_ascii=False),
    "TMP = " + json.dumps({k: t for (_, t, k) in PLAN}, ensure_ascii=False),
    "EXP = " + json.dumps(md5man, ensure_ascii=False),
    "def m5(p): return hashlib.md5(io.open(p,'rb').read()).hexdigest()",
    "for k in FINAL:",
    "    if not os.path.exists(TMP[k]): print('TMP_MISSING', k); continue",
    "    h = m5(TMP[k])",
    "    if h != EXP[k]: print('TMP_MD5_BAD', k, EXP[k], h); continue",
    "    d = os.path.dirname(FINAL[k])",
    "    if not os.path.isdir(d): os.makedirs(d, exist_ok=True)",
    "    shutil.move(TMP[k], FINAL[k])",
    "    print('MOVED', k, 'md5_ok=%s' % (m5(FINAL[k]) == EXP[k]))",
    "print('APK_DIR:', sorted(os.listdir(os.path.dirname(FINAL['apk']))))",
    "for i in range(9):",
    "    time.sleep(10)",
    "    try:",
    "        d = urllib.request.urlopen('http://127.0.0.1/api/app/version', timeout=10).read().decode('utf-8')",
    "        print('VERSION_TRY%d' % i, d[:200])",
    "        if '1.32' in d: break",
    "    except Exception as e: print('VERSION_ERR', e)",
    "def head(u):",
    "    try:",
    "        r = urllib.request.urlopen(u, timeout=60)",
    "        return r.status, r.headers.get('Content-Length')",
    "    except urllib.error.HTTPError as e: return e.code, None",
    "    except Exception as e: return 'ERR:%s' % e, None",
    "print('APK_HTTP', head('http://127.0.0.1/static/apk/%E6%98%9F%E9%80%94-1.32.apk'))",
])
remote_cmd = "python3 - <<'PYEOF'\n" + remote_py + "\nPYEOF"

log("远端落位 + 验证开始（version 接口最多等 90s 让 60s TTL 过期）…")
r = subprocess.run([PLINK, "-ssh", "-pw", pwd, "-batch", "-hostkey", HOSTKEY, "root@" + host, remote_cmd],
                   capture_output=True, text=True, timeout=1800, errors="replace")
log("--- 远端执行 rc=%d ---" % r.returncode)
log(r.stdout or "")
if r.stderr:
    log("[STDERR] " + r.stderr[-1200:])

try:
    d = urllib.request.urlopen("http://110.42.134.62/api/app/version", timeout=15).read().decode("utf-8")
    log("公网 /api/app/version: %s" % d[:260])
except Exception as e:
    log("公网版本接口异常: %r" % e)

log("")
log("APK_DIR=" + os.path.dirname(FINAL["apk"]))
log("注意：远端 version.json 为 60 秒 TTL 缓存，无需重启服务。")
flush(0)
