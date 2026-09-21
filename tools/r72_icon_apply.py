# -*- coding: utf-8 -*-
# R72 任务三：统一「我的文件」侧栏图标 palette -> folder（锚定 nav-item 块内，逐文件计数）
# 依据 E1「我的文件（data-page="files"，图标 folder）」的图标约定；仅改同一锚定块内的 data-icon。
import os, re, io

BASE = r'D:\下载的文件\学习工作台'
EXPECT = {
    'AI.html': 1, 'blog_wechat.html': 2, 'PPT案例拆解.html': 1, 'PPT版式库.html': 1,
    '万能金句库.html': 1, '企业定向库.html': 1, '动态.html': 1, '商务礼仪.html': 1,
    '四级词汇.html': 1, '场景话术库.html': 1, '时政热点.html': 1, '工具.html': 1,
    '私聊.html': 1, '申论刷题.html': 1, '社区.html': 1, '英语.html': 1,
    '行测刷题.html': 1, '管理员.html': 1, '行测.html': 1, '面试题库.html': 1,
    '设置.html': 1, '错题本.html': 1, '面测.html': 1, '表达.html': 1, '更多.html': 1,
}
pat = re.compile(r'(<div class="nav-item"[^>]*?data-page="files"[^>]*?>)(.*?)(</div>)', re.S)

log = []
for f, exp in EXPECT.items():
    p = os.path.join(BASE, f)
    raw = open(p, 'rb').read()
    bom = raw.startswith(b'\xef\xbb\xbf')
    t = io.open(p, 'r', encoding='utf-8-sig', newline='').read().replace('\r\n', '\n').replace('\r', '\n')
    ms = pat.findall(t)
    if len(ms) != exp:
        raise SystemExit('ABORT %s: files-nav=%d expect=%d' % (f, len(ms), exp))
    n_icon = 0
    def repl(m):
        global n_icon
        inner = m.group(2)
        if 'data-icon="palette"' in inner and '我的文件' in inner:
            inner2 = inner.replace('data-icon="palette"', 'data-icon="folder"')
            n_icon += 1
            return m.group(1) + inner2 + m.group(3)
        return m.group(0)
    t2 = pat.sub(repl, t)
    if n_icon != exp:
        raise SystemExit('ABORT %s: icon replaced=%d expect=%d' % (f, n_icon, exp))
    out = t2.replace('\n', '\r\n').encode('utf-8')
    if bom:
        out = b'\xef\xbb\xbf' + out
    open(p, 'wb').write(out)
    log.append('%s icon_replaced=%d loneLF=%d' % (f, n_icon, out.count(b'\n') - out.count(b'\r\n')))

io.open(os.path.join(BASE, 'tools', 'r72_icon_out.txt'), 'w', encoding='utf-8').write('\n'.join(log))
print('\n'.join(log))
print('ICON OK')
