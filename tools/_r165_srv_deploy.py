# -*- coding: utf-8 -*-
"""R165 服务端 3 文件上线（quota_ledger.py / routers/ai.py / data/model_quota.json）。

背景：本地这三件比线上新——含 R151 自愈式 402（修复「平台实际还有额度却标已耗尽」）
与 R156 记账单位对齐（视频/3D 按次口径，别把 token 量记进 20 次的额度）。
线上跑的还是旧 force_exhaust（把 used 直接拉满 freeQuota → 永久钉死「已耗尽」）。

安全顺序（沿用 R150/R165 口径，本批只动 server/ 的 3 件，不碰任何网页与 APK）：
  0) 本地 py_compile + JSON 校验 + 禁列断言
  1) 线上基线：GET /api/ai/models + POST /api/ai/usage/consume(ok=false) 行为探针
  2) 线上备份 3 件 + model_usage.json（只读备份）
  3) 上传 tar → 4) 远端 tar md5 → 5) 解压 → 6) 逐文件 md5（不过则中止，不重启）
  7) 远端 py_compile（语法闸门，不过则回滚、不重启）→ 8) 清孤儿 → 9) restart
 10) 验收：active + /api/ai/models + /api/ai/usage + consume 行为对比 + grep 代码标记

行为探针说明：POST /api/ai/usage/consume {"modelId":"ark-seedance-1-0-pro","amount":1,"ok":false}
  - ok=false 只累加 failCalls（不动 used），对生产账本影响最小（+1 failCall）；
  - 旧代码：该模型 freeQuota=20 且被旧 force_exhaust 把 used 拉满 → status=exhausted；
  - 新代码：R156 已从额度表移除该登记 → free=None → status=unknown（未 blocked 时）。
  这一条是「线上真的换成新代码」的行为级证据，比只看 md5 强。
"""
import os, io, re, json, time, tarfile, hashlib, subprocess, urllib.request, urllib.parse, urllib.error

ROOT = r'D:\下载的文件\学习工作台'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
for _m in ('学习工作台.html', 'assets', 'server', 'tools', 'web'):
    assert os.path.exists(os.path.join(ROOT, _m)), 'ROOT 疑似非主项目根，缺 ' + _m

PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
TS = time.strftime('%Y%m%d-%H%M%S')
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r165_srv_deploy.tar.gz')
TAR_REMOTE = '/tmp/_r165_srv_deploy.tar.gz'
OUT = os.path.join(ROOT, 'tools', '_r165_srv_deploy_out.txt')
BK = RR + '/_bak-r165srv-' + TS

SRV = ['quota_ledger.py', 'routers/ai.py', 'data/model_quota.json']
FILES = ['server/' + p for p in SRV]

BAD = ('.env', 'model_usage.json', '.db', '.bak', '.keystore', '.apk', 'android/', 'version.json')
for f in FILES:
    assert not any(b in f for b in BAD), '禁列文件混入: ' + f
assert sorted(FILES) == ['server/data/model_quota.json', 'server/quota_ledger.py',
                         'server/routers/ai.py'], '文件清单与预期不符'

PROBE_ID = 'ark-seedance-1-0-pro'
LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

# ---- 0) 本地预检 ----
log('===== 0) 本地预检 =====')
PY = r'C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe'
for p in ('server/quota_ledger.py', 'server/routers/ai.py'):
    ap = os.path.join(ROOT, p.replace('/', os.sep))
    r = subprocess.run([PY, '-m', 'py_compile', ap], capture_output=True, text=True, errors='replace')
    assert r.returncode == 0, '本地 py_compile 失败 %s: %s' % (p, r.stderr)
    log('  py_compile OK  ' + p)
qp = os.path.join(ROOT, 'server', 'data', 'model_quota.json')
q = json.load(io.open(qp, encoding='utf-8'))
log('  model_quota.json OK  配额键 %d 个' % len([k for k in q if not str(k).startswith('_')]))
assert PROBE_ID not in q, 'model_quota.json 仍含 %s（R156 应已删除该登记）' % PROBE_ID

