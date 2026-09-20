# -*- coding: utf-8 -*-
"""R91-C 修复脚本：个人中心.html 两处 textContent 无条件写入加守卫，
断根 MutationObserver 自触发死循环。二进制读写+唯一命中断言+写后回读校验。"""
import os

ROOT = r'D:\下载的文件\学习工作台'
HTML = os.path.join(ROOT, '个人中心.html')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r91c_edit_result.txt')

log = []
def w(s):
    log.append(str(s))

def line_stats(data):
    crlf = data.count(b'\r\n')
    lone_lf = 0
    idx = 0
    while True:
        i = data.find(b'\n', idx)
        if i < 0:
            break
        if i == 0 or data[i-1:i] != b'\r':
            lone_lf += 1
        idx = i + 1
    lone_cr = 0
    idx = 0
    while True:
        i = data.find(b'\r', idx)
        if i < 0:
            break
        if data[i+1:i+2] != b'\n':
            lone_cr += 1
        idx = i + 1
    return crlf, lone_lf, lone_cr

with open(HTML, 'rb') as f:
    d0 = f.read()
c0, l0, r0 = line_stats(d0)
w('BEFORE: size=%d crlf=%d loneLF=%d loneCR=%d' % (len(d0), c0, l0, r0))

def rep(data, old, new, name):
    cnt = data.count(old)
    if cnt != 1:
        raise SystemExit('ABORT: %s count=%d' % (name, cnt))
    nd = data.replace(old, new, 1)
    w('[OK] %s (old %d B -> new %d B)' % (name, len(old), len(new)))
    return nd

# 修复 1：xtInjectAccountRow 的行文本写入（原 L1281）
old1 = "    row.textContent = '\u8d26\u53f7\uff1a' + (a || ACC_EMPTY);\r\n".encode('utf-8')
new1 = ("    var acctText = '\u8d26\u53f7\uff1a' + (a || ACC_EMPTY);\r\n"
        "    /* R91-C\uff1a\u503c\u672a\u53d8\u4e0d\u91cd\u5199 DOM\u2014\u2014textContent setter \u5373\u4f7f\u540c\u503c\u4e5f\u4f1a\u91cd\u5efa\u6587\u672c\u8282\u70b9\uff0c\r\n"
        "       \u4f1a\u518d\u6b21\u89e6\u53d1 #profileBox \u4e0a\u7684 MutationObserver\uff08xtWatchAccount\uff09\uff0c\r\n"
        "       \u5f62\u6210\u300c\u89c2\u5bdf\u2192\u6e32\u67d3\u2192\u518d\u89c2\u5bdf\u300d\u65e0\u9650\u5fae\u4efb\u52a1\u5faa\u73af\uff0c\u9875\u9762\u5b8c\u5168\u5361\u6b7b\u3002 */\r\n"
        "    if (row.textContent !== acctText) { row.textContent = acctText; }\r\n").encode('utf-8')

# 修复 2：xtRenderAccount 的 peAccount 写入（原 L1288-1291）
old2 = ("    if (el) {\r\n"
        "      el.textContent = a || ACC_EMPTY;\r\n"
        "      el.className = 'xt-acc-val' + (a ? '' : ' xt-acc-muted');\r\n"
        "    }\r\n").encode('utf-8')
new2 = ("    if (el) {\r\n"
        "      /* R91-C\uff1a\u540c\u4e0a\uff0c\u503c\u672a\u53d8\u4e0d\u91cd\u5199\uff0c\u907f\u514d\u81ea\u89e6\u53d1\u6b7b\u5faa\u73af */\r\n"
        "      var accVal = a || ACC_EMPTY;\r\n"
        "      if (el.textContent !== accVal) { el.textContent = accVal; }\r\n"
        "      el.className = 'xt-acc-val' + (a ? '' : ' xt-acc-muted');\r\n"
        "    }\r\n").encode('utf-8')

d = d0
d = rep(d, old1, new1, 'FIX1 xtInjectAccountRow row.textContent')
d = rep(d, old2, new2, 'FIX2 xtRenderAccount peAccount.textContent')

with open(HTML, 'wb') as f:
    f.write(d)
with open(HTML, 'rb') as f:
    d1 = f.read()
c1, l1, r1 = line_stats(d1)
w('AFTER: size=%d crlf=%d loneLF=%d loneCR=%d (delta=%+d B)' % (len(d1), c1, l1, r1, len(d1)-len(d0)))
if l1 or r1 or d1 != d:
    raise SystemExit('ABORT: post-write verify failed')
w('[OK] \u56de\u8bfb\u4e00\u81f4\uff0c\u7eaf\u884c\u5c3e\u4e0d\u53d8\uff08\u4e0e\u6539\u524d\u76f8\u540c\uff1a%s\uff09' % ('CRLF' if l0 == 0 and r0 == 0 else 'MIXED'))

ok = (d1.count(new1) == 1 and d1.count(new2) == 1 and old1 not in d1 and old2 not in d1)
w('[%s] \u65b0\u4e32\u547d\u4e2d\u3001\u65e7\u4e32\u6e05\u96f6' % ('PASS' if ok else 'FAIL'))
w('EDIT_ALL=%s' % ('PASS' if ok else 'FAIL'))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
print('edit-done')
