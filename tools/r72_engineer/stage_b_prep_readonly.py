# -*- coding: utf-8 -*-
"""阶段B 前置（只读）：① 导出线上 users 盘点清单 ② 版本戳原始分布（未加工）。不写生产。"""
import os, re, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
OUT = os.path.join(ROOT, 'tools', 'r72_engineer', 'prep_readonly.txt')

src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)

def plink(cmd, timeout=90):
    return subprocess.run([PLINK, '-ssh', '-batch', '-pw', PASS, '-hostkey', HK, 'root@%s' % HOST, cmd],
                          capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)

L = []
def w(s=''):
    L.append(str(s))

# ① users 盘点
users_probe = (
 "cd /opt/study-workbench/server && python3 - <<'PYEOF'\n"
 "import sqlite3\n"
 "c = sqlite3.connect('data.db')\n"
 "cols = [r[1] for r in c.execute('PRAGMA table_info(users)').fetchall()]\n"
 "print('USERS_COLUMNS', cols)\n"
 "want = [x for x in ['id','username','nickname','created_at','is_admin'] if x in cols]\n"
 "print('EXPORT_COLUMNS', want)\n"
 "rows = c.execute('select ' + ','.join(want) + ' from users order by id').fetchall()\n"
 "print('USERS_COUNT', len(rows))\n"
 "for r in rows:\n"
 "    print('ROW|' + '|'.join('' if v is None else str(v) for v in r))\n"
 "PYEOF"
)
r = plink(users_probe)
w('== ① users 盘点（只读）rc=%d ==' % r.returncode)
w((r.stdout or '').replace('\r',''))
if r.stderr.strip():
    w('stderr: ' + r.stderr.replace('\r','').strip()[:300])

# ② 版本戳原始分布（未加工）
stamp_probe = (
 "cd /opt/study-workbench/web && python3 - <<'PYEOF'\n"
 "import glob, re, collections\n"
 "files = sorted(glob.glob('*.html'))\n"
 "print('HTML_FILES', len(files))\n"
 "cnt = collections.Counter()\n"
 "for f in files:\n"
 "    b = open(f,'rb').read().decode('utf-8','ignore')\n"
 "    for mm in re.finditer(r'\\?v=[0-9A-Za-z_\\-\\.]+', b):\n"
 "        cnt[mm.group(0)] += 1\n"
 "print('--- uniq -c (明文 token, count) ---')\n"
 "for tok, n in sorted(cnt.items(), key=lambda x: (-x[1], x[0])):\n"
 "    print('%6d  %s' % (n, tok))\n"
 "print('DISTINCT_TOKENS', len(cnt))\n"
 "PYEOF"
)
r = plink(stamp_probe)
w('\n== ② 版本戳原始分布（只读）rc=%d ==' % r.returncode)
w((r.stdout or '').replace('\r',''))
if r.stderr.strip():
    w('stderr: ' + r.stderr.replace('\r','').strip()[:300])

open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('WROTE', OUT)
