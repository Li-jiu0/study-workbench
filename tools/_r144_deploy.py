# -*- coding: utf-8 -*-
"""R143+R144 发版部署（1.41 / versionCode 42 / 星途-1.41.apk）。

发版内容：
  · R143：① 私聊头部「✎」→ 对方资料页（返回回聊天）② 表情/加号面板 ⇄ 输入框切换
          ③ 自定义表情「＋」移动端 ghost-mouse 双触发修复 ④ 移除 App 切页原生绿进度条（安卓壳）
  · R144：位置共享多点连线 + 点间直线距离标注（自动刷新）+ 导航入口（仅 live-location.html）

安全顺序（沿用 R11/R140/R142 已验证流程）：
  0) 本地：刷新 version.json 的 publishedAt → 构建 manifest + tar
  1) 前置：服务 active 断言；APK 本地件存在 + md5
  2) 备份线上本次会覆盖的原件
  3) 上传 tar → 远端 md5 校验 tar
  4) 解压 → 逐文件 md5 校验（不一致即中止：不杀进程、不重启）
  5) 上传 APK（约 90MB）→ /tmp → mv 到 web/static/apk/星途-1.41.apk → 远端 md5 校验
  6) 清孤儿 uvicorn（仅当 8000 被非 systemd MainPID 占用）→ systemctl restart → active 断言
  7) 线上验收：/api/app/version=1.41/42/apkReady=true + APK 公网 md5 一致 + 页戳/文案/资源 md5
禁列断言：.apk / android/ / *.db / .env / model_usage.json 一律不得入 tar（version.json 本次**必须**发）。
"""
import os, re, io, json, time, tarfile, hashlib, subprocess, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone, timedelta

ROOT = r'D:\下载的文件\学习工作台'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能 worktree，终止'
for _m in ('学习工作台.html', 'assets', 'server', 'tools'):
    assert os.path.exists(os.path.join(ROOT, _m)), 'ROOT 疑似非主项目根，缺 ' + _m

PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
TS = time.strftime('%Y%m%d-%H%M%S')
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r144_deploy.tar.gz')
TAR_REMOTE = '/tmp/_r144_deploy.tar.gz'
MANIFEST = os.path.join(ROOT, 'tools', '_r144_manifest.json')
OUT = os.path.join(ROOT, 'tools', '_r144_deploy_out.txt')
APK_NAME = '星途-1.41.apk'
APK_LOCAL = os.path.join(ROOT, 'web', 'static', 'apk', APK_NAME)
APK_SRC = os.path.join(ROOT, '星途-安卓App.apk')
APK_REMOTE_DIR = RR + '/web/static/apk'
BK = '%s/_bak-r144-%s' % (RR, TS)

# 线上标准戳（本批）与「上一版」戳 —— 用于验收断言
STAMP_NEW = '20260926a'      # xt-update.js（3 个引用页）
CHAT_STAMP = '20260926b'     # chat-local.js（私聊.html）
PROF_STAMP = '20260926c'     # xt-profile.js（个人资料.html）

PAIRS = [
    ('assets/chat-local.js',        'web/assets/chat-local.js'),
    ('assets/xt-profile.js',        'web/assets/xt-profile.js'),
    ('assets/xt-update.js',         'web/assets/xt-update.js'),
    ('live-location.html',          'web/live-location.html'),
    ('私聊.html',                    'web/私聊.html'),
    ('个人资料.html',                'web/个人资料.html'),
    ('协议.html',                    'web/协议.html'),
    ('关于.html',                    'web/关于.html'),
    ('更多.html',                    'web/更多.html'),
    ('更新.html',                    'web/更新.html'),
    ('server/routers/version.json', 'server/routers/version.json'),
]
FILES = [arc for _, arc in PAIRS]

BAD = ('.apk', 'android/', '.db', '.env', 'model_usage.json')
for f in FILES:
    assert not any(b in f for b in BAD), '禁列文件混入: %s' % f
assert len(FILES) == 11, '文件数应为 11，实际 %d' % len(FILES)

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

