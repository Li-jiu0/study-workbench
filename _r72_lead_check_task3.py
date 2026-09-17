# -*- coding: utf-8 -*-
# 主理人独立抽验：任务三落盘状态（不采信成员自述）
import os, subprocess, datetime, glob

TREE = r'D:\下载的文件\学习工作台'
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
out = []

def le(raw):
    return raw.count(b'\r\n'), raw.count(b'\n') - raw.count(b'\r\n')

def stat(rel):
    p = os.path.join(TREE, rel)
    if not os.path.exists(p):
        out.append('[MISS] %s' % rel); return None
    raw = open(p, 'rb').read()
    crlf, lone = le(raw)
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime('%m-%d %H:%M:%S')
    bom = raw[:3] == b'\xef\xbb\xbf'
    out.append('%-34s size=%-7d CRLF=%-5d loneLF=%-5d BOM=%-5s mtime=%s' % (rel, len(raw), crlf, lone, bom, mt))
    return raw

# 1) 新页面存在性 + 行尾/BOM；对照既有页面 BOM 情况
out.append('=== 新页面 ===')
for f in ['我的文件.html', '导入题库.html']:
    stat(f)
out.append('=== 对照：既有页面 BOM 抽样 ===')
for f in ['工具.html', '更多.html', '关于.html', '登录.html']:
    stat(f)

# 2) 关键标记
def marks(rel, pats):
    p = os.path.join(TREE, rel)
    if not os.path.exists(p):
        out.append('[MISS] %s' % rel); return
    raw = open(p, 'rb').read()
    line = []
    for label, pat in pats:
        line.append('%s=%d' % (label, raw.count(pat.encode('utf-8'))))
    out.append('  %s :: %s' % (rel, ' | '.join(line)))

out.append('=== 关键标记 ===')
marks('app.js', [('files:我的文件', "files: '我的文件.html'"), ("ppt:我的文件", "ppt: '我的文件.html'"),
                 ('AndroidBridge.notify', 'AndroidBridge.notify'), ('removeItem 残留', 'localStorage.removeItem')])
marks('assets/app.js', [('files:我的文件', "files: '我的文件.html'"), ("ppt:我的文件", "ppt: '我的文件.html'"),
                        ('AndroidBridge.notify', 'AndroidBridge.notify'), ('removeItem 残留', 'localStorage.removeItem')])
marks('个人中心.html', [('xtFolio', 'xtFolio'), ('我的文件入口', '我的文件.html'), ('folio section', 'data-subpage="folio"')])
marks('更多.html', [('穿越英语', '穿越英语'), ('导入题库页跳转', "location.href='导入题库.html'"), ('openQuest', 'openQuest')])
marks('演示.html', [('pptHub', 'pptHub'), ('pptWorkList', 'pptWorkList'), ('跳转我的文件', '我的文件.html'), ('ppt-works.js', 'ppt-works.js')])
marks('关于.html', [('v2.3', 'v2.3'), ('v2.2', 'v2.2'), ('我的文件 chip', '我的文件'), ('演示 chip', '演示')])
marks('学习工作台.html', [('data-page="files"', 'data-page="files"'), ('data-page="ppt"', 'data-page="ppt"')])
marks('assets/importer.js', [('xtFilesRegister', 'xtFilesRegister')])

# 3) 全站扫描：data-page="ppt" 与 href='演示.html' 残留
out.append('=== 全站残留扫描（根 HTML，排除 备份/演示页自身/_.bak） ===')
ppt_hits, href_hits, yanshi_nav = [], [], []
for p in glob.glob(os.path.join(TREE, '*.html')):
    b = os.path.basename(p)
    raw = open(p, 'rb').read()
    if raw.count(b'data-page="ppt"'):
        ppt_hits.append((b, raw.count(b'data-page="ppt"')))
    if raw.count("location.href='演示.html'".encode('utf-8')) or raw.count(b'location.href="\xe6\xbc\x94\xe7\xa4\xba.html"'):
        href_hits.append(b)
out.append('data-page="ppt" 残留: %s' % (ppt_hits if ppt_hits else 'NONE'))
out.append("href='演示.html' 残留: %s" % (href_hits if href_hits else 'NONE'))

# 4) 我的文件.html / 导入题库.html 关键内容
marks('我的文件.html', [('mfList', 'mfList'), ('mfModule', 'mfModule'), ('xtFilesRegister', 'xtFilesRegister'),
                        ('folio 键', 'xtc:lib:pf:folio:works'), ('imports 键', 'study_workbench_imports'),
                        ('共用 DOM toast', 'id="toast"'), ('共用 DOM morePanel', 'id="morePanel"'),
                        ('script 计数', '<script'), ('script 闭合', '</script>')])
marks('导入题库.html', [('openImporter', 'openImporter'), ('qbank.js', 'qbank.js'), ('importer.js', 'importer.js'),
                        ('script 计数', '<script'), ('script 闭合', '</script>')])

# 5) node --check
for rel in ['assets/app.js', 'assets/importer.js']:
    r = subprocess.run([NODE, '--check', os.path.join(TREE, rel)], capture_output=True, text=True)
    out.append('node --check %-20s rc=%d %s' % (rel, r.returncode, (r.stderr or '').strip()[:160]))

# 6) 备份计数
bak = glob.glob(os.path.join(TREE, '*.bak-pre-r72-20260917')) + glob.glob(os.path.join(TREE, 'assets', '*.bak-pre-r72-20260917'))
out.append('备份文件数(.bak-pre-r72-20260917) = %d' % len(bak))

open(os.path.join(TREE, '_r72_lead_check_task3.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
