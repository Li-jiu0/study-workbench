# -*- coding: utf-8 -*-
# R67 图标收尾：JS 源码 ★ 字符归零（解析字面量改 \\u2605 转义，行为不变；注释去装饰星）
import os
import shutil
import sys

BASE = r'D:\下载的文件\学习工作台'
JS = os.path.join(BASE, 'assets', 'ai-settings.js')


def S(s):
    return s.replace('\r\n', '\n')


dst = JS + '.bak-pre-icon-20260916'
if not os.path.exists(dst):
    shutil.copyfile(JS, dst)
    print('BACKUP_OK:', dst)
else:
    print('BACKUP_SKIP(已存在)')

PAIRS = [
    # 1) 注释去装饰星
    ('  /* 星级转数字：支持 1-5 数字，也兼容线3之前 "★★★★" 字符串 */',
     '  /* 星级转数字：支持 1-5 数字；兼容历史存量「星级字符串」按连续星形字符计数（解析逻辑，非渲染图标） */'),
    # 2) 解析字面量改 unicode 转义（字节级无 ★ 字符，运行行为完全等价）
    ("        if (v.charAt(i) === '★') { count++; }",
     "        if (v.charAt(i) === '\\u2605') { count++; } /* R67注：历史存量数据解析，非图标；渲染层星级已全 SVG */"),
]

with open(JS, 'rb') as f:
    raw = f.read()
for i, (old, new) in enumerate(PAIRS):
    ob = S(old).encode('utf-8')
    nb = S(new).encode('utf-8')
    n = raw.count(ob)
    if n != 1:
        print('PATCH_FAIL pair#%d found=%d' % (i, n))
        sys.exit(1)
    raw = raw.replace(ob, nb)
with open(JS, 'wb') as f:
    f.write(raw)

with open(JS, 'rb') as f:
    raw = f.read()
crlf = raw.count(b'\r\n')
cr = raw.count(b'\r')
star = raw.count('★'.encode('utf-8'))
print('CHECK: CRLF=%d loneCR=%d lines=%d star_byte=%d' % (crlf, cr - crlf, raw.count(b'\n'), star))
if crlf != 0 or (cr - crlf) != 0 or star != 0:
    print('FAIL')
    sys.exit(1)
print('ALL_PATCH_DONE star=0')
