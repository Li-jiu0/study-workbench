# -*- coding: utf-8 -*-
"""20260917R72 前端部署：任务三批（主页改造/我的文件 + 导入题库 + importer 接线 + 通知桥 + 安卓壳前端对接）

以 deploy_update_20260916o.py 为模板（保留其结构：打包 -> 上传 -> 远端解包 -> 探活/校验），
本批差异：
  1) 本脚本不改任何版本戳（戳已由打戳环节 bump 到 20260916S）。
  2) 只上传「本批内容改动的 7 个资产」，不整目录上传 assets/。
  3) 上传走 ASCII 名 tar（/tmp/frontend_r72_20260917.tar.gz）-> 远端 python3 tarfile 以 UTF-8 落位 -> 逐文件 MD5 全量比对。
  4) 内置 3 道闸（SOP 5.0.1），任一不过 sys.exit(N) 中止。

环境变量：SW_HOST / SW_PASS 可覆盖凭据；SW_DRY_RUN=1 只做本地闸+打包，不上传。
"""
import os, io, sys, glob, tarfile, subprocess, re, hashlib, base64, json

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916S'
TAR = os.path.join(ROOT, 'tools', 'frontend_r72_20260917.tar.gz')
REMOTE_TAR = '/tmp/frontend_r72_20260917.tar.gz'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
OUT = r'C:\Users\ATM\_dep_r72_out.txt'
LOG = []

EXCLUDE_HTML = {'blog_wechat.html'}
ASSETS = ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js']
EOL_LF_EXCEPT = {'ai-settings.html'}

htmls = sorted([n for n in os.listdir(ROOT)
                if n.lower().endswith('.html') and os.path.isfile(os.path.join(ROOT, n))
                and n not in EXCLUDE_HTML])
LOG.append('部署 HTML = %d 个（42 根 HTML 排除 blog_wechat）' % len(htmls))
LOG.append('部署 assets = %d 个 %s' % (len(ASSETS), ASSETS))
if len(htmls) != 41:
    LOG.append('!!! 预期 41 个 HTML，实得 %d' % len(htmls))
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); print('\n'.join(LOG)); sys.exit(1)

# ---------- 闸1 行尾闸 ----------
eol_bad = []
for h in htmls:
    with open(os.path.join(ROOT, h), 'rb') as f:
        b = f.read()
    crlf = b.count(b'\r\n'); lone = b.count(b'\n') - crlf
    if h in EOL_LF_EXCEPT:
        if not (crlf == 0 and lone > 0):
            eol_bad.append((h, 'EXCEPT_NOT_PURE_LF', 'CRLF=%d loneLF=%d' % (crlf, lone)))
    else:
        if lone != 0:
            eol_bad.append((h, 'LONE_LF', lone))
LOG.append('闸1 行尾：%d 个 HTML，违规 %d %s' % (len(htmls), len(eol_bad), eol_bad if eol_bad else ''))
if eol_bad:
    LOG.append('!!! 闸1 行尾失败，中止部署')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); print('\n'.join(LOG)); sys.exit(3)

# ---------- 打包 ----------
with tarfile.open(TAR, 'w:gz') as tar:
    for h in htmls:
        tar.add(os.path.join(ROOT, h), arcname='web/' + h)
    for a in ASSETS:
        tar.add(os.path.join(ROOT, 'assets', a), arcname='web/assets/' + a)
names = tarfile.open(TAR).getnames()
tar_bytes = os.path.getsize(TAR)
LOG.append('打包 %d 个成员, %d bytes -> %s' % (len(names), tar_bytes, os.path.basename(TAR)))
if len(names) != 48:
    LOG.append('!!! tar 成员数异常 %d（预期 48）' % len(names))
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); print('\n'.join(LOG)); sys.exit(4)

# ---------- 闸2 新增符号闸 ----------
def tar_read(path):
    with tarfile.open(TAR) as t:
        try:
            return t.extractfile(path).read()
        except Exception:
            return None

SYM = [
    ('web/assets/importer.js', 'xtFilesRegister'),
    ('web/我的文件.html', 'xtFilesRender'),
    ('web/我的文件.html', 'mfList'),
    ('web/导入题库.html', 'openImporter'),
    ('web/assets/chat-local.js', 'imOpenRemarkEditor'),
    ('web/assets/api.js', 'apiGetChatConversations'),
    ('web/assets/app.js', 'AndroidBridge.notify'),
    ('web/assets/ai-service.js', 'allowPreset'),
    ('web/assets/ai-settings.js', 'BATCH_CONCURRENCY'),
    ('web/assets/ai-settings.js', '识图'),
    ('web/登录.html', '祝君一切安好'),
]
sym_bad = []
for path, tok in SYM:
    data = tar_read(path)
    if data is None:
        sym_bad.append((path, 'READ_FAIL')); continue
    if tok.encode('utf-8') not in data:
        sym_bad.append((path, tok))
LOG.append('闸2 新增符号：%d 项，失败 %d %s' % (len(SYM), len(sym_bad), sym_bad if sym_bad else ''))
if sym_bad:
    LOG.append('!!! 闸2 失败，中止部署')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); print('\n'.join(LOG)); sys.exit(5)