# ---------- 0) 刷新 version.json 的 publishedAt（发版时刻） ----------
VJSON = os.path.join(ROOT, 'server', 'routers', 'version.json')
txt = io.open(VJSON, encoding='utf-8').read()
now_iso = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%dT%H:%M:%S+08:00')
txt2, n_rep = re.subn(r'"publishedAt"\s*:\s*"[^"]*"', '"publishedAt": "%s"' % now_iso, txt, count=1)
assert n_rep == 1, 'publishedAt 未命中（%d 次）' % n_rep
io.open(VJSON, 'w', encoding='utf-8', newline='\n').write(txt2)
_v = json.load(io.open(VJSON, encoding='utf-8'))
assert _v['version'] == '1.41' and _v['versionCode'] == 42 and _v['apkFileName'] == APK_NAME, 'version.json 口径不对'
assert _v['changelog'][0]['version'] == 'v1.41' and _v['notes'], 'version.json notes/changelog 未就绪'
log('version.json publishedAt → %s （1.41/42/%s, changelog[0]=v1.41 ✅）' % (now_iso, APK_NAME))

# ---------- 0b) 构建 manifest + tar ----------
MD5 = {}
for loc, arc in PAIRS:
    p = os.path.join(ROOT, loc.replace('/', os.sep))
    assert os.path.exists(p), '本地缺文件: %s' % loc
    MD5[arc] = hashlib.md5(open(p, 'rb').read()).hexdigest()
io.open(MANIFEST, 'w', encoding='utf-8').write(json.dumps({'md5': MD5}, ensure_ascii=False, indent=1))
if os.path.exists(TAR_LOCAL):
    os.remove(TAR_LOCAL)
with tarfile.open(TAR_LOCAL, 'w:gz') as tf:
    for loc, arc in PAIRS:
        tf.add(os.path.join(ROOT, loc.replace('/', os.sep)), arcname=arc)
tar_md5 = hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()
log('tar: %d 件  md5=%s  %d bytes' % (len(FILES), tar_md5, os.path.getsize(TAR_LOCAL)))

# ---------- 0c) APK 就位 ----------
# 安全口径：**绝不自动从 星途-安卓App.apk 复制** —— 旧版残留会让 1.40 的包冒充 1.41。
# 必须先手动跑 tools/_r140_apk_verify.py（断言 versionCode=42/versionName=1.41）通过后，
# 再把产物复制/改名为 web/static/apk/星途-1.41.apk，本脚本只做「存在性 + 体积 + md5」核对。
assert os.path.exists(APK_LOCAL), ('缺 %s —— 请先构建 APK 并通过 tools/_r140_apk_verify.py 门禁后再复制过来' % APK_LOCAL)
apk_md5 = hashlib.md5(open(APK_LOCAL, 'rb').read()).hexdigest()
apk_size = os.path.getsize(APK_LOCAL)
log('APK: %s  %d bytes  md5=%s' % (APK_NAME, apk_size, apk_md5))
assert apk_size > 60 * 1024 * 1024, 'APK 体积异常(%d) → 疑似构建不全' % apk_size

# ---------- 凭据 ----------
s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)

def plink(cmd, timeout=300):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = (r.stdout or '')
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode

def http(url, headers=None, timeout=30):
    h = {'Accept-Encoding': 'identity'}
    if headers:
        h.update(headers)
    try:
        rq = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(rq, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode()

log('目标 root@%s  备份目录 %s' % (host, BK))

# ---------- 1) 前置 ----------
o, rc = plink('systemctl is-active study-workbench')
log('\n部署前服务状态: %s' % o.strip())
assert o.strip() == 'active', '服务非 active → 先排查，终止'
st_v, b_v = http('http://%s/api/app/version' % host)
log('部署前 /api/app/version = HTTP %s %s' % (st_v, b_v.decode('utf-8', 'replace')[:120]))

# ---------- 2) 备份 ----------
log('\n===== 2) 备份线上原件 =====')
o, rc = plink("mkdir -p '%s' && cd %s && cp --parents %s '%s' && find '%s' -type f | wc -l"
              % (BK, RR, ' '.join("'%s'" % f for f in FILES), BK, BK))
log(o.strip())

# ---------- 3) 上传 tar + 校验 ----------
log('\n===== 3) 上传 tar =====')
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR_LOCAL, 'root@%s:%s' % (host, TAR_REMOTE)],
                   capture_output=True, text=True, timeout=600, errors='replace')
