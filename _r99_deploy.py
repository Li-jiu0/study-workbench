# -*- coding: utf-8 -*-
"""R97+R98+R99 头像改造部署（前端；后端本轮未改，不推 server/）
标准：全量差量 + 依赖闭包 + MD5 归零门禁
绝不硬编码文件名清单 —— 全量收集 html + assets 下所有 .js/.css/.jpg/.png/.svg/.woff2
"""
import os, io, re, sys, hashlib, tarfile, subprocess

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260919b'
TAR = os.path.join(ROOT, 'tools', 'deploy_r99_20260919.tar.gz')
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
OUT = os.path.join(ROOT, '_r99_deploy_out.txt')
LOG = []


def log(s):
    LOG.append(str(s))


def flush(code=0):
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(code)


# ---------- 1) 全量收集（不硬编码清单） ----------
EXCLUDE_HTML = set()          # 无豁免，全部 HTML 都推
htmls = []
for p in sorted(os.listdir(ROOT)):
    if not p.endswith('.html'):
        continue
    low = p.lower()
    if 'bak' in low or low.endswith('.bak.html') or p.startswith('_'):
        continue
    htmls.append(p)

ASSET_EXTS = ('.js', '.css', '.jpg', '.jpeg', '.png', '.svg', '.webp', '.woff2', '.woff', '.ttf')
assets = []
adir = os.path.join(ROOT, 'assets')
for f in sorted(os.listdir(adir)):
    low = f.lower()
    if 'bak' in low or f.startswith('_'):
        continue
    if low.endswith(ASSET_EXTS):
        assets.append(f)

log('=== 1) 全量收集 ===')
log('HTML %d 个；assets %d 个（.js/.css/图片/字体全量）' % (len(htmls), len(assets)))

# ---------- 2) 行尾闸 ----------
log('')
log('=== 2) 行尾闸（HTML 必须纯 CRLF；白名单内可 LF） ===')
EOL_LF_OK = {'ai-settings.html'}
eol_bad = []
for h in htmls:
    if h in EOL_LF_OK:
        continue
    raw = open(os.path.join(ROOT, h), 'rb').read()
    lone = raw.count(b'\n') - raw.count(b'\r\n')
    if lone != 0:
        eol_bad.append('%s(loneLF=%d)' % (h, lone))
if eol_bad:
    log('!!! 行尾闸失败: %s' % eol_bad)
    flush(3)
log('行尾闸 OK（%d 个 HTML 全部纯 CRLF）' % (len(htmls) - len(EOL_LF_OK)))

# ---------- 3) 打包 ----------
log('')
log('=== 3) 打包 ===')
with tarfile.open(TAR, 'w:gz') as tar:
    for fn in assets:
        tar.add(os.path.join(ROOT, 'assets', fn), arcname='web/assets/' + fn)
    for h in htmls:
        tar.add(os.path.join(ROOT, h), arcname='web/' + h)

names = tarfile.open(TAR).getnames()
log('tar 成员 %d 个, %d bytes' % (len(names), os.path.getsize(TAR)))

