# -*- coding: utf-8 -*-
# 本地预检：闸2 新增符号 / 闸3 已删符号（部署前先确认能过）
import os, io

ROOT = r'D:\下载的文件\学习工作台'
out = []

def rb(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return f.read()

NEW = [
    ('assets/importer.js', 'xtFilesRegister'),
    ('我的文件.html', 'xtFilesRender'),
    ('我的文件.html', 'mfList'),
    ('导入题库.html', 'openImporter'),
    ('assets/chat-local.js', 'imGoRemark'),
    ('assets/chat-local.js', 'imOpenRemarkEditor'),
    ('assets/api.js', 'apiGetChatConversations'),
    ('assets/app.js', 'AndroidBridge.notify'),
    ('assets/ai-service.js', 'allowPreset'),
    ('assets/ai-settings.js', 'BATCH_CONCURRENCY'),
    ('登录.html', '祝君一切安好'),
    ('assets/ai-settings.js', '识图'),
]
out.append('=== 闸2：新增符号（应 >=1）===')
for rel, tok in NEW:
    if not os.path.exists(os.path.join(ROOT, rel)):
        out.append('  MISSING-FILE %-24s %s' % (rel, tok)); continue
    c = rb(rel).count(tok.encode('utf-8'))
    out.append('  %-24s %-24s count=%d %s' % (rel, tok, c, 'OK' if c >= 1 else '*** FAIL'))

out.append('')
out.append('=== 闸3：已删符号（应 =0）===')
DEL_FILE = [
    ('个人中心.html', 'xtFolioToggleFav'),
    ('更多.html', '穿越英语'),
]
for rel, tok in DEL_FILE:
    c = rb(rel).count(tok.encode('utf-8'))
    out.append('  %-24s %-24s count=%d %s' % (rel, tok, c, 'OK' if c == 0 else '*** FAIL'))

# 全站扫描（根 HTML + assets/*.js|css）
files = [n for n in os.listdir(ROOT) if n.lower().endswith('.html') and os.path.isfile(os.path.join(ROOT, n))]
for n in os.listdir(os.path.join(ROOT, 'assets')):
    if n.endswith(('.js', '.css')) and 'bak' not in n.lower():
        files.append('assets/' + n)
for tok in ['data-page="ppt"', "location.href='演示.html'"]:
    hits = []
    b = tok.encode('utf-8')
    for rel in files:
        if rel.startswith('assets/') or True:
            p = os.path.join(ROOT, rel)
            if os.path.exists(p) and b in rb(rel):
                hits.append(rel)
    out.append('  SITEWIDE %-30s count=%d %s' % (tok, len(hits), hits[:6]))

with io.open(os.path.join(ROOT, 'tools', 'r72_symbol_preflight_out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')
print('PREFLIGHT DONE')
