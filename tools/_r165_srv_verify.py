# -*- coding: utf-8 -*-
"""R165 服务端 3 文件上线后的只读验收（不重启、不改动任何东西）。

补齐 _r165_srv_deploy.py 末尾因 % 格式化崩溃而未写出的验收日志。
检查项：
  1) systemd active + MainPID + 8000 监听者 == MainPID（无孤儿）
  2) 线上 3 件 md5 == 本地 md5
  3) 代码标记：BLOCK_TTL_SECONDS / _blocked_active / _align_amount 存在，旧登记已清
  4) 接口：GET /api/ai/models、GET /api/ai/usage、GET / 均 200
  5) 行为探针：POST /api/ai/usage/consume(ok=false) 返回 status=unknown（旧代码为 exhausted）
"""
import os, io, re, json, hashlib, subprocess, urllib.request, urllib.error

ROOT = r'D:\下载的文件\学习工作台'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
OUT = os.path.join(ROOT, 'tools', '_r165_srv_verify_out.txt')
PROBE_ID = 'ark-seedance-1-0-pro'
FILES = ['server/quota_ledger.py', 'server/routers/ai.py', 'server/data/model_quota.json']

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

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


def http(path, timeout=40, data=None):
    try:
        rq = urllib.request.Request('http://' + host + path, method=('POST' if data is not None else 'GET'),
                                    data=(json.dumps(data).encode() if data is not None else None),
                                    headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                             'Content-Type': 'application/json', 'User-Agent': 'r165srv-verify'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, str(e).encode()


fails = []

log('===== 1) systemd / 8000 =====')
o, rc = plink("systemctl is-active study-workbench; "
              "MP=$(systemctl show study-workbench -p MainPID --value); echo MainPID=$MP; "
              "LP=$(ss -ltnp 2>/dev/null | grep ':8000' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2); "
              "echo listen_pid=$LP; "
              "if [ -n \"$LP\" ] && [ \"$LP\" != \"$MP\" ]; then echo ORPHAN_DETECTED; else echo NO_ORPHAN; fi; "
              "systemctl show study-workbench -p NRestarts -p ExecMainStatus")
log(o.strip())
if not o.startswith('active'):
    fails.append('服务未 active')
if 'NO_ORPHAN' not in o:
    fails.append('检测到孤儿进程')

log('\n===== 2) 3 件 md5（线上 vs 本地）=====')
o, rc = plink('cd ' + RR + ' && md5sum ' + ' '.join("'" + f + "'" for f in FILES))
log(o.strip())
seen = {}
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if mm:
        p = mm.group(2).strip().lstrip('*')
        seen[p[len(RR) + 1:] if p.startswith(RR + '/') else p] = mm.group(1)
for f in FILES:
    loc = hashlib.md5(open(os.path.join(ROOT, f.replace('/', os.sep)), 'rb').read()).hexdigest()
    ok = seen.get(f) == loc
    log('  %s %s  线上=%s 本地=%s' % ('MATCH  ' if ok else 'MISMATCH', f, seen.get(f), loc))
    if not ok:
        fails.append(f + ' md5 不一致')

log('\n===== 3) 代码标记 =====')
o, rc = plink("cd " + RR + " && "
              "printf 'BLOCK_TTL_SECONDS=%s\\n' $(grep -c 'BLOCK_TTL_SECONDS' server/quota_ledger.py); "
              "printf '_blocked_active=%s\\n' $(grep -c '_blocked_active' server/quota_ledger.py); "
              "printf '_align_amount=%s\\n' $(grep -c '_align_amount' server/routers/ai.py); "
              "printf 'seedance-1-0-pro残留=%s\\n' $(grep -cE '^ *\"ark-seedance-1-0-pro(-fast)?\" *:' server/data/model_quota.json); "
              "printf 'R156_note=%s\\n' $(grep -c '_r156_note' server/data/model_quota.json)")
log(o.strip())
for tag, key in (('BLOCK_TTL_SECONDS=', 'BLOCK_TTL_SECONDS'), ('_blocked_active=', '_blocked_active'),
                 ('_align_amount=', '_align_amount')):
    mm = re.search(re.escape(tag) + r'(\d+)', o)
    if not mm or int(mm.group(1)) < 1:
        fails.append(key + ' 标记缺失')
mm = re.search(r'seedance-1-0-pro残留=(\d+)', o)
if not mm or int(mm.group(1)) != 0:
    fails.append('model_quota.json 仍残留 ark-seedance-1-0-pro 登记')

log('\n===== 4) 接口 =====')
for p in ('/api/ai/models', '/api/ai/usage', '/'):
    st, b = http(p)
    log('  GET %-18s HTTP %s len=%s' % (p, st, len(b) if isinstance(b, bytes) else '-'))
    if st != 200:
        fails.append(p + ' HTTP %s' % st)

log('\n===== 5) 行为探针（ok=false 只加 failCalls）=====')
st, b = http('/api/ai/usage/consume', data={'modelId': PROBE_ID, 'amount': 1, 'ok': False})
try:
    j = json.loads(b.decode('utf-8'))
except Exception:
    j = None
log('  POST /api/ai/usage/consume %s -> HTTP %s  %s' % (PROBE_ID, st, j if j else b[:200]))
status = (j or {}).get('status')
if status == 'unknown':
    log('  ✅ status=unknown：线上额度表已无该按次登记（R156 生效）、且未判 exhausted（R151 自愈生效）')
    log('     （发版前同探针为 exhausted，见 _r165_srv_deploy_console.txt 第 13 行）')
else:
    fails.append('行为探针 status=%s（期望 unknown）' % status)

log('\n验收失败项：' + (str(fails) if fails else '无'))
log('R165SRV_VERIFY_' + ('ALL_PASS' if not fails else 'HAS_FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
raise SystemExit(0 if not fails else 3)
