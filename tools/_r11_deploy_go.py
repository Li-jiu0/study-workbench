# -*- coding: utf-8 -*-
"""R11 web-only 部署执行（安全顺序）：
  上传 tar → 远端 md5 校验 tar → 解压 → 逐文件 md5 校验（不过则不杀进程、不重启）
  → 清理 17:37 遗留的孤儿 uvicorn + /tmp/r11h_stage3.sh → systemctl restart → 线上验收。
严格不触碰 version.json / *.apk / android/**（用户明确：本轮只上线 web，不打包 APK）。
"""
import os, re, io, time, json, hashlib, subprocess, urllib.request, urllib.parse

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'

PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r11_deploy.tar.gz')
TAR_REMOTE = '/tmp/_r11_deploy.tar.gz'
OUT = os.path.join(ROOT, 'tools', '_r11_deploy_go_out.txt')

M = json.load(io.open(os.path.join(ROOT, 'tools', '_r11_manifest.json'), encoding='utf-8'))
MD5 = M['md5']; STAMP = M['stamp']; ARCS = sorted(MD5)
tar_local_md5 = hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()
tar_local_size = os.path.getsize(TAR_LOCAL)

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)

def plink(cmd, timeout=240):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = (r.stdout or '')
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode

log('目标 root@%s   stamp=%s   包内 %d 条  本地 tar md5=%s (%d bytes)'
    % (host, STAMP, len(ARCS), tar_local_md5, tar_local_size))
assert not any(a.endswith(('.apk', 'version.json')) for a in ARCS), '清单混入禁列文件'

# ---------- 1) 上传 tar ----------
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR_LOCAL, 'root@%s:%s' % (host, TAR_REMOTE)],
                   capture_output=True, text=True, timeout=300, errors='replace')
log('\n===== 1) 上传 =====')
log('pscp rc=%d %s %s' % (r.returncode, (r.stdout or '').strip()[:200], (r.stderr or '').strip()[:200]))
o, rc = plink('md5sum %s; stat -c "%%s bytes" %s' % (TAR_REMOTE, TAR_REMOTE))
log(o.rstrip())
assert tar_local_md5 in o, '远端 tar md5 与本地不一致 → 终止'

# ---------- 2) 解压 ----------
o, rc = plink('cd %s && tar -xzf %s && echo EXTRACT_OK' % (RR, TAR_REMOTE), timeout=300)
log('\n===== 2) 解压 =====')
log(o.rstrip())
assert 'EXTRACT_OK' in o, '解压失败 → 终止（未杀进程、未重启）'

# ---------- 3) 逐文件 md5 校验 ----------
paths = [RR + '/' + a for a in ARCS]
o, rc = plink('cd %s && md5sum %s' % (RR, ' '.join("'%s'" % p for p in paths)), timeout=180)
log('\n===== 3) 逐文件 md5 校验 =====')
bad = []
seen = {}
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if not mm:
        continue
    h, p = mm.group(1), mm.group(2).strip()
    p = p.lstrip('*')
    rel = p[len(RR) + 1:] if p.startswith(RR + '/') else p
    seen[rel] = h
for a in ARCS:
    if seen.get(a) != MD5[a]:
        bad.append((a, MD5[a], seen.get(a)))
log('校验: 命中 %d/%d, 不一致 %d' % (len(seen), len(ARCS), len(bad)))
for b in bad:
    log('  MISMATCH %s  期望=%s 实际=%s' % b)
if bad:
    log('\n[中止] md5 不一致 → 不杀进程、不重启；线上仍由原进程服务。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(2)
log('全部一致 ✅')

# ---------- 4) 清理遗留孤儿 uvicorn + r11h stage3 脚本 ----------
log('\n===== 4) 清理遗留（根因：/tmp/r11h_stage3.sh 手工 uvicorn 占 8000） =====')
clean = (
    "echo '-- kill parent stage3 --'; kill TERM 3756520 2>/dev/null; sleep 1; kill KILL 3756520 2>/dev/null; "
    "echo '-- kill orphan uvicorn --'; kill TERM 3756522 2>/dev/null; sleep 2; kill KILL 3756522 2>/dev/null; "
    "echo '-- 残留 uvicorn（应为空）--'; ps -eo pid,ppid,cmd | grep -E 'uvicorn main:app' | grep -v grep || echo '(none)'; "
    "echo '-- 8000 占用（应为空）--'; ss -ltnp | grep ':8000' || echo '(free)'; "
    "rm -f /tmp/r11h_stage3.sh /tmp/r11h_stage2.sh"
)
o, rc = plink(clean)
log(o.rstrip())

# ---------- 5) 重启托管服务 ----------
log('\n===== 5) systemctl restart study-workbench =====')
plink('systemctl reset-failed study-workbench 2>/dev/null; systemctl restart study-workbench')
time.sleep(6)
o, rc = plink(
    "systemctl is-active study-workbench; systemctl show study-workbench -p MainPID -p NRestarts -p ExecMainStatus; "
    "echo '-- 8000 绑定者 --'; ss -ltnp | grep ':8000' || echo '(free)'; "
    "echo '-- 最近日志 --'; journalctl -u study-workbench --no-pager -n 12")
log(o.rstrip())

# ---------- 6) 线上验收 ----------
log('\n===== 6) 线上验收 =====')
def http(url, headers=None, timeout=25):
    try:
        rq = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(rq, timeout=timeout) as resp:
            return resp.status, resp.read()
    except Exception as e:
        return None, str(e).encode()

st, body = http('http://110.42.134.62/assets/ai-config.js?cachebust=%d' % time.time(),
                {'User-Agent': 'r11-verify', 'Cache-Control': 'no-cache'})
log('ai-config.js: status=%s md5=%s 零key=%s' % (st, hashlib.md5(body).hexdigest() if isinstance(body, bytes) and st == 200 else '-',
                                            (b'AQ.' not in body) if isinstance(body, bytes) else '-'))

st2, b2 = http('http://110.42.134.62/api/ai/models')
log('/api/ai/models: status=%s' % st2)
if st2 == 200:
    try:
        j = json.loads(b2.decode('utf-8'))
        provs = j.get('providers') or j.get('data') or j
        if isinstance(provs, list):
            for p in provs:
                if isinstance(p, dict) and p.get('id') in ('gemini', 'openrouter'):
                    log('  %s relayAvailable=%s models=%s' % (p.get('id'), p.get('relayAvailable'), len(p.get('models') or [])))
        else:
            log('  (结构) keys=%s' % list(j.keys())[:8])
    except Exception as e:
        log('  parse err %s' % e)

stamp_hits = 0
for pg in ['AI.html', '数据管理.html', '日志.html', '设置.html', '个人中心.html']:
    st3, b3 = http('http://110.42.134.62/' + urllib.parse.quote(pg), {'User-Agent': 'r11-verify', 'Cache-Control': 'no-cache'})
    hit = STAMP.encode() in b3 if isinstance(b3, bytes) else False
    stamp_hits += 1 if hit else 0
    log('  %-14s status=%s 含新戳=%s' % (pg, st3, hit))
log('含新戳页 %d/5' % stamp_hits)

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