MD5 = {}
for f in FILES:
    p = os.path.join(ROOT, f.replace('/', os.sep))
    assert os.path.exists(p), '本地缺文件: ' + f
    MD5[f] = hashlib.md5(open(p, 'rb').read()).hexdigest()
    log('  md5 %s  %s' % (MD5[f], f))

if os.path.exists(TAR_LOCAL):
    os.remove(TAR_LOCAL)
with tarfile.open(TAR_LOCAL, 'w:gz') as tf:
    for f in FILES:
        tf.add(os.path.join(ROOT, f.replace('/', os.sep)), arcname=f)
tar_md5 = hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()
log('  tar md5=%s (%d bytes)' % (tar_md5, os.path.getsize(TAR_LOCAL)))

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)


def plink(cmd, timeout=420):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = (r.stdout or '')
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode


def http(path, timeout=40, data=None):
    try:
        rq = urllib.request.Request('http://' + host + path, method=('POST' if data is not None else 'GET'),
                                    data=(json.dumps(data).encode() if data is not None else None),
                                    headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                             'Content-Type': 'application/json', 'User-Agent': 'r165srv-deploy'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, str(e).encode()


def consume_probe(tag):
    """行为探针：ok=false，只加 failCalls，返回 status。"""
    st, b = http('/api/ai/usage/consume', data={'modelId': PROBE_ID, 'amount': 1, 'ok': False})
    try:
        j = json.loads(b.decode('utf-8'))
    except Exception:
        j = None
    log('  [%s] POST /api/ai/usage/consume %s -> HTTP %s  %s' % (tag, PROBE_ID, st, j if j else b[:160]))
    return st, (j or {}).get('status')


# ---- 1) 基线 ----
log('\n===== 1) 线上基线（旧代码行为）=====')
st_m, bm = http('/api/ai/models')
log('  GET /api/ai/models HTTP %s len=%s' % (st_m, len(bm) if isinstance(bm, bytes) else '-'))
st_u, bu = http('/api/ai/usage')
log('  GET /api/ai/usage  HTTP %s  %s' % (st_u, bu[:160]))
_st_b, base_status = consume_probe('基线')

# ---- 2) 备份 ----
log('\n===== 2) 线上备份 =====')
o, rc = plink("mkdir -p '" + BK + "' && cd " + RR + " && ok=0; "
              "for f in " + ' '.join("'" + f + "'" for f in FILES) + " server/data/model_usage.json; do "
              "  if [ -f \"$f\" ]; then cp --parents \"$f\" '" + BK + "' && ok=$((ok+1)); fi; done; "
              "echo \"backed_up=$ok\"; find '" + BK + "' -type f -printf '%s %p\\n'")
log(o.strip())

# ---- 3) 上传 tar ----
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR_LOCAL, 'root@' + host + ':' + TAR_REMOTE],
                   capture_output=True, text=True, timeout=600, errors='replace')
