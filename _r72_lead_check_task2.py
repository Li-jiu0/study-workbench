# -*- coding: utf-8 -*-
# 主理人独立抽验：任务二落盘状态（不采信成员自述）
import os, subprocess, datetime

TREE = r'D:\下载的文件\学习工作台'
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
out = []

def lineends(raw):
    return raw.count(b'\r\n'), raw.count(b'\n') - raw.count(b'\r\n')

def probe(rel, markers):
    p = os.path.join(TREE, rel)
    if not os.path.exists(p):
        out.append('[MISS] %s' % rel); return
    raw = open(p, 'rb').read()
    crlf, lone = lineends(raw)
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime('%Y-%m-%d %H:%M:%S')
    out.append('--- %s  size=%d CRLF=%d loneLF=%d  mtime=%s' % (rel, len(raw), crlf, lone, mt))
    for label, pat in markers:
        n = raw.count(pat.encode('utf-8')) if isinstance(pat, str) else raw.count(pat)
        out.append('    %-28s = %d' % (label, n))

probe('assets/ai-service.js', [
    ('allowPreset', 'allowPreset'),
    ('callAI preset短路口', 'presetMatch(userText)'),
])
probe('assets/ai-settings.js', [
    ('BATCH_CONCURRENCY', 'BATCH_CONCURRENCY'),
    ('setSortModal', 'setSortModal'),
    ('按速率排序', '按速率排序'),
    ('识图 label', '识图'),
    ('translate 残留(BUILTIN_CATS)', "{ key: 'translate'"),
    ('迁移 delete catModels.translate', 'catModels.translate'),
])
probe('ai-settings.html', [
    ('setSortModal DOM', 'setSortModal'),
    ('media 640', 'max-width:640px'),
    ('flex-basis:100%', 'flex-basis:100%'),
])
probe('assets/ai-config.js', [('translate FUNC_TYPES', "translate: {")])

# 备份存在性
for rel in ['assets/ai-service.js.bak-pre-r72-20260917',
            'assets/ai-settings.js.bak-pre-r72-20260917',
            'ai-settings.html.bak-pre-r72-20260917',
            'assets/ai-config.js.bak-pre-r72-20260917']:
    p = os.path.join(TREE, rel)
    out.append('BAK %-60s %s' % (rel, 'OK' if os.path.exists(p) else 'MISSING'))

# node --check
for rel in ['assets/ai-service.js', 'assets/ai-settings.js', 'assets/ai-config.js']:
    r = subprocess.run([NODE, '--check', os.path.join(TREE, rel)], capture_output=True, text=True)
    out.append('node --check %-28s rc=%d %s' % (rel, r.returncode, (r.stderr or '').strip()[:200]))

open(os.path.join(TREE, '_r72_lead_check_task2.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
