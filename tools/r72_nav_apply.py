# -*- coding: utf-8 -*-
# R72 任务三：批量把「演示」侧栏入口改为「我的文件」（data-page ppt->files，natively）
# 二进制读写；逐个文件断言替换数 == 预期，不符即中止。
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

pat = re.compile(r'<div class="nav-item"([^>]*?)data-page="ppt"([^>]*?)>(.*?)</div>', re.S)

def repl(m):
    inner = m.group(3)
    if '>演示<' not in inner:
        raise AssertionError('nav-item block missing >演示< : %r' % inner[:120])
    inner2 = inner.replace('>演示<', '>我的文件<')
    if '>我的文件<' not in inner2:
        raise AssertionError('label replace failed')
    return ('<div class="nav-item"' + m.group(1) + 'data-page="files"' +
            m.group(2) + '>' + inner2 + '</div>')

log = []
for f, exp in EXPECT.items():
    p = os.path.join(BASE, f)
    raw = open(p, 'rb').read()
    bom = raw.startswith(b'\xef\xbb\xbf')
    txt = io.open(p, 'r', encoding='utf-8-sig', newline='').read()
    new, n = pat.subn(repl, txt)
    if n != exp:
        raise SystemExit('ABORT %s: replaced=%d expect=%d' % (f, n, exp))
    # 确认没有残留 data-page="ppt" 的 nav-item（允许 0）
    left = len(pat.findall(new))
    # 写回：CRLF 规范化 + 保留 BOM
    b = new.replace('\r\n', '\n').replace('\r', '\n').replace('\n', '\r\n').encode('utf-8')
    if bom:
        b = b'\xef\xbb\xbf' + b
    open(p, 'wb').write(b)
    lone = b.count(b'\n') - b.count(b'\r\n')
    log.append('%s replaced=%d left=%d loneLF=%d' % (f, n, left, lone))

open(os.path.join(BASE, 'tools', 'r72_nav_apply_out.txt'), 'w', encoding='utf-8').write('\n'.join(log))
print('\n'.join(log))
print('ALL OK')
