# -*- coding: utf-8 -*-
"""R2A 部署后独立复核（只读）：不依赖部署脚本自身输出，直连生产取 ground truth"""
import os, re, io, json, subprocess

ROOT = r'D:\下载的文件\学习工作台'
WT = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3'
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
OUT = os.path.join(WT, '_r2a_postverify.txt')

s = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
pwd, host = m.group(1), m.group(2)

SH = r'''echo "=== A) 站点与接口 ==="
for u in "http://127.0.0.1/" "http://127.0.0.1:8000/api/health" "http://127.0.0.1/api/app/version" \
         "http://127.0.0.1/%E5%8D%8F%E8%AE%AE.html" "http://127.0.0.1/%E6%95%B0%E6%8D%AE%E7%AE%A1%E7%90%86.html" \
         "http://127.0.0.1/assets/img-viewer.js" "http://127.0.0.1/live-location.html"; do
  printf "  %-58s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' "$u")"
done
echo "=== B) 带戳真实拉取（模拟客户端）==="
python3 - <<'PYEOF'
import urllib.request, urllib.error
def get(u):
    try:
        return urllib.request.urlopen(u, timeout=15).read()
    except Exception as e:
        return b''
checks = [
  ('/assets/app.js?v=20260922c', [b'aiStreamOn', b'applyStudyReminder', b'aiContext']),
  ('/assets/api.js?v=20260922c', [b'aiStreamOn', b'bridge as']),
  ('/assets/img-viewer.js?v=20260922c', [b'ImgViewer', b'xtSaveImage', b'saveImageToGallery']),
  ('/%E5%8D%8F%E8%AE%AE.html', ['用户服务协议'.encode(), '隐私政策'.encode(), '九、法律适用与争议解决'.encode()]),
  ('/%E6%95%B0%E6%8D%AE%E7%AE%A1%E7%90%86.html', ['存储空间'.encode(), b'dmRenderCats', b'dmBackup']),
  ('/%E5%85%B3%E4%BA%8E.html', [b'aboutVersion', '工具与管理'.encode(), b'XT_VERSION']),
  ('/%E8%AE%BE%E7%BD%AE.html', ['数据管理'.encode()]),
  ('/assets/xt-update.js?v=20260922c', [b'window.XT_VERSION']),
  ('/assets/ai-cap-3d.js?v=20260922c', [b'rj.modelUrl']),
]
for path, kws in checks:
    b = get('http://127.0.0.1' + path)
    print('  %-40s len=%-7d %s' % (path[:40], len(b), {k.decode('utf-8','ignore') if isinstance(k,bytes) else k: (k in b) for k in kws}))
PYEOF
echo "=== C) 服务端符号（生产实文件）==="
python3 - <<'PYEOF'
import io, json
S='/opt/study-workbench/server'
def t(p):
    return io.open(p, encoding='utf-8', errors='ignore').read()
lv=t(S+'/routers/liveloc.py'); ai=t(S+'/routers/ai.py')
reg=json.loads(io.open(S+'/data/model_registry.json',encoding='utf-8').read())
quo=json.loads(io.open(S+'/data/model_quota.json',encoding='utf-8').read())
print('  liveloc sessions=%d hasFix=%d sharerId=%d _active=%d'%(lv.count('"sessions"'),lv.count('hasFix'),lv.count('sharerId'),lv.count('def _active')))
print('  ai.py _c-dict守卫=%d  modelUrl=%d'%(ai.count('isinstance(_c, dict)'),ai.count('modelUrl')))
print('  registry hyper3d-gen2=%s  keys=%d'%('ark-hyper3d-gen2' in reg, len(reg)))
print('  quota   hyper3d-gen2=%s'%('ark-hyper3d-gen2' in quo))
PYEOF
echo "=== D) 数据库与日志 ==="
python3 -c "import sqlite3;c=sqlite3.connect('/opt/study-workbench/server/data.db');print('  users=',c.execute('select count(*) from users').fetchone()[0]);print('  tables=',c.execute(\"select count(*) from sqlite_master where type='table'\").fetchone()[0])"
echo "  近10分钟 traceback/500 计数: $(journalctl -u study-workbench --since -10min 2>/dev/null | grep -icE 'traceback|internal server error' || true)"
systemctl is-active study-workbench
echo "  备份目录:"; ls -1 /opt/study-workbench/backups/ 2>/dev/null | tail -4
echo "=== E) 页戳抽查 ==="
python3 - <<'PYEOF'
import re, io, glob, collections
c = collections.Counter()
for f in ['/opt/study-workbench/web/\u66f4\u591a.html', '/opt/study-workbench/web/\u8bbe\u7f6e.html', '/opt/study-workbench/web/\u5173\u4e8e.html']:
    t = io.open(f, encoding='utf-8', errors='ignore').read()
    print('  %-22s %s' % (f.split('/')[-1], re.findall(r'assets/(?:app|api|img-viewer|xt-update)\.js\?v=[0-9A-Za-z]+', t)))
PYEOF
'''
sh = os.path.join(ROOT, '_r2a_post.sh')
io.open(sh, 'w', encoding='utf-8', newline='\n').write(SH)
subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, sh, 'root@%s:/tmp/_r2a_post.sh' % host],
               capture_output=True, text=True, timeout=300, errors='replace')
r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host,
                    'bash /tmp/_r2a_post.sh'], capture_output=True, text=True, timeout=900, errors='replace')
txt = (r.stdout or '') + '\n[ERR]\n' + (r.stderr or '')
io.open(OUT, 'w', encoding='utf-8').write(txt)
print(txt)
