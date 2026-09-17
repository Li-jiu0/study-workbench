# -*- coding: utf-8 -*-
# 主理人独立复验：打戳结果 + notify.js 引用真相 + 行尾
import os, re, glob, datetime

T = r'D:\下载的文件\学习工作台'
out = []

pages = sorted(glob.glob(os.path.join(T, '*.html')))
out.append('根 HTML 数 = %d' % len(pages))

# 1) 独立用「标签解析」法统计戳分布
tag_re = re.compile(r'<(?:script|link)\b[^>]*?(?:src|href)=["\']([^"\']+)["\']', re.I)
from collections import Counter
cnt = Counter()
per_asset = Counter()
bare = []
for p in pages:
    html = open(p, 'rb').read().decode('utf-8', 'replace')
    for url in tag_re.findall(html):
        if 'assets/' not in url:
            continue
        m = re.search(r'\?v=([0-9A-Za-z]+)', url)
        name = url.split('?')[0].split('/')[-1]
        if m:
            cnt[m.group(1)] += 1
            per_asset[(name, m.group(1))] += 1
        else:
            bare.append((os.path.basename(p), url))
out.append('戳分布: %s' % dict(cnt))
out.append('裸路径数 = %d  %s' % (len(bare), bare[:5]))
out.append('本批 7 资产戳值:')
for a in ['app.js', 'api.js', 'chat-local.js', 'importer.js', 'notify.js', 'ai-service.js', 'ai-settings.js',
          'ai-config.js', 'ai-page.js']:
    vals = {k[1]: v for k, v in per_asset.items() if k[0] == a}
    out.append('   %-16s %s' % (a, vals if vals else 'NO REFERENCE'))

# 2) 双后缀 / 裸路径 / 旧戳残留
txt = b''.join(open(p, 'rb').read() for p in pages)
out.append('.js.js?v= = %d' % txt.count(b'.js.js?v='))
out.append('.css.css?v= = %d' % txt.count(b'.css.css?v='))
out.append('20260916Q = %d' % txt.count(b'20260916Q'))

# 3) notify.js 引用真相：全树（排除备份/node_modules）搜索
hits = []
for root, dirs, files in os.walk(T):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '.venv') and not d.startswith('备份') and not d.startswith('_w2t1')]
    for f in files:
        if f.endswith(('.html', '.js')) and '.bak' not in f:
            p = os.path.join(root, f)
            try:
                raw = open(p, 'rb').read()
            except Exception:
                continue
            if b'notify.js' in raw:
                hits.append(os.path.relpath(p, T))
out.append('全树引用 notify.js 的文件: %s' % (hits if hits else 'NONE'))

# 4) AndroidBridge.notify 调用点（需求 5 的真实链路）
call_hits = []
for f in ['assets/app.js', 'assets/notify.js', 'assets/chat-local.js', 'assets/api.js']:
    p = os.path.join(T, f)
    raw = open(p, 'rb').read()
    call_hits.append('%s=%d' % (f.split('/')[-1], raw.count(b'AndroidBridge.notify')))
out.append('AndroidBridge.notify 调用点: %s' % ' | '.join(call_hits))

# 5) 行尾抽查
for rel in ['ai-settings.html', '我的文件.html', '导入题库.html', '学习工作台.html', 'assets/notify.js']:
    p = os.path.join(T, rel)
    raw = open(p, 'rb').read()
    crlf = raw.count(b'\r\n'); lone = raw.count(b'\n') - crlf
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime('%m-%d %H:%M:%S')
    out.append('%-20s CRLF=%-5d loneLF=%-4d mtime=%s' % (rel, crlf, lone, mt))

open(os.path.join(T, '_r72_lead_check_stamp.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