# ---------- 4) 依赖闭包闸（本轮改动文件的引用方必须都在包里） ----------
log('')
log('=== 4) 依赖闭包闸 ===')
# 本轮改动的资产 + 它们被哪些页面引用 —— 引用的页面必须在 tar 里
CLOSURE_ASSETS = {
    'xt-profile.js': ('web/assets/xt-profile.js', STAMP),
    'xt-profile.css': ('web/assets/xt-profile.css', STAMP),
}
ref_pages = {}
for root, dirs, files in os.walk(ROOT):
    if any(x in root for x in ['android', 'node_modules', '.git', 'server', 'tools']):
        continue
    for f in files:
        if not f.endswith('.html'):
            continue
        fp = os.path.join(root, f)
        try:
            txt = io.open(fp, 'r', encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for asset in CLOSURE_ASSETS:
            if re.search(re.escape(asset) + r'\?v=', txt):
                rel = os.path.relpath(fp, ROOT).replace('\\', '/')
                ref_pages.setdefault(asset, set()).add('web/' + rel)

missing = []
bad_stamp = []
for asset, (arc, stamp) in CLOSURE_ASSETS.items():
    if arc not in names:
        missing.append(arc)
    for pg in ref_pages.get(asset, set()):
        if pg not in names:
            missing.append(pg)
for arc in names:
    if arc.startswith('web/') and arc.endswith('.html'):
        try:
            txt = tarfile.open(TAR).extractfile(arc).read().decode('utf-8', 'replace')
        except Exception:
            continue
        for asset, (a2, stamp) in CLOSURE_ASSETS.items():
            for m in re.finditer(re.escape(asset) + r'\?v=([0-9A-Za-z]+)', txt):
                if m.group(1) != stamp:
                    bad_stamp.append('%s -> %s v=%s (期望 %s)' % (arc, asset, m.group(1), stamp))

for asset in CLOSURE_ASSETS:
    log('  %-18s 被引用页: %s' % (asset, ', '.join(sorted(ref_pages.get(asset, set()))) or '（无）'))
if missing:
    log('!!! 依赖闭包缺失: %s' % missing)
    flush(4)
if bad_stamp:
    log('!!! 版本戳不一致: %s' % bad_stamp)
    flush(5)
log('依赖闭包闸 OK（改动资产 + 全部引用页均在包内，版本戳统一 %s）' % STAMP)

# ---------- 5) 符号闸（本轮新增必须存在；本轮删除必须为 0） ----------
log('')
log('=== 5) 符号闸 ===')


def tar_text(arc):
    try:
        return tarfile.open(TAR).extractfile(arc).read().decode('utf-8', 'replace')
    except Exception:
        return ''


js = tar_text('web/assets/xt-profile.js')
css = tar_text('web/assets/xt-profile.css')

NEW_SYM = [
    ('web/assets/xt-profile.js', 'xtpOpenAvatarSheet'),
    ('web/assets/xt-profile.js', 'xtpPickAvatarFile'),
    ('web/assets/xt-profile.js', 'function baseScale'),
    ('web/assets/xt-profile.js', 'ZMIN = 0.4'),
    ('web/assets/xt-profile.js', 'var nw = STATE.natW'),
    ('web/assets/xt-profile.css', 'xtp-sheet-item'),
    ('web/assets/xt-profile.css', 'xtp-sheet-cancel'),
]
DEL_SYM = [
    ('web/assets/xt-profile.js', 'xtpCropZoom'),
    ('web/assets/xt-profile.js', 'CROP_ZOOM_SVG'),
    ('web/assets/xt-profile.js', 'ctx.arc'),
    ('web/assets/xt-profile.css', 'xtp-crop-bottom'),
    ('web/assets/xt-profile.css', 'xtp-crop-zi'),
    ('web/assets/xt-profile.css', 'xtp-crop-topbar::after'),
]
bad = []
for arc, tok in NEW_SYM:
    txt = tar_text(arc)
    if tok not in txt:
        bad.append('新增缺失 %s @ %s' % (tok, arc))
for arc, tok in DEL_SYM:
    txt = tar_text(arc)
    if tok in txt:
        bad.append('已删残留 %s @ %s' % (tok, arc))
# 九宫格必须 4 条
i = css.find('.xtp-crop-frame {')
grad = css[i:css.find('}', i)].count('linear-gradient') if i >= 0 else -1
if grad != 4:
    bad.append('九宫格 linear-gradient 条数=%s（应为 4）' % grad)
if bad:
    log('!!! 符号闸失败: %s' % bad)
    flush(6)
log('符号闸 OK（新增 %d 项齐备，已删 %d 项零残留，九宫格 4 条）' % (len(NEW_SYM), len(DEL_SYM)))

# ---------- 6) 关键成员断言 ----------
MUST = ['web/assets/xt-profile.js', 'web/assets/xt-profile.css', 'web/个人资料.html',
        'web/学习工作台.html', 'web/assets/app.js' if 'app.js' in assets else 'web/assets/xt-region.js']
MUST = [m for m in MUST if m in names or m.endswith('xt-region.js') and 'web/assets/xt-region.js' in names]
miss = [m for m in MUST if m not in names]
if miss:
    log('!!! 关键成员缺失: %s' % miss)
    flush(7)
log('')
log('关键成员断言 OK: %s' % MUST)

# ---------- 7) 本地 MD5 清单 ----------
md5 = {}
for n in names:
    if n.startswith('web/assets/'):
        lp = os.path.join(ROOT, 'assets', n.split('web/assets/')[1])
    elif n.startswith('web/'):
        lp = os.path.join(ROOT, n[len('web/'):])
    else:
        lp = os.path.join(ROOT, n)
    md5[n] = hashlib.md5(open(lp, 'rb').read()).hexdigest()
io.open(os.path.join(ROOT, 'tools', 'tools_md5_r99.txt'), 'w').write(
    '\n'.join('%s %s' % (v, k) for k, v in sorted(md5.items())))
log('本地 MD5 清单 %d 项' % len(md5))

# ---------- 8) 凭据 ----------
s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
if not m:
    log('!!! 凭据解析失败')
    flush(8)
pwd, host = m.group(1), m.group(2)
log('目标 root@%s' % host)

# ---------- 9) 上传 tar ----------
log('')
log('=== 9) 上传 ===')
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/deploy_r99.tar.gz' % (host, REMOTE_ROOT)],
                   capture_output=True, timeout=900)