log('pscp rc=%d %s %s' % (r.returncode, (r.stdout or '').strip()[:200], (r.stderr or '').strip()[:200]))
o, rc = plink('md5sum %s; stat -c "%%s bytes" %s' % (TAR_REMOTE, TAR_REMOTE))
log(o.strip())
assert tar_md5 in o, '远端 tar md5 与本地不一致 → 中止'
log('远端 tar md5 一致 ✅')

# ---------- 4) 解压 + 逐文件 md5 ----------
log('\n===== 4) 解压 + 逐文件 md5 校验 =====')
o, rc = plink('cd %s && tar -xzf %s && echo EXTRACT_OK' % (RR, TAR_REMOTE))
log(o.strip())
assert 'EXTRACT_OK' in o, '解压失败 → 中止（未杀进程、未重启）'

o, rc = plink("cd %s && md5sum %s" % (RR, ' '.join("'%s'" % f for f in FILES)), timeout=180)
seen, bad = {}, []
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if mm:
        p = mm.group(2).strip().lstrip('*')
        seen[p[len(RR) + 1:] if p.startswith(RR + '/') else p] = mm.group(1)
for f in FILES:
    if seen.get(f) != MD5[f]:
        bad.append((f, MD5[f], seen.get(f)))
log('命中 %d/%d，不一致 %d' % (len(seen), len(FILES), len(bad)))
for b in bad:
    log('  MISMATCH %s 期望=%s 实际=%s' % b)