# ---------- 闸3 已删符号闸 ----------
DEL = [
    ('web/个人中心.html', 'xtFolioToggleFav'),
    ('web/更多.html', '穿越英语'),
]
del_bad = []
for path, tok in DEL:
    data = tar_read(path)
    if data is None:
        del_bad.append((path, 'READ_FAIL')); continue
    if tok.encode('utf-8') in data:
        del_bad.append((path, tok))
for tok in ['data-page="ppt"', "location.href='演示.html'"]:
    for n in names:
        if n.startswith('web/') and n.endswith('.html'):
            data = tar_read(n)
            if data and tok.encode('utf-8') in data:
                del_bad.append((n, tok))
LOG.append('闸3 已删符号：%d 项，残留 %d %s' % (len(DEL) + 2, len(del_bad), del_bad if del_bad else ''))
if del_bad:
    LOG.append('!!! 闸3 失败，中止部署')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); print('\n'.join(LOG)); sys.exit(6)

# ---------- 本地 MD5 manifest ----------
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
LOG.append('本地 MD5 manifest：%d 个文件' % len(man))

# ---------- 凭据 ----------
host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('NO CRED'); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

if os.environ.get('SW_DRY_RUN') == '1':
    LOG.append('[DRY-RUN] 本地闸+打包完成，跳过上传与远端解包')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); print('\n'.join(LOG)); sys.exit(0)

# ---------- 上传 ----------
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s' % (host, REMOTE_TAR)],
                   capture_output=True, text=True, timeout=600, errors='replace')
LOG.append('上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-300:]))
if r.returncode != 0:
    LOG.append('!!! 上传失败，中止')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); print('\n'.join(LOG)); sys.exit(7)

# ---------- 远端：预快照 -> tarfile 落位 -> MD5 全量比对 -> 探活 ----------
remote_py = "\n".join([
    "import tarfile, os, io, hashlib, base64, json, urllib.request, urllib.error",
    "ROOT='/opt/study-workbench'; TAR='" + REMOTE_TAR + "'",
    "man=json.loads(base64.b64decode('" + b64 + "').decode('utf-8'))",
    "keys=sorted(man)",
    "def m5(p):",
    "    return hashlib.md5(io.open(p,'rb').read()).hexdigest()",
    "pre={}",
    "for k in keys:",
    "    p=os.path.join(ROOT,k)",
    "    pre[k]=m5(p) if os.path.exists(p) else 'ABSENT'",
    "changed=[k for k in keys if pre[k]!='ABSENT' and pre[k]!=man[k]]",
    "new=[k for k in keys if pre[k]=='ABSENT']",
    "print('PRE_SNAPSHOT changed=%d new=%d unchanged=%d' % (len(changed), len(new), len(keys)-len(changed)-len(new)))",
    "with tarfile.open(TAR,'r:gz') as t:",
    "    mem=t.getmembers(); t.extractall(ROOT)",
    "print('EXTRACT_OK members=%d' % len(mem))",
    "ok=0; bad=[]",
    "for i,k in enumerate(keys):",
    "    p=os.path.join(ROOT,k)",
    "    if not os.path.exists(p): bad.append((i,'MISSING','')); continue",
    "    h=m5(p)",
    "    if h==man[k]: ok+=1",
    "    else: bad.append((i,man[k],h))",
    "print('MD5_OK=%d/%d' % (ok,len(keys)))",
    "for b in bad: print('MD5_BAD idx=%d exp=%s got=%s' % b)",
    "def code(u):",
    "    try: return urllib.request.urlopen(u,timeout=10).status",
    "    except urllib.error.HTTPError as e: return e.code",
    "    except Exception as e: return 'ERR:%s'%e",
    "print('HTTP_HOME=%s' % code('http://127.0.0.1/'))",
    "print('HTTP_HEALTH=%s' % code('http://127.0.0.1:8000/api/health'))",
    "print('HTTP_wodefile=%s' % code('http://127.0.0.1/%E6%88%91%E7%9A%84%E6%96%87%E4%BB%B6.html'))",
    "print('HTTP_daorutiku=%s' % code('http://127.0.0.1/%E5%AF%BC%E5%85%A5%E9%A2%98%E5%BA%93.html'))",
    "d=urllib.request.urlopen('http://127.0.0.1/assets/app.js?v=" + STAMP + "',timeout=20).read()",
    "print('FETCH_appjs_AndroidBridge_notify=%d' % d.count(b'AndroidBridge.notify'))",
    "d2=urllib.request.urlopen('http://127.0.0.1/assets/importer.js?v=" + STAMP + "',timeout=20).read()",
    "print('FETCH_importer_xtFilesRegister=%d' % d2.count(b'xtFilesRegister'))",
    "try: os.remove(TAR)",
    "except Exception as e: print('TAR_CLEANUP_ERR=%s'%e)",
    "print('TAR_CLEANED=%s' % (not os.path.exists(TAR)))",
])
remote_cmd = "python3 - <<'PYEOF'\n" + remote_py + "\nPYEOF"

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, remote_cmd],
                   capture_output=True, text=True, timeout=900, errors='replace')
LOG.append('--- 远端执行 rc=%d ---' % r.returncode)
LOG.append(r.stdout or '')
if r.stderr:
    LOG.append('[STDERR] ' + r.stderr[-1500:])

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('\n'.join(LOG))