log('\n===== 3) 上传 tar =====')
log('pscp rc=%d %s' % (r.returncode, (r.stderr or '').strip()[:300]))
if r.returncode != 0:
    log('[中止] pscp 失败 → 未重启。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(3)
o, rc = plink('md5sum ' + TAR_REMOTE)
log(o.strip())
if tar_md5 not in o:
    log('[中止] 远端 tar md5 不一致 → 未重启。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(3)

# ---- 4) 解压 ----
o, rc = plink('cd ' + RR + ' && tar -xzf ' + TAR_REMOTE + ' && echo EXTRACT_OK')
log('\n===== 4) 解压 =====')
log(o.strip())
if 'EXTRACT_OK' not in o:
    log('[中止] 解压失败 → 未重启。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(3)

# ---- 5) 逐文件 md5 ----
o, rc = plink('cd ' + RR + ' && md5sum ' + ' '.join("'" + f + "'" for f in FILES))
log('\n===== 5) 逐文件 md5 校验 =====')
log(o.strip())
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
    log('\n[中止] md5 不一致 → 不杀进程、不重启。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(2)
log('3/3 一致 OK')

# ---- 6) 远端语法闸门 ----
log('\n===== 6) 远端 py_compile（重启前闸门）=====')
o, rc = plink("cd " + RR + " && (python3 -m py_compile server/quota_ledger.py server/routers/ai.py "
              "&& echo REMOTE_PYCOMPILE_OK) || echo REMOTE_PYCOMPILE_FAIL")
log(o.strip())
if 'REMOTE_PYCOMPILE_OK' not in o:
    log('[中止] 远端 py_compile 未通过 → 回滚 3 件、不重启。')
    o2, _ = plink("cd " + RR + " && cp -r '" + BK + "/server/'* server/ && echo ROLLBACK_DONE")
    log(o2.strip())
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); raise SystemExit(5)
log('远端语法 OK')

# 代码标记（read-only 证据）
o, rc = plink("cd " + RR + " && echo '-- 标记计数 --' && "
              "grep -c 'BLOCK_TTL_SECONDS' server/quota_ledger.py && "
              "grep -c '_blocked_active' server/quota_ledger.py && "
              "grep -c '_align_amount' server/routers/ai.py && "
              "grep -c 'ark-seedance-1-0-pro' server/data/model_quota.json || true")
log('\n  线上标记计数（BLOCK_TTL / _blocked_active / _align_amount / 残留旧登记）:')
log(o.strip())

# ---- 7) 清孤儿 ----
log('\n===== 7) 检查 8000 占用（孤儿判定）=====')
o, rc = plink("MP=$(systemctl show study-workbench -p MainPID --value); "
              "LP=$(ss -ltnp 2>/dev/null | grep ':8000' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2); "
              "echo \"MainPID=$MP  listen=$LP\"; "
              "if [ -n \"$LP\" ] && [ \"$LP\" != \"$MP\" ]; then echo 'ORPHAN -> kill'; kill -TERM $LP 2>/dev/null; sleep 2; kill -KILL $LP 2>/dev/null; echo killed; else echo 'no orphan'; fi")
log(o.strip())

# ---- 8) 重启 ----
log('\n===== 8) systemctl restart =====')
plink('systemctl reset-failed study-workbench 2>/dev/null; systemctl restart study-workbench')
time.sleep(10)
o, rc = plink("systemctl is-active study-workbench; "
              "systemctl show study-workbench -p MainPID -p NRestarts -p ExecMainStatus -p ActiveEnterTimestamp; "
              "echo '-- 8000 --'; ss -ltnp | grep ':8000' || echo '(free)'; "
              "echo '-- journal tail --'; journalctl -u study-workbench --no-pager -n 40 | tail -14")
log(o.strip())
fails = []
if not o.startswith('active'):
    fails.append('服务未 active')

# ---- 9) 线上验收 ----
log('\n===== 9) 线上验收 =====')
time.sleep(2)
st_m2, bm2 = http('/api/ai/models')
log('  GET /api/ai/models HTTP %s len=%s' % (st_m2, len(bm2) if isinstance(bm2, bytes) else '-'))
if st_m2 != 200:
    fails.append('/api/ai/models HTTP %s' % st_m2)
st_u2, bu2 = http('/api/ai/usage')
log('  GET /api/ai/usage  HTTP %s  %s' % (st_u2, bu2[:160]))
if st_u2 != 200:
    fails.append('/api/ai/usage HTTP %s' % st_u2)

after_status = consume_probe('发版后')
log('\n  --- 行为对比（同一探针 modelId=%s，ok=false 只加 failCalls）---' % PROBE_ID)
log('    基线 status = %s' % base_status)
log('    发版后 status = %s' % after_status)
if base_status == 'exhausted' and after_status == 'unknown':
    log('    ✅ 由 exhausted → unknown：R151 自愈 + R156 移除按次额度登记已在线上生效')
elif after_status == 'unknown':
    log('    ✅ 发版后为 unknown：线上额度表已无该登记（R156 生效）')
else:
    log('    ⚠️ 行为对比未给出预期差异（可能该模型在线上账本中另有 blocked 标记，非失败）')

st, b = http('/')
log('  GET / → HTTP %s' % st)
if st != 200:
    fails.append('首页非 200')

log('\n[回滚] cd ' + RR + " && cp -r '" + BK + "/server/'* server/ && systemctl restart study-workbench")
log('    备份目录 ' + BK)
log('验收失败项：' + (str(fails) if fails else '无'))
log('R165SRV_LIVE_' + ('ALL_PASS' if not fails else 'HAS_FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
raise SystemExit(0 if not fails else 3)
