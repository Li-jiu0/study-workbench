# -*- coding: utf-8 -*-
"""R171 发版前：比对「本地 vs 线上」每个变更资产的 md5，精确判定哪些需要 bump 缓存戳。只读，不写盘。"""
import hashlib
import io
import os
import re
import subprocess

ROOT = r"D:\下载的文件\学习工作台"
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'

ASSETS = ['assets/admin-ops.js', 'assets/admin.css', 'assets/admin.js', 'assets/api.js',
          'assets/app.js', 'assets/mock-result.js', 'assets/subpage-router.js',
          'assets/topic-express.js', 'assets/xt-announce.js', 'assets/xt-applist.js',
          'assets/xt-moments.js', 'assets/xt-topbar.css', 'assets/xt-update.js']

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)

local = {}
for a in ASSETS:
    p = os.path.join(ROOT, a.replace('/', os.sep))
    local[a] = hashlib.md5(io.open(p, 'rb').read()).hexdigest() if os.path.isfile(p) else None

remote_list = ' '.join("'%s/web/%s'" % (RR, a) for a in ASSETS)
cmd = 'cd ' + RR + ' && for f in ' + ' '.join("'web/%s'" % a for a in ASSETS) + '; do \
      if [ -f "$f" ]; then echo "$(md5sum "$f" | cut -d" " -f1)  $f"; else echo "MISSING  $f"; fi; done'
r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                   capture_output=True, text=True, timeout=300, errors='replace')

remote = {}
for ln in (r.stdout or '').splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+web/(.+)$', ln.strip())
    if mm:
        remote[mm.group(2).strip()] = mm.group(1)
    else:
        mm2 = re.match(r'^MISSING\s+web/(.+)$', ln.strip())
        if mm2:
            remote[mm2.group(1).strip()] = None

out = ['== 本地 vs 线上 逐资产 md5（线上根 %s）==' % RR,
       'plink rc=%d  stderr=%s' % (r.returncode, (r.stderr or '').strip()[:200]), '']
need_bump, same, missing = [], [], []
for a in ASSETS:
    lv, rv = local[a], remote.get(a)
    if rv is None and a not in remote:
        verdict = 'REMOTE_UNKNOWN'
    elif rv is None:
        verdict = 'REMOTE_MISSING'
        missing.append(a)
    elif lv == rv:
        verdict = 'SAME'
        same.append(a)
    else:
        verdict = 'DIFFER'
        need_bump.append(a)
    out.append('  %-26s local=%s remote=%s  -> %s' % (a, (lv or '-')[:12], (rv or '-')[:12], verdict))

out.append('')
out.append('== 结论 ==')
out.append('  需要 bump 缓存戳（DIFFER + MISSING，%d）：%s' % (len(need_bump + missing), ', '.join(need_bump + missing) or '（无）'))
out.append('  内容已一致、无需 bump（SAME，%d）：%s' % (len(same), ', '.join(same) or '（无）'))

# xt-topbar.css 的引用方式
out.append('')
out.append('== xt-topbar.css / xt-announce.js 的引用方式 ==')
import glob
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    n = os.path.basename(p)
    if n.startswith('_'):
        continue
    t = io.open(p, encoding='utf-8', errors='replace').read()
    for kw in ('xt-topbar.css', 'xt-announce.js'):
        for mm3 in re.finditer(re.escape(kw), t):
            ln_no = t[:mm3.start()].count('\n') + 1
            out.append('  %-22s L%-5d %s' % (n, ln_no, t.splitlines()[ln_no - 1].strip()[:140]))

io.open(os.path.join(ROOT, 'tools', 'qa', '_r171_stamp_need.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('NEED_BUMP=%d SAME=%d MISSING=%d' % (len(need_bump), len(same), len(missing)))
