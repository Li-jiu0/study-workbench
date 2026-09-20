# -*- coding: utf-8 -*-
# 只读：部署前预快照——逐文件比对「本地 MD5 vs 生产 MD5」，列出 改动/新增/未变
import os, io, re, subprocess, hashlib, base64, json

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
OUT = os.path.join(ROOT, 'tools', 'r72_presnap_out.txt')

EXCLUDE_HTML = {'blog_wechat.html'}
ASSETS = ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js']

htmls = sorted([n for n in os.listdir(ROOT)
                if n.lower().endswith('.html') and os.path.isfile(os.path.join(ROOT, n))
                and n not in EXCLUDE_HTML])

def md5f(p):
    with open(p, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

man = {}
for h in htmls:
    man['web/' + h] = md5f(os.path.join(ROOT, h))
for a in ASSETS:
    man['web/assets/' + a] = md5f(os.path.join(ROOT, 'assets', a))
keys = sorted(man)
b64 = base64.b64encode(json.dumps(man, ensure_ascii=False).encode('utf-8')).decode('ascii')

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    pwd, host = m.group(1), m.group(2)

remote_py = "\n".join([
    "import os, io, hashlib, base64, json",
    "ROOT='/opt/study-workbench'",
    "man=json.loads(base64.b64decode('" + b64 + "').decode('utf-8'))",
    "keys=sorted(man)",
    "changed=[]; new=[]; unchanged=[]",
    "for k in keys:",
    "    p=os.path.join(ROOT,k)",
    "    if not os.path.exists(p): new.append(k); continue",
    "    h=hashlib.md5(io.open(p,'rb').read()).hexdigest()",
    "    (unchanged if h==man[k] else changed).append(k)",
    "print('PRESNAP changed=%d new=%d unchanged=%d' % (len(changed),len(new),len(unchanged)))",
    "print('CHANGED=%s' % '|'.join(changed))",
    "print('NEW=%s' % '|'.join(new))",
    "print('UNCHANGED=%s' % '|'.join(unchanged))",
])
remote_cmd = "python3 - <<'PYEOF'\n" + remote_py + "\nPYEOF"

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, remote_cmd],
                   capture_output=True, text=True, timeout=180, errors='replace')
res = ['RC=%d' % r.returncode, r.stdout or '', '[STDERR] ' + (r.stderr or '')]
with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(res))
print('PRESNAP DONE rc=%d' % r.returncode)
