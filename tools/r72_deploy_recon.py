# -*- coding: utf-8 -*-
import os, glob, hashlib, io

ROOT = r'D:\下载的文件\学习工作台'
out = []

root_html = sorted([n for n in os.listdir(ROOT)
                    if n.lower().endswith('.html') and os.path.isfile(os.path.join(ROOT, n))])
out.append('root *.html count = %d' % len(root_html))
for n in root_html:
    out.append('   ' + n)

EXCLUDE = {'blog_wechat.html'}
deploy_html = [n for n in root_html if n not in EXCLUDE]
out.append('')
out.append('deploy HTML (excl blog_wechat) = %d' % len(deploy_html))

ASSETS = ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js']
out.append('')
out.append('deploy assets = %d' % len(ASSETS))
for a in ASSETS:
    p = os.path.join(ROOT, 'assets', a)
    out.append('   %-16s exists=%s bytes=%d' % (a, os.path.exists(p), os.path.getsize(p) if os.path.exists(p) else -1))

# 行尾概览（root HTML）
out.append('')
out.append('-- root HTML 行尾（loneLF 应 0）--')
bad = []
for n in root_html:
    b = open(os.path.join(ROOT, n), 'rb').read()
    lone = b.count(b'\n') - b.count(b'\r\n')
    if lone != 0:
        bad.append((n, lone))
out.append('loneLF!=0 的 root HTML: %d %s' % (len(bad), bad))

with io.open(os.path.join(ROOT, 'tools', 'r72_deploy_recon_out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')
print('RECON DONE')
