# -*- coding: utf-8 -*-
"""R11 部署包构建（web-only，不含 APK）。
arcname = 生产相对路径（web/... / server/...），解压目录 = /opt/study-workbench。
硬排除（§8.13）：version.json 不动（不 bump 版本号，避免提示更新到不存在的 APK）、
                APK / android/** 不打包、model_usage.json（运行期台账）、blog_wechat.html（废弃草稿）。
"""
import os, io, json, tarfile, hashlib, re

ROOT = r'D:\下载的文件\学习工作台'
os.chdir(ROOT)
TAR = os.path.join(ROOT, 'tools', '_r11_deploy.tar.gz')

ASSETS = ['ai-config.js', 'ai-page.js', 'ai-service.js', 'app.js',
          'chat-local.js', 'group-discussion.js', 'i-partner.js', 'voiceplayer.js']
SERVER = ['server/config.py', 'server/routers/ai.py',
          'server/data/model_registry.json', 'server/data/model_quota.json']
FORBID_SUFFIX = ('.apk', '.db', '.env', 'version.json', 'model_usage.json', 'feedback.json')
FORBID_NAME = {'blog_wechat.html'}

# 页面：凡引用本批任一改动资产的根页（扫描生成，不解析报告文件 —— §_r10 教训）
pages = []
for n in sorted(os.listdir(ROOT)):
    if not n.endswith('.html') or '.bak' in n.lower() or n.startswith('_'):
        continue
    if n in FORBID_NAME:
        continue
    t = io.open(os.path.join(ROOT, n), 'rb').read().decode('utf-8', 'ignore')
    if any(re.search(r'(?:src|href)\s*=\s*["\']assets/' + re.escape(a), t, re.I) for a in ASSETS):
        pages.append(n)
assert len(pages) == 44, '页数异常: %d -> %s' % (len(pages), pages)

m = json.load(io.open('tools/_r11_upload_manifest.json', encoding='utf-8'))
assert sorted(pages) == sorted(f for f in m['files'] if f.endswith('.html')), '页面集与清单不符'

entries = [('web/' + p, os.path.join(ROOT, p)) for p in pages]
entries += [('web/assets/' + a, os.path.join(ROOT, 'assets', a)) for a in ASSETS]
entries += [(s, os.path.join(ROOT, s.replace('/', os.sep))) for s in SERVER]

# 终态断言
arcs = [e[0] for e in entries]
assert len(arcs) == len(set(arcs)), 'arcname 重复'
for arc, lp in entries:
    assert os.path.isfile(lp), '缺文件: ' + lp
    assert not arc.endswith(FORBID_SUFFIX), '禁列文件混入: ' + arc
    assert os.path.basename(arc) not in FORBID_NAME, '禁列文件混入: ' + arc

with tarfile.open(TAR, 'w:gz') as tf:
    for arc, lp in entries:
        tf.add(lp, arcname=arc)

# 逐文件本地 md5（部署后比对用）
mds = {}
for arc, lp in entries:
    mds[arc] = hashlib.md5(open(lp, 'rb').read()).hexdigest()
io.open('tools/_r11_manifest.json', 'w', encoding='utf-8').write(
    json.dumps({'stamp': '20260925a', 'md5': mds}, ensure_ascii=False, indent=1))

raw = open(TAR, 'rb').read()
lines = ['部署包: %s' % TAR,
         '大小: %d bytes  md5=%s' % (len(raw), hashlib.md5(raw).hexdigest()),
         '条目数: %d (HTML %d + assets %d + server %d)' % (len(entries), len(pages), len(ASSETS), len(SERVER)),
         '禁列检查: 无 .apk / 无 version.json / 无 android/**',
         '', '-- 服务端 4 件本地 md5 --']
for s in SERVER:
    lines.append('  %s  %s' % (mds[s], s))
io.open('tools/_r11_build_tar.txt', 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
