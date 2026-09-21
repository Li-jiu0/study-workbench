# -*- coding: utf-8 -*-
"""R11 发版独立复验 + 生成确定性上传清单（不信任刷戳脚本自报）。"""
import glob, os, re, io, json, hashlib

ROOT = r'D:\下载的文件\学习工作台'
os.chdir(ROOT)
STAMP = '20260925a'
TGTS = ['ai-config.js', 'ai-page.js', 'ai-service.js', 'app.js', 'chat-local.js',
        'group-discussion.js', 'i-partner.js', 'voiceplayer.js']
OUT = []

# ---------- 1) 独立解析：只用 <script>/<link> 标签内的 src|href ----------
RX_TAG = re.compile(rb'<(?:script|link)\b[^>]*>', re.I)
RX_ATTR = re.compile(rb'(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
pages = sorted(p for p in glob.glob('*.html')
               if os.path.basename(p) != 'blog_wechat.html'
               and not os.path.basename(p).startswith('_')
               and '.bak' not in os.path.basename(p).lower())
dist, bare, old = {}, [], {}
upload_html = set()
for p in pages:
    raw = open(p, 'rb').read()
    for tg in RX_TAG.findall(raw):
        for u in RX_ATTR.findall(tg):
            u = u.decode('utf-8', 'replace')
            for t in TGTS:
                if u == 'assets/' + t or u.startswith('assets/' + t + '?v='):
                    if '?v=' not in u:
                        bare.append((os.path.basename(p), t))
                    else:
                        st = u.split('?v=')[1]
                        if st != STAMP:
                            old.setdefault(t, {}).setdefault(st, []).append(os.path.basename(p))
                        dist.setdefault(t, {}).setdefault(st, 0)
                        dist[t][st] += 1
                        upload_html.add(os.path.basename(p))

OUT.append('-- 独立复验（重解析 51 页）--')
for t in TGTS:
    d = dist.get(t, {})
    ok = (list(d.keys()) == [STAMP])
    OUT.append('  %-24s %-30s %s' % (t, d, 'PASS' if ok else 'FAIL'))
OUT.append('  裸引用(无 ?v=): %d %s' % (len(bare), bare or ''))
OUT.append('  非目标戳残留: %s' % (old or '无'))

# ---------- 2) 事故特征 ----------
jsjs = sum(open(p, 'rb').read().count(b'.js.js?v=') for p in pages)
OUT.append('  .js.js?v= 命中: %d' % jsjs)

# ---------- 3) 上传清单 ----------
assets = [('assets/' + t) for t in TGTS]
server = ['server/config.py', 'server/routers/ai.py',
          'server/data/model_registry.json', 'server/data/model_quota.json']
OUT.append('')
OUT.append('-- 上传清单 --')
OUT.append('  HTML(%d): %s' % (len(upload_html), '、'.join(sorted(upload_html))))
OUT.append('  assets(%d): %s' % (len(assets), '、'.join(assets)))
OUT.append('  server(%d): %s' % (len(server), '、'.join(server)))
OUT.append('  明确排除: android/**（不打包 APK）、server/routers/version.json（保持 1.39）、*.md、.gitignore')

# ---------- 4) 本地文件指纹（部署后比对用） ----------
OUT.append('')
OUT.append('-- 待传文件 MD5（本地）--')
files = ['assets/' + t for t in TGTS] + sorted(upload_html) + server
missing = []
mds = {}
for f in files:
    if not os.path.exists(f):
        missing.append(f); continue
    b = open(f, 'rb').read()
    mds[f] = hashlib.md5(b).hexdigest()
for f in sorted(mds):
    OUT.append('  %s  %s  %d' % (mds[f], f, os.path.getsize(f)))
if missing:
    OUT.append('  !! 缺失: %s' % missing)
io.open(os.path.join(ROOT, 'tools', '_r11_upload_manifest.json'), 'w', encoding='utf-8').write(
    json.dumps({'stamp': STAMP, 'files': sorted(mds.keys()), 'md5': mds}, ensure_ascii=False, indent=1))
io.open(os.path.join(ROOT, 'tools', '_r11_verify_out.txt'), 'w', encoding='utf-8').write('\n'.join(OUT))
print('\n'.join(OUT[:24]))
print('...')
print('清单文件: tools/_r11_upload_manifest.json  文件数=%d' % len(mds))