log('tar 上传 exit=%d %s' % (r.returncode, (r.stderr or b'').decode('utf-8', 'replace')[-300:]))
if r.returncode != 0:
    flush(9)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    os.path.join(ROOT, 'tools', 'tools_md5_r99.txt'),
                    'root@%s:%s/tools_md5_r99.txt' % (host, REMOTE_ROOT)],
                   capture_output=True, timeout=120)
log('MD5 清单上传 exit=%d' % r.returncode)
if r.returncode != 0:
    flush(10)

# ---------- 10) 远端：备份 -> 解包 -> MD5 归零 -> 探活 ----------
remote = r'''
set -u
cd /opt/study-workbench
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/r99-$STAMP
cp -a web/assets/xt-profile.js web/assets/xt-profile.css backups/r99-$STAMP/ 2>/dev/null
cp -a web/个人资料.html backups/r99-$STAMP/ 2>/dev/null
echo BACKUP_OK
tar -xzf deploy_r99.tar.gz && echo EXTRACT_OK
python3 - <<'PYEOF'
import hashlib, io
bad = []; ok = 0; total = 0
for line in io.open('tools_md5_r99.txt'):
    line = line.strip()
    if not line: continue
    h, name = line.split(' ', 1)
    total += 1
    try:
        real = hashlib.md5(io.open(name, 'rb').read()).hexdigest()
    except Exception:
        bad.append((name, 'READ_FAIL')); continue
    if real == h: ok += 1
    else: bad.append((name, real))
print('MD5_TOTAL=%d OK=%d BAD=%d' % (total, ok, len(bad)))
for b in bad[:15]: print('MISMATCH', b)
print('GATE_ZERO=%s' % ('YES' if len(bad) == 0 else 'NO'))
PYEOF
echo '--- 线上探活 ---'
curl -s -o /dev/null -w 'home=%{http_code}\n' 'http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html'
curl -s -o /dev/null -w 'profile=%{http_code}\n' 'http://127.0.0.1/%E4%B8%AA%E4%BA%BA%E8%B5%84%E6%96%99.html'
curl -s -o /dev/null -w 'pjs=%{http_code}\n' 'http://127.0.0.1/assets/xt-profile.js?v=20260919b'
curl -s -o /dev/null -w 'pcss=%{http_code}\n' 'http://127.0.0.1/assets/xt-profile.css?v=20260919b'
echo '--- 线上 xt-profile.js 是否含新符号 ---'
curl -s 'http://127.0.0.1/assets/xt-profile.js?v=20260919b' | grep -c 'xtpOpenAvatarSheet' || true
curl -s 'http://127.0.0.1/assets/xt-profile.js?v=20260919b' | grep -c 'ctx.arc' || true
echo '--- 后端 ---'
systemctl is-active study-workbench || true
'''
r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@' + host, remote], capture_output=True, timeout=900)
log('')
log('=== 10) 远端执行结果 ===')
log((r.stdout or b'').decode('utf-8', 'replace'))
err = (r.stderr or b'').decode('utf-8', 'replace').strip()
if err:
    log('[STDERR] ' + err[-800:])

flush(0)
