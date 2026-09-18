# -*- coding: utf-8 -*-
"""20260916N 部署：第三批 UI 收放/删除四项 + 前批遗留（含 CRLF 行尾回归修复）

本轮实际携带的改动（相对生产已上线的 20260916M）：
  assets/app.js            + 收放三函数（xtInitCollapse/xtToggleCollapse/xtSyncCollapseToggleText）、
                             键盘可达性（onkeydown Enter/Space）、AI 模型链路（前批）
  assets/common.css        + [data-xt-collapse] 收放规则、.type-filter-toggle
  assets/company-lib.js    + 删分类胶囊（CL_renderTabs/toggleTabs/tabsOpen 全清）
                             + 数据驱动分类下拉 CL_renderCatFilter + setCat 回写 value
  assets/voiceplayer.js    + 听说训练两级收放（S.catsOpen / S.subsOpen）
  万能金句库.html           + data-xt-collapse + .type-filter-toggle
  商务礼仪.html             + data-xt-collapse + .type-filter-toggle
  企业定向库.html           - 删 #clTabs 整行 + .cl-tabs CSS，+ <select id="clCatSel">

⚠️ 关键修复：上一版部署脚本（deploy_update_20260916m.py）误用
   io.open(p,'w',encoding='utf-8',newline='') + 默认读模式，导致 39 个 HTML
   行尾被静默从 CRLF 改成 LF（生产上至今仍是 LF 版）。本脚本已改为纯二进制读写，
   行尾逐字节不变；本次推送同时把 39 个 HTML 的 CRLF 版本覆盖回生产。

策略：
  1) 全站 39 个 HTML 版本戳 bump -> 20260916N（强制客户端拉新，不复用已服务过的 M）
  2) 打包 assets/*.js + assets/*.css + 全部 HTML
  3) pscp 上传 -> plink 远端解包 + HTTP 探活 + 关键内容/行尾校验

环境变量：SW_HOST / SW_PASS 覆盖凭据；SW_DRY_RUN=1 只做本地打包与 bump，不上传
"""
import os, io, sys, glob, tarfile, subprocess, re

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916N'
PREV_STAMP = '20260916M'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
OUT = r'C:\Users\ATM\_dep_n_out.txt'
LOG = []

# ---------- 1) 全站 HTML 版本戳 bump ----------
htmls = []
bumped = 0
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    htmls.append(b)
    # ⚠️ 行尾安全：必须按二进制读写，绝不使用 text 模式。
    # 教训（2026-09-16）：上一版写成 io.open(p, 'w', encoding='utf-8', newline='')
    # 配合默认的读模式（newline=None），读时 \r\n 被归一化为 \n、写时又不补回，
    # 导致 39 个 HTML 全站行尾被静默改成 LF（每行少 1 字节），并已推上生产。
    # 现改为二进制读取 -> 版本戳替换 -> 二进制写回，行尾逐字节不变。
    with open(p, 'rb') as f:
        raw = f.read()
    raw2, n = re.subn(rb'\?v=[0-9A-Za-z_\-\.]+', b'?v=' + STAMP.encode('ascii'), raw)
    if n:
        with open(p, 'wb') as f:
            f.write(raw2)
        bumped += n
LOG.append('HTML %d 个, bump 版本戳 %d 处 -> %s' % (len(htmls), bumped, STAMP))

# ---------- 1b) 本地行尾自检（bump 后必须仍是 CRLF）----------
eol_bad = []
for h in htmls:
    with open(os.path.join(ROOT, h), 'rb') as f:
        raw = f.read()
    crlf = raw.count(b'\r\n')
    lone_lf = raw.count(b'\n') - crlf
    if lone_lf != 0:
        eol_bad.append((h, lone_lf))
LOG.append('行尾自检：39 HTML 中 loneLF!=0 的 %d 个 %s' % (len(eol_bad), eol_bad[:5] if eol_bad else ''))
if eol_bad:
    LOG.append('!!! 行尾自检失败，中止部署')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(3)

# ---------- 2) 打包 ----------
assets_js = [f for f in os.listdir(os.path.join(ROOT, 'assets'))
             if f.endswith('.js') and 'bak' not in f.lower()]
assets_css = [f for f in os.listdir(os.path.join(ROOT, 'assets'))
              if f.endswith('.css') and 'bak' not in f.lower()]
LOG.append('打包 assets: %d 个 js + %d 个 css' % (len(assets_js), len(assets_css)))

with tarfile.open(TAR, 'w:gz') as tar:
    for fn in assets_js + assets_css:
        p = os.path.join(ROOT, 'assets', fn)
        tar.add(p, arcname='web/assets/' + fn)
    for h in htmls:
        tar.add(os.path.join(ROOT, h), arcname='web/' + h)

names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 个, %d bytes' % (len(names), os.path.getsize(TAR)))

# 关键字面断言
MUST = ['web/assets/app.js', 'web/assets/common.css', 'web/assets/ai-page.js',
        'web/assets/company-lib.js', 'web/assets/voiceplayer.js',
        'web/私聊.html', 'web/企业定向库.html', 'web/万能金句库.html',
        'web/商务礼仪.html', 'web/关于.html', 'web/学习工作台.html',
        'web/AI.html', 'web/设置.html']
missing = [m for m in MUST if m not in names]
if missing:
    LOG.append('!!! 缺失关键文件: %s' % missing)
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(4)
LOG.append('关键文件断言 OK (%d 项)' % len(MUST))