if bad:
    log('\n[中止] md5 不一致 → 未杀进程、未重启；线上仍由原文件服务。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(2)
log('全部一致 ✅')

# ---------- 5) 上传 APK ----------
log('\n===== 5) 上传 APK（约 %d MB，耐心） =====' % (apk_size // (1024 * 1024)))
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, APK_LOCAL, 'root@%s:/tmp/_r144_apk.bin' % host],
                   capture_output=True, text=True, timeout=1800, errors='replace')
log('pscp rc=%d %s %s' % (r.returncode, (r.stdout or '').strip()[:200], (r.stderr or '').strip()[:300]))
o, rc = plink('mkdir -p "%s" && mv -f /tmp/_r144_apk.bin "%s/%s" && stat -c "%%s bytes" "%s/%s" && md5sum "%s/%s"'
              % (APK_REMOTE_DIR, APK_REMOTE_DIR, APK_NAME, APK_REMOTE_DIR, APK_NAME, APK_REMOTE_DIR, APK_NAME),
              timeout=300)
log(o.strip())
assert apk_md5 in o, '远端 APK md5 与本地不一致 → 需重传'
log('APK md5 一致 ✅')

# ---------- 6) 清孤儿 + 重启 ----------
log('\n===== 6) 检查 8000 占用 + systemctl restart =====')
o, rc = plink("MP=$(systemctl show study-workbench -p MainPID --value); "
              "LP=$(ss -ltnp 2>/dev/null | grep ':8000' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2); "
              "echo \"MainPID=$MP  listen=$LP\"; "
              "if [ -n \"$LP\" ] && [ \"$LP\" != \"$MP\" ]; then echo 'ORPHAN → 结束'; kill -TERM $LP 2>/dev/null; sleep 2; kill -KILL $LP 2>/dev/null; echo killed; else echo 'no orphan'; fi")
log(o.strip())
plink('systemctl reset-failed study-workbench 2>/dev/null; systemctl restart study-workbench')
time.sleep(8)
o, rc = plink("systemctl is-active study-workbench; systemctl show study-workbench -p MainPID -p NRestarts -p ExecMainStatus; "
              "echo '-- 8000 --'; ss -ltnp | grep ':8000' || echo '(free)'; "
              "echo '-- journal tail --'; journalctl -u study-workbench --no-pager -n 20")
log(o.strip())
assert 'active' in o.splitlines()[0], '服务未 active → 立即排查/回滚'

# ---------- 7) 线上验收 ----------
log('\n===== 7) 线上验收 =====')
fails = []

# 7.0 版本号三件套
st, body = http('http://%s/api/app/version' % host)
log('/api/app/version HTTP %s' % st)
try:
    j = json.loads(body.decode('utf-8'))
    log('  ' + json.dumps({k: j.get(k) for k in ('status', 'version', 'versionCode', 'apkFileName', 'apkReady', 'forced')},
                          ensure_ascii=False))
    if j.get('version') != '1.41':
        fails.append('version != 1.41')
    if int(j.get('versionCode') or 0) != 42:
        fails.append('versionCode != 42')
    if j.get('apkReady') is not True:
        fails.append('apkReady != true')
    if not any('位置共享' in str(x) for x in (j.get('notes') or [])):
        fails.append('notes 未包含 R144 位置共享说明')
except Exception as e:
    fails.append('version 接口解析失败: %s' % e)
    j = {}

# 7.1 APK 公网可下载且 md5 一致
apk_url = j.get('apkUrl') or ''
log('  apkUrl = %s' % apk_url)
if apk_url:
    st2, b2 = http(apk_url)
    h2 = hashlib.md5(b2).hexdigest() if isinstance(b2, bytes) else '-'
    ok = (st2 == 200 and h2 == apk_md5)
    log('  APK 下载 status=%s size=%s md5=%s 一致=%s' % (st2, len(b2) if isinstance(b2, bytes) else '-', h2, ok))
    if not ok:
        fails.append('公网 APK 与本地不一致')
else:
    fails.append('apkUrl 为空')

# 7.2 页面戳 + 文案
TEXT_CASES = [
    ('私聊.html', ['?v=' + CHAT_STAMP], []),
    ('个人资料.html', ['?v=' + PROF_STAMP], []),
    ('关于.html', ['?v=' + STAMP_NEW], []),
    ('更多.html', ['?v=' + STAMP_NEW], []),
    ('更新.html', ['?v=' + STAMP_NEW], []),
    ('协议.html', ['V1.41'], ['V1.40']),
    ('live-location.html', ['function renderLinks', 'uri.amap.com/navigation', 'll-sheet'], []),
]
for pg, musts, mustnots in TEXT_CASES:
    st3, b3 = http('http://%s/%s?cb=%d' % (host, urllib.parse.quote(pg), time.time()),
                   {'Cache-Control': 'no-cache', 'User-Agent': 'r144-verify'})
    b = b3 if isinstance(b3, bytes) else b''
    miss = [x for x in musts if x.encode('utf-8') not in b]
    bad_ = [x for x in mustnots if x.encode('utf-8') in b]
    log('  %-18s status=%s 缺=%s 残留=%s' % (pg, st3, miss or '无', bad_ or '无'))
    if miss:
        fails.append('%s 缺 %s' % (pg, miss))
    if bad_:
        fails.append('%s 残留 %s' % (pg, bad_))

# 7.3 assets md5 与本地一致（web/{arc} 去掉 web/ 前缀即 URL 路径）
for arc in ['web/assets/chat-local.js', 'web/assets/xt-profile.js', 'web/assets/xt-update.js']:
    url = 'http://%s/%s?cb=%d' % (host, arc[len('web/'):], time.time())
    st4, b4 = http(url, {'Cache-Control': 'no-cache'})
    h4 = hashlib.md5(b4).hexdigest() if isinstance(b4, bytes) else '-'
    log('  %-24s status=%s md5=本地?%s' % (arc, st4, h4 == MD5[arc]))
    if h4 != MD5[arc]:
        fails.append('%s md5 不一致' % arc)

# 7.4 xt-update.js 内容版本
st5, b5 = http('http://%s/assets/xt-update.js?cb=%d' % (host, time.time()), {'Cache-Control': 'no-cache'})
mm = re.search(rb"CURRENT_VERSION\s*=\s*'([^']*)'", b5 if isinstance(b5, bytes) else b'')
log('  xt-update.js CURRENT_VERSION=%s' % (mm.group(1).decode() if mm else '?'))
if not (mm and mm.group(1) == b'1.41'):
    fails.append('xt-update.js CURRENT_VERSION 不是 1.41')

# 7.5 首页 + 关键接口健康
st6, _ = http('http://%s/' % host)
log('  首页 status=%s' % st6)
if st6 != 200:
    fails.append('首页非 200')

log('\n[回滚] cd %s && cp -r %s/web/* web/ 2>/dev/null; cp -r %s/server/* server/ 2>/dev/null; '
    'rm -f web/static/apk/%s; systemctl restart study-workbench' % (RR, BK, BK, APK_NAME))
log('\n验收失败项：%s' % (fails if fails else '无'))
log('R144_RELEASE_' + ('ALL_PASS' if not fails else 'HAS_FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
raise SystemExit(0 if not fails else 3)
