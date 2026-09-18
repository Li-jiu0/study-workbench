# -*- coding: utf-8 -*-
"""L11 C18: 把 AI 分析（CSS / DOM / 内联 JS）打进 错题本.html。
只改这一个文件；保持原有 CRLF 与 BOM。"""
import io
import os
import sys

ROOT = r'D:\下载的文件\学习工作台'
PAGE = os.path.join(ROOT, '错题本.html')
TOOLS = os.path.join(ROOT, 'tools')


def read_text(name):
    with io.open(os.path.join(TOOLS, name), 'r', encoding='utf-8') as f:
        return f.read()


def write_log():
    with io.open(os.path.join(TOOLS, '_t11_apply_log.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(log))


log = []

with io.open(PAGE, 'r', encoding='utf-8', newline='') as f:
    src = f.read()

# 统一成 \n 处理（文件实测 100% CRLF，无孤立 LF，转换无损）
had_crlf = '\r\n' in src
work = src.replace('\r\n', '\n')
log.append('had_crlf=%s' % had_crlf)
log.append('lone_lf=%s' % ('\n' in work.replace('\r\n', '')))

css = read_text('_t11_css.txt').rstrip('\n')
dom = read_text('_t11_dom.txt').rstrip('\n')
js = read_text('_t11_js.txt').rstrip('\n')

# 1) CSS
a1 = '</style>'
n1 = work.count(a1)
if n1 != 1:
    log.append('FAIL css anchor count=%d' % n1)
    write_log()
    sys.exit(1)
work = work.replace(a1, css + '\n</style>', 1)
log.append('css ok')

# 2) DOM
a2 = '<div id="wrongTypeFilter" class="wb-filter"></div>\n'
n2 = work.count(a2)
if n2 != 1:
    log.append('FAIL dom anchor count=%d' % n2)
    write_log()
    sys.exit(1)
work = work.replace(a2, a2 + dom + '\n', 1)
log.append('dom ok')

# 3) JS
a3 = '<script src="assets/ai-service.js?v=20260916L"></script>\n</body>'
n3 = work.count(a3)
if n3 != 1:
    log.append('FAIL js anchor count=%d' % n3)
    write_log()
    sys.exit(1)
work = work.replace(a3, '<script src="assets/ai-service.js?v=20260916L"></script>\n' + js + '\n</body>', 1)
log.append('js ok')

out = work.replace('\n', '\r\n')
if not out.startswith('\ufeff'):
    out = '\ufeff' + out

with io.open(PAGE, 'w', encoding='utf-8', newline='') as f:
    f.write(out)

log.append('written bytes=%d' % len(out.encode('utf-8')))
log.append('crlf=%d  lf=%d' % (out.count('\r\n'), out.count('\n')))
log.append('OK')
write_log()
print('done')
