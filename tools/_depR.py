# -*- coding: utf-8 -*-
"""20260916R 部署：R66 独立验证收尾 + R67 线1/线2 + R68 + 设置页图标升级（纯前端）
闸门：①行尾 ②新增符号在包内 ③已删符号/emoji 字节归零 ④远端 MD5 全量核对 + 戳分布 + 真实拉取"""
import os, io, sys, glob, tarfile, subprocess, re, hashlib

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916R'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
OUT = r'C:\Users\ATM\_dep_R_out.txt'
LOG = []

def bail(code):
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG)); sys.exit(code)

# ---------- 1) 本地行尾闸（全部 HTML：CRLF 页 loneLF=0；LF 页 CRLF=0）----------
LF_PAGES = {'ai-settings.html'}  # ai-settings.html 为 LF 例外
htmls = []
eol_bad = []
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    htmls.append(b)
    raw = open(p, 'rb').read()
    crlf = raw.count(b'\r\n'); lone_lf = raw.count(b'\n') - crlf; lone_cr = raw.count(b'\r') - crlf
    if b in LF_PAGES:
        if crlf != 0 or lone_cr != 0:
            eol_bad.append((b, 'CRLF=%d' % crlf))
    else:
        if lone_lf != 0:
            eol_bad.append((b, 'loneLF=%d' % lone_lf))
LOG.append('闸①行尾：%d 个 HTML，异常 %d 个 %s' % (len(htmls), len(eol_bad), eol_bad[:5] if eol_bad else ''))
if eol_bad:
    LOG.append('!!! 行尾闸失败，中止'); bail(3)

# ---------- 2) 打包（与 O 批同口径：全部页面 + 全部 assets js/css）----------
assets_js = [f for f in os.listdir(os.path.join(ROOT, 'assets'))
             if f.endswith('.js') and 'bak' not in f.lower()]
assets_css = [f for f in os.listdir(os.path.join(ROOT, 'assets'))
              if f.endswith('.css') and 'bak' not in f.lower()]
with tarfile.open(TAR, 'w:gz') as tar:
    for fn in assets_js + assets_css:
        tar.add(os.path.join(ROOT, 'assets', fn), arcname='web/assets/' + fn)
    for h in htmls:
        tar.add(os.path.join(ROOT, h), arcname='web/' + h)
names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 项, %d bytes' % (len(names), os.path.getsize(TAR)))

MUST = ['web/assets/ai-config.js', 'web/assets/ai-service.js', 'web/assets/ai-page.js',
        'web/assets/ai-settings.js', 'web/AI.html', 'web/ai-settings.html',
        'web/更多.html', 'web/学习工作台.html', 'web/设置.html']
missing = [m for m in MUST if m not in names]
if missing:
    LOG.append('!!! 缺失关键文件: %s' % missing); bail(4)
LOG.append('关键文件断言 OK (%d 项)' % len(MUST))

# ---------- 闸② 新增符号（包内字节级） ----------
def tar_read(path):
    with tarfile.open(TAR) as t:
        try:
            return t.extractfile(path).read()
        except Exception:
            return None

NEW_SYM = [
    ('web/assets/ai-settings.js', b'ICONS'),
    ('web/assets/ai-settings.js', b'svgWrap'),
    ('web/assets/ai-settings.js', b'no_endpoint'),
    ('web/assets/ai-settings.js', b'providerGroups'),
    ('web/assets/ai-page.js', b'CTX_RING_C'),
    ('web/assets/ai-page.js', b'plainModeLabel'),
    ('web/assets/ai-config.js', b'providerGroups'),
    ('web/AI.html', b'ai-ctx-pct'),
    ('web/ai-settings.html', b'setFmProvider'),
]
bad = [(p, t.decode('utf-8', 'replace')) for p, t in NEW_SYM
       if (lambda d: d is None or t not in d)(tar_read(p))]
LOG.append('闸②新增符号：%d 项，失败 %d %s' % (len(NEW_SYM), len(bad), bad if bad else ''))
if bad:
    LOG.append('!!! 新增符号闸失败，中止'); bail(5)

# ---------- 闸③ 已删符号 / emoji 字节归零 ----------
DEL_SYM = [
    ('web/assets/ai-settings.js', 'setAddCustom'.encode()),
    ('web/assets/ai-settings.js', 'buildNamePresets'.encode()),
    ('web/assets/ai-settings.js', '✏️'.encode()), ('web/assets/ai-settings.js', '🗑'.encode()),
    ('web/assets/ai-settings.js', '👁'.encode()), ('web/assets/ai-settings.js', '⏳'.encode()),
    ('web/assets/ai-settings.js', '✅'.encode()), ('web/assets/ai-settings.js', '❌'.encode()),
    ('web/assets/ai-settings.js', '🔌'.encode()), ('web/assets/ai-settings.js', '🔄'.encode()),
    ('web/assets/ai-settings.js', '🧠'.encode()), ('web/assets/ai-settings.js', '🔒'.encode()),
    ('web/assets/ai-settings.js', '★'.encode()), ('web/assets/ai-settings.js', '⭐'.encode()),
    ('web/ai-settings.html', '👁'.encode()), ('web/ai-settings.html', '🔌'.encode()),
    ('web/assets/ai-page.js', 'CTX_USAGE_TIP'.encode()),
    ('web/assets/ai-page.js', '⚡'.encode()), ('web/assets/ai-page.js', '🏆'.encode()),
    ('web/更多.html', 'impLibs'.encode()),
    ('web/更多.html', '我的导入题库'.encode()),
    ('web/更多.html', '导入向导尚未就绪'.encode()),
]
bad = [(p, t.decode('utf-8', 'replace')) for p, t in DEL_SYM
       if (lambda d: d is not None and t in d)(tar_read(p))]