# 新增符号断言（确保本批真的打进去了）
def has_in_tar(path, token):
    """从 tar 中读文件全文，检查 token（字节级，避免中文编码坑）"""
    with tarfile.open(TAR) as t:
        try:
            data = t.extractfile(path).read()
        except Exception:
            return False
    return token.encode('utf-8') in data

SYM = [
    ('web/assets/app.js', b'xtInitCollapse'),
    ('web/assets/app.js', b'onkeydown'),
    ('web/assets/common.css', b'data-xt-collapse'),
    ('web/assets/company-lib.js', b'CL_renderCatFilter'),
    ('web/assets/company-lib.js', b'clCatSel'),
    ('web/assets/voiceplayer.js', b'catsOpen'),
    ('web/assets/voiceplayer.js', b'vp-sum'),
]
sym_bad = []
with tarfile.open(TAR) as t:
    for path, tok in SYM:
        try:
            data = t.extractfile(path).read()
        except Exception:
            sym_bad.append((path, 'READ_FAIL'))
            continue
        if tok not in data:
            sym_bad.append((path, tok.decode()))
LOG.append('新增符号断言：%d 项，失败 %d 项 %s' % (len(SYM), len(sym_bad), sym_bad if sym_bad else ''))
if sym_bad:
    LOG.append('!!! 符号断言失败，中止部署')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(5)

# 已删符号断言（必须为 0）
DEL = [
    ('web/assets/company-lib.js', b'CL_renderTabs'),
    ('web/assets/company-lib.js', b'toggleTabs'),
    ('web/assets/company-lib.js', b'tabsOpen'),
    ('web/企业定向库.html', 'clTabs'.encode('utf-8')),
]
del_bad = []
with tarfile.open(TAR) as t:
    for path, tok in DEL:
        try:
            data = t.extractfile(path).read()
        except Exception:
            del_bad.append((path, 'READ_FAIL'))
            continue
        if tok in data:
            del_bad.append((path, tok.decode()))
LOG.append('已删符号断言：%d 项，残留 %d 项 %s' % (len(DEL), len(del_bad), del_bad if del_bad else ''))
if del_bad:
    LOG.append('!!! 删除断言失败，中止部署')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(6)

# ---------- 3) 凭据 ----------
host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('NO CRED')
        io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

if os.environ.get('SW_DRY_RUN') == '1':
    LOG.append('[DRY-RUN] 跳过上传与远端解包')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(0)

# ---------- 4) 上传 ----------
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=600, errors='replace')
LOG.append('上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-200:]))

# ---------- 5) 远端解包 + 探活 + 内容校验 ----------
remote = (
    "cd {root} && "
    "tar -xzf frontend_{st}.tar.gz && echo EXTRACT_OK && "
    "cd web && "
    "echo '--- HTTP 探活 ---' && "
    "curl -s -o /dev/null -w 'home=%{{http_code}} ' 'http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html'; "
    "curl -s -o /dev/null -w 'AI=%{{http_code}} ' 'http://127.0.0.1/AI.html'; "
    "curl -s -o /dev/null -w 'im=%{{http_code}} ' 'http://127.0.0.1/%E7%A7%81%E8%81%8A.html'; "
    "curl -s -o /dev/null -w 'setting=%{{http_code}} ' 'http://127.0.0.1/%E8%AE%BE%E7%BD%AE.html'; "
    "curl -s -o /dev/null -w 'cl=%{{http_code}}' 'http://127.0.0.1/%E4%BC%81%E4%B8%9A%E5%AE%9A%E5%90%91%E5%BA%93.html'; echo; "
    "echo '--- 本批新增符号（应 >0）---'; "
    "echo \"  app.js xtInitCollapse: $(grep -c xtInitCollapse assets/app.js)\"; "
    "echo \"  app.js onkeydown: $(grep -c onkeydown assets/app.js)\"; "
    "echo \"  common.css data-xt-collapse: $(grep -c data-xt-collapse assets/common.css)\"; "
    "echo \"  company-lib.js CL_renderCatFilter: $(grep -c CL_renderCatFilter assets/company-lib.js)\"; "
    "echo \"  voiceplayer.js catsOpen: $(grep -c catsOpen assets/voiceplayer.js)\"; "
    "echo '--- 本批已删符号（应 =0）---'; "
    "echo \"  company-lib.js tabsOpen: $(grep -c tabsOpen assets/company-lib.js)\"; "
    "echo \"  company-lib.js CL_renderTabs: $(grep -c CL_renderTabs assets/company-lib.js)\"; "
    "echo '--- 行尾校验（CRLF 行数应 >0）---'; "
    "python3 - <<'PYEOF'\n"
    "import io\n"
    "for f in ['\\u8bbe\\u7f6e.html','\\u4f01\\u4e1a\\u5b9a\\u5411\\u5e93.html','\\u4e07\\u80fd\\u91d1\\u53e5\\u5e93.html','\\u5546\\u52a1\\u793c\\u4eea.html']:\n"
    "    b = io.open(f,'rb').read()\n"
    "    crlf = b.count(b'\\r\\n'); lone = b.count(b'\\n') - crlf\n"
    "    print('  %s CRLF=%d loneLF=%d' % (f, crlf, lone))\n"
    "PYEOF\n"
    "echo '--- 版本戳（应统一 20260916N）---'; "
    "grep -oh '?v=20260916[A-Z]' *.html | sort | uniq -c"
).format(root=REMOTE_ROOT, st=STAMP)

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@' + host, remote],
                   capture_output=True, text=True, timeout=600, errors='replace')
LOG.append((r.stdout or '') + (('\n[STDERR] ' + r.stderr[-1500:]) if r.stderr else ''))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('\n'.join(LOG))
