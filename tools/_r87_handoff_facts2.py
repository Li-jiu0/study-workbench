# -*- coding: utf-8 -*-
"""R87 交接文档用：一次性采集「可直接写进文档」的事实表。"""
import os, re, time, glob, hashlib

os.chdir(r'D:\下载的文件\学习工作台')
OUT = []


def p(s=''):
    OUT.append(str(s))


def eol(p_):
    b = open(p_, 'rb').read()
    c = b.count(b'\r\n')
    l = b.count(b'\n')
    return 'CRLF' if (l - c) == 0 else ('LF' if c == 0 else 'MIXED(crlf=%d,lone=%d)' % (c, l - c))


def info(base, rel):
    if not os.path.exists(rel):
        return '%-34s MISSING' % base
    st = os.stat(rel)
    return '%-34s %9d B  %s  %s' % (base, st.st_size,
                                    time.strftime('%m-%d %H:%M:%S', time.localtime(st.st_mtime)),
                                    eol(rel))


p('=== 1) 本批 AI 相关资产（size / mtime / 行尾）===')
for f in ['assets/ai-config.js', 'assets/ai-service.js', 'assets/ai-settings.js', 'assets/ai-page.js',
          'assets/ai-cap-registry.js', 'assets/ai-cap-image.js', 'assets/ai-cap-vision.js',
          'assets/ai-cap-audio.js', 'assets/ai-cap-embed.js', 'assets/ai-cap-translate.js',
          'assets/ai-cap-video.js', 'assets/ai-cap-3d.js', 'assets/xt-aiusage.js', 'assets/xt-update.js']:
    p('  ' + info(f.split('/')[-1], f))

p('')
p('=== 2) ai-settings.html ===')
p('  ' + info('ai-settings.html', 'ai-settings.html'))

p('')
p('=== 3) 引用 ai-cap-*.js 的根 HTML 数量 ===')
root_html = [f for f in glob.glob('*.html')]
tgt = ['ai-cap-registry.js', 'ai-cap-image.js', 'ai-cap-vision.js', 'ai-cap-audio.js',
       'ai-cap-embed.js', 'ai-cap-translate.js', 'ai-cap-video.js', 'ai-cap-3d.js']
cnt = {}
for name in tgt:
    n = 0
    for h in root_html:
        t = open(h, encoding='utf-8', errors='replace').read()
        if re.search(r'(src|href)=["\'][^"\']*' + re.escape(name), t):
            n += 1
    cnt[name] = n
for k, v in cnt.items():
    p('  %-24s 被 %2d 个根 HTML 引用' % (k, v))
p('  根 HTML 总数(含 blog_wechat.html): %d' % len(root_html))

p('')
p('=== 4) 本批被 T05 注入 cap 引用的 HTML（有 ai-cap-video.js 的页面清单）===')
pages = []
for h in sorted(root_html):
    t = open(h, encoding='utf-8', errors='replace').read()
    if 'ai-cap-video.js' in t:
        pages.append(h)
p('  共 %d 页: %s' % (len(pages), ', '.join(pages[:60])))

p('')
p('=== 5) 后端文件 mtime ===')
for f in ['server/routers/ai.py', 'server/routers/version.json', 'server/main.py', 'server/schemas.py',
          'server/quota_ledger.py', 'server/routers/users.py', 'server/data/model_registry.json',
          'server/data/model_quota.json', 'server/data/model_usage.json']:
    if os.path.exists(f):
        st = os.stat(f)
        p('  %-34s %9d B  %s' % (f, st.st_size, time.strftime('%m-%d %H:%M:%S', time.localtime(st.st_mtime))))
    else:
        p('  %-34s MISSING' % f)

p('')
p('=== 6) 生产前端目录是否已有 APK / 版本号一致性输入 ===')
for f in ['version.json', 'server/routers/version.json']:
    if os.path.exists(f):
        p('  --- %s ---' % f)
        p('  ' + open(f, encoding='utf-8', errors='replace').read().strip()[:600])

p('')
p('=== 7) T05 交付脚本 ===')
for f in ['tools/r87_stamp_apply.py', 'tools/deploy_update_20260918r87.py', 'tools/bump_versions_safe.py',
          'tools/qa/check_version_consistency.py', 'web/static/apk/README.md', 'web/static/apk/.gitkeep']:
    p('  ' + info(os.path.basename(f), f))

p('')
p('=== 8) 部署工具可用性 ===')
for f in ['tools/pscp.exe', 'tools/plink.exe', 'tools/deploy_update_20260918r87.py',
          'tools/frontend_r87_20260918.tar.gz']:
    p('  ' + ('YES %9d B' % os.path.getsize(f)) if os.path.exists(f) else ('NO  ' + f))

p('')
p('=== 9) 需求 ① 分类页：BUILTIN_CATS / FAMILY_ORDER 实取 ===')
t = open('assets/ai-settings.js', encoding='utf-8', errors='replace').read()
m = re.search(r'BUILTIN_CATS\s*=\s*\[(.*?)\]\s*;', t, re.S)
if m:
    ids = re.findall(r"id:\s*'([^']+)'", m.group(1))
    p('  BUILTIN_CATS(%d): %s' % (len(ids), ' / '.join(ids)))
m2 = re.search(r'FAMILY_ORDER\s*=\s*\[(.*?)\]\s*;', t, re.S)
if m2:
    ids2 = re.findall(r"'([^']+)'", m2.group(1))
    p('  FAMILY_ORDER(%d): %s' % (len(ids2), ' / '.join(ids2)))
m3 = re.search(r'CAT_OF_TYPE\s*=\s*\{(.*?)\}\s*;', t, re.S)
if m3:
    ids3 = re.findall(r"([\w'\-]+)\s*:", m3.group(1))
    p('  CAT_OF_TYPE(%d): %s' % (len(ids3), ' / '.join(i.strip("'") for i in ids3)))

p('')
p('=== 10) 需求 ③② 模型计数（ai-config.js）===')
c = open('assets/ai-config.js', encoding='utf-8', errors='replace').read()
p('  builtinModels 条目数 = %d' % len(re.findall(r'\bid\s*:\s*\'', c.split('modelDetails')[0])))
p('  modelDetails 条目数  = %d' % len(re.findall(r'\bid\s*:\s*\'', c.split('modelDetails')[-1])))
p('  含「即将下线」 tag 次数 = %d' % c.count('即将下线'))
for pid in ['ark-seedance-1-0-pro', 'ark-seed3d-2-0']:
    p('  %s 出现 %d 次' % (pid, c.count(pid)))

open('tools/_r87_handoff_facts2.txt', 'w', encoding='utf-8').write('\n'.join(OUT))
print('OK', len(OUT), 'lines')
