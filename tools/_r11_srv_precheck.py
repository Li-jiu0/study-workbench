# -*- coding: utf-8 -*-
"""
R11 服务端差异预检：把线上 4 个待覆盖文件拉回，与本地逐行 diff。
铁律：本地 server/ 是旧副本 → 只传改动文件且必做差异预检，确认上传不会回退线上更新的内容。
"""
import os, re, io, base64, subprocess, difflib, json

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
REMOTE_ROOT = '/opt/study-workbench'
TMP = os.path.join(ROOT, 'tools', '_r11_srv_live')
FILES = ['server/config.py', 'server/routers/ai.py',
         'server/data/model_registry.json', 'server/data/model_quota.json']

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)
os.makedirs(TMP, exist_ok=True)

def plink(cmd, timeout=90):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    return (r.stdout or '')

out = []
for rel in FILES:
    remote = REMOTE_ROOT + '/' + rel
    b64 = plink('base64 -w0 %s 2>/dev/null || echo __MISSING__' % remote)
    if '__MISSING__' in b64 or not b64.strip():
        out.append('[缺失] 线上无此文件: %s' % rel); continue
    raw = base64.b64decode(b64.strip())
    lp = os.path.join(TMP, rel.replace('/', '__'))
    io.open(lp, 'wb').write(raw)
    local = io.open(os.path.join(ROOT, rel.replace('/', os.sep)), 'rb').read()
    out.append('=' * 78)
    out.append('%s  线上 %d B / 本地 %d B  相同=%s' % (rel, len(raw), len(local), raw == local))
    if raw == local:
        continue
    lt = local.decode('utf-8', 'replace').splitlines()
    rt = raw.decode('utf-8', 'replace').splitlines()
    d = list(difflib.unified_diff(rt, lt, fromfile='线上', tofile='本地(将上传)', lineterm='', n=1))
    out.append('  diff 行数=%d（正=本地新增，负=会从线上删掉）' % len(d))
    out.extend('  ' + x[:220] for x in d[:120])
    if len(d) > 120:
        out.append('  ... 其余 %d 行见 %s' % (len(d) - 120, TMP))

# 运行期写入检查：model_quota.json 是否被服务端写过用量
q = json.load(io.open(os.path.join(TMP, 'server__data__model_quota.json'), encoding='utf-8'))
runtime_keys = [k for k in q if not str(k).startswith('_') and isinstance(q[k], dict)
                and any(kk in q[k] for kk in ('used', 'count', 'consumed', 'usedCount', 'usedTokens'))]
out.append('=' * 78)
out.append('model_quota.json 含运行期用量字段的键数 = %d %s' % (len(runtime_keys), runtime_keys[:8]))
out.append('model_quota.json 顶层备注键 = %s' % [k for k in q if str(k).startswith('_')])

txt = '\n'.join(out)
io.open(os.path.join(ROOT, 'tools', '_r11_srv_diff.txt'), 'w', encoding='utf-8').write(txt)
print(txt[:6000])
