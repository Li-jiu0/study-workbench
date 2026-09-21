# -*- coding: utf-8 -*-
"""R2A 部署前只读预检：
 1) 本地全站引用的 assets/* 资源 → 生产存在性差集（预判 404 清单）
 2) 本批改动文件 本地md5 vs 生产md5
 3) 生产 server 侧关键文件 md5（供 3 层差异预检做基线）
凭据从 upload_v23.ps1 正则提取，不打印明文。
"""
import os, re, io, json, hashlib, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
WT = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
OUT = os.path.join(WT, '_r2a_preflight_out.txt')

src = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
pwd, host = m.group(1), m.group(2)

# ---- 本地：全站被引用的 assets 资源集合 ----
refs = set()
for fn in os.listdir(ROOT):
    if not fn.endswith('.html') or '.bak' in fn:
        continue
    t = io.open(os.path.join(ROOT, fn), encoding='utf-8', errors='replace').read()
    for mm in re.finditer(r'(?:src|href)\s*=\s*["\'](assets/[^"\'?]+)', t):
        refs.add(mm.group(1))
# 本批改动文件
BATCH = [
    'assets/app.js', 'assets/api.js', 'assets/xt-settings.js', 'assets/xt-update.js',
    'assets/chat-local.js', 'assets/xt-moments.js', 'assets/img-viewer.js',
    '关于.html', '设置.html', '个人中心.html', '私聊.html', '动态空间.html',
    '我的动态.html', '朋友圈发布.html', '协议.html', '数据管理.html',
    '更多.html',
]
local_md5 = {}
for rel in sorted(set(BATCH) | refs):
    p = os.path.join(ROOT, rel)
    if os.path.isfile(p):
        local_md5[rel] = hashlib.md5(open(p, 'rb').read()).hexdigest()

payload = {'refs': sorted(refs), 'want': sorted(set(BATCH) | refs)}
sh = '''python3 - <<'PYEOF'
import io, os, hashlib, json
WEB = '/opt/study-workbench/web'
SRV = '/opt/study-workbench/server'
PAY = json.loads(io.open('/tmp/_r2a_payload.json', encoding='utf-8').read())
def m5(p):
    try:
        return hashlib.md5(io.open(p, 'rb').read()).hexdigest()
    except Exception:
        return None
print('@@REFCHECK@@')
miss = []
for rel in PAY['refs']:
    if m5(os.path.join(WEB, rel)) is None:
        miss.append(rel)
print(json.dumps({'missing': miss}, ensure_ascii=False))
print('@@WANTMD5@@')
out = {}
for rel in PAY['want']:
    out[rel] = m5(os.path.join(WEB, rel))
print(json.dumps(out, ensure_ascii=False))
print('@@SERVERMD5@@')
s = {}
for rel in ['routers/liveloc.py', 'routers/ai.py', 'routers/moments.py', 'routers/social.py',
            'routers/admin.py', 'routers/geo.py', 'routers/update.py', 'routers/version.json',
            'data/model_registry.json', 'data/model_quota.json', 'main.py', 'schemas.py', 'database.py']:
    s[rel] = m5(os.path.join(SRV, rel))
print(json.dumps(s, ensure_ascii=False))
PYEOF
'''
sh_local = os.path.join(ROOT, '_r2a_preflight.sh')
io.open(sh_local, 'w', encoding='utf-8', newline='\n').write(sh)
pj = os.path.join(ROOT, '_r2a_payload.json')
io.open(pj, 'w', encoding='utf-8', newline='\n').write(json.dumps(payload, ensure_ascii=False))

for a, b in [(sh_local, '/tmp/_r2a_preflight.sh'), (pj, '/tmp/_r2a_payload.json')]:
    r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, a, 'root@%s:%s' % (host, b)],
                       capture_output=True, text=True, timeout=300, errors='replace')
    if r.returncode != 0:
        print('pscp fail', b, r.stderr[-200:]); sys.exit(2)

r2 = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host,
                     'bash /tmp/_r2a_preflight.sh'], capture_output=True, text=True,
                    timeout=600, errors='replace')
txt = r2.stdout or ''
io.open(os.path.join(WT, '_r2a_preflight_raw.txt'), 'w', encoding='utf-8').write(txt + '\n[ERR]\n' + (r2.stderr or ''))

def grab(tag):
    i = txt.find(tag)
    if i < 0:
        return None
    j = txt.find('@@', i + len(tag))
    seg = txt[i + len(tag): j if j > 0 else None].strip()
    try:
        return json.loads(seg)
    except Exception:
        return None

rep = []
rep.append('=== 1) 生产缺失资源（本地引用了但线上没有 → 部署后会 404） ===')
miss = grab('@@REFCHECK@@') or {}
for x in (miss.get('missing') or []):
    rep.append('   404风险: ' + x)
rep.append('   合计 %d 个' % len(miss.get('missing') or []))
rep.append('')
rep.append('=== 2) 本批改动文件 本地 vs 生产 md5 ===')
prod = grab('@@WANTMD5@@') or {}
same = 0
for rel in sorted(set(BATCH) | refs):
    lp = os.path.join(ROOT, rel)
    lm = hashlib.md5(open(lp, 'rb').read()).hexdigest() if os.path.isfile(lp) else 'LOCAL_MISSING'
    pm = prod.get(rel)
    st = 'SAME' if pm == lm else ('PROD_MISSING' if pm is None else 'DIFF')
    if st == 'SAME':
        same += 1
    if rel in BATCH or st != 'SAME':
        rep.append('   %-28s %-13s local=%s prod=%s' % (rel, st, lm[:10], (pm or '-')[:10]))
rep.append('   相同数=%d  参与比对=%d' % (same, len(set(BATCH) | refs)))
rep.append('')
rep.append('=== 3) 生产 server 侧 md5（3 层差异预检基线） ===')
srv = grab('@@SERVERMD5@@') or {}
for k in sorted(srv):
    lp = os.path.join(ROOT, 'server', k)
    lm = hashlib.md5(open(lp, 'rb').read()).hexdigest() if os.path.isfile(lp) else 'LOCAL_MISSING'
    rep.append('   %-28s prod=%s local=%s %s' % (k, (srv[k] or 'MISSING')[:10], lm[:10],
                                                 '' if srv[k] == lm else '<== 不一致'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
print('\n'.join(rep))