LOG.append('闸③已删符号/emoji：%d 项，残留 %d %s' % (len(DEL_SYM), len(bad), bad if bad else ''))
if bad:
    LOG.append('!!! 删除闸失败，中止'); bail(6)

# ---------- 3) 凭据 ----------
host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('NO CRED'); bail(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

if os.environ.get('SW_DRY_RUN') == '1':
    LOG.append('[DRY-RUN] 三道闸全过，跳过上传')
    bail(0)

# ---------- 4) 上传 ----------
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=600, errors='replace')
LOG.append('上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-200:]))
if r.returncode != 0:
    LOG.append('!!! 上传失败'); bail(7)

# ---------- 5) 远端解包 + 探活 + 校验 ----------
remote = (
    "cd {root} && "
    "tar -xzf frontend_{st}.tar.gz && echo EXTRACT_OK && "
    "cd web && "
    "echo '--- HTTP 探活 ---' && "
    "curl -s -o /dev/null -w 'home=%{{http_code}} ' 'http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html'; "
    "curl -s -o /dev/null -w 'AI=%{{http_code}} ' 'http://127.0.0.1/AI.html'; "
    "curl -s -o /dev/null -w 'settings=%{{http_code}} ' 'http://127.0.0.1/ai-settings.html'; "
    "curl -s -o /dev/null -w 'more=%{{http_code}}' 'http://127.0.0.1/%E6%9B%B4%E5%A4%9A.html'; echo; "
    "echo '--- 本批新增符号（应 >0）---'; "
    "echo \"  ai-settings.js ICONS: $(grep -c ICONS assets/ai-settings.js)\"; "
    "echo \"  ai-settings.js svgWrap: $(grep -c svgWrap assets/ai-settings.js)\"; "
    "echo \"  ai-page.js CTX_RING_C: $(grep -c CTX_RING_C assets/ai-page.js)\"; "
    "echo \"  ai-config.js providerGroups: $(grep -c providerGroups assets/ai-config.js)\"; "
    "echo \"  AI.html ai-ctx-pct: $(grep -c ai-ctx-pct AI.html)\"; "
    "echo '--- 带戳真实拉取（模拟客户端，R 戳应命中新符号）---'; "
    "curl -s 'http://127.0.0.1/assets/ai-settings.js?v=20260916R' | grep -c svgWrap; "
    "curl -s 'http://127.0.0.1/assets/ai-page.js?v=20260916R' | grep -c CTX_RING_C; "
    "echo '--- 行尾 + 中文页内容（python3 直读）---'; "
    "python3 - <<'PYEOF'\n"
    "import io, urllib.request\n"
    "for f in ['ai-settings.html','AI.html','\\u66f4\\u591a.html','\\u8bbe\\u7f6e.html']:\n"
    "    b = io.open(f,'rb').read()\n"
    "    crlf = b.count(b'\\r\\n'); lone = b.count(b'\\n') - crlf\n"
    "    print('  EOL %s CRLF=%d loneLF=%d' % (f, crlf, lone))\n"
    "m = io.open('\\u66f4\\u591a.html','rb').read()\n"
    "print('  impLibs(应0):', m.count('impLibs'.encode()), ' 导入向导尚未就绪(应0):', m.count('导入向导尚未就绪'.encode()))\n"
    "s = io.open('ai-settings.html','rb').read()\n"
    "print('  setFmProvider(应>0):', s.count('setFmProvider'.encode()))\n"
    "print('  net:', len(urllib.request.urlopen('http://127.0.0.1/ai-settings.html').read()))\n"
    "PYEOF\n"
    "echo '--- 版本戳分布 ---'; "
    "grep -oh '?v=20260916[A-Z]' *.html | sort | uniq -c; "
    "echo '--- js.js 双后缀（应 0）---'; grep -c '.js.js?v=' *.html | grep -v ':0' | wc -l; "
    "echo '--- MD5 ---'; md5sum AI.html ai-settings.html assets/ai-config.js assets/ai-service.js assets/ai-page.js assets/ai-settings.js"
).format(root=REMOTE_ROOT, st=STAMP)

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@' + host, remote],
                   capture_output=True, text=True, timeout=600, errors='replace')
LOG.append((r.stdout or '') + (('\n[STDERR] ' + r.stderr[-1500:]) if r.stderr else ''))

# ---------- 6) 本地 MD5 对照（哈希子串匹配，规避中文名编码） ----------
def md5(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()

local_md5 = {}
for f in ['AI.html', 'ai-settings.html', 'assets/ai-config.js', 'assets/ai-service.js',
          'assets/ai-page.js', 'assets/ai-settings.js']:
    local_md5[f] = md5(os.path.join(ROOT, f))
out_text = r.stdout or ''
md5_ok = {f: (h in out_text) for f, h in local_md5.items()}
LOG.append('MD5 对照: %s' % md5_ok)
if not all(md5_ok.values()):
    LOG.append('!!! MD5 不一致: %s' % [f for f, ok in md5_ok.items() if not ok]); bail(8)

LOG.append('=== DEPLOY R DONE ===')
bail(0)
