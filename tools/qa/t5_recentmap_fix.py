# -*- coding: utf-8 -*-
"""任务五补修：recentMap 中 '英语.html' 的 value 由 'listen' 改为 'cet'。

原因：HOME_DEF 的 k 只有 plaza/cet/exam/comm/interview/ppt，没有 listen
→ HOME_DEF.find(d => d.k === 'listen') 返回 undefined → 访问英语页不记入「最近打开」。
只改这一个 value，不动 recentMap 其它键，不新增键。
"""
import io
import os

ROOT = r'D:\下载的文件\学习工作台'
APP = os.path.join(ROOT, 'assets', 'app.js')
LOG = os.path.join(ROOT, 'tools', 'qa', 't5_recentmap_fix.txt')

OLD = "'英语.html': 'listen'"
NEW = "'英语.html': 'cet'"

# 以 newline='' 读写，原样保留 CRLF
with io.open(APP, 'r', encoding='utf-8', newline='') as f:
    src = f.read()

out = []
out.append('命中次数 = %d' % src.count(OLD))
out.append("'listen' 在 app.js 中出现次数（改前）= %d" % src.count("'listen'"))

if src.count(OLD) != 1:
    out.append('!! 命中数不为 1，中止，未写盘')
else:
    # 定位行号
    idx = src.index(OLD)
    line_no = src.count('\n', 0, idx) + 1
    out.append('定位行号 = %d' % line_no)
    # 打印上下文
    ls = src.rfind('\n', 0, idx) + 1
    le = src.find('\n', idx)
    if le == -1:
        le = len(src)
    out.append('改前: %s' % src[ls:le].rstrip('\r'))
    src = src.replace(OLD, NEW)
    with io.open(APP, 'w', encoding='utf-8', newline='') as f:
        f.write(src)
    out.append('改后: %s' % src[ls:le].rstrip('\r'))
    out.append('已写盘')
    out.append("'listen' 在 app.js 中出现次数（改后）= %d" % src.count("'listen'"))

# 复核换行符与行数
with io.open(APP, 'rb') as f:
    b = f.read()
crlf = b.count(b'\r\n')
lf = b.count(b'\n') - crlf
out.append('CRLF=%d  纯LF=%d  -> %s' % (crlf, lf, 'CRLF' if lf == 0 and crlf > 0 else ('LF' if crlf == 0 else 'MIXED')))
out.append('app.js 行数(\\n 计数) = %d' % b.count(b'\n'))

with io.open(LOG, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('\n'.join(out))
