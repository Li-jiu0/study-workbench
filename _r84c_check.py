# -*- coding: utf-8 -*-
# R84：核对 heroApply / heroInit 调用数在备份与现文件间是否一致（排查上面那条 FAIL 是否只是断言基数写错）
import os, re

BASE = os.path.dirname(os.path.abspath(__file__))


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def cnt(b, tok):
    return b.count(tok.encode('utf-8'))


js_new = rb(os.path.join(BASE, 'assets', 'xt-moments.js'))
js_bak = rb(os.path.join(BASE, 'assets', 'xt-moments.js.bak-pre-r84-20260917'))

for tok in ['heroApply', 'heroInit', 'BG_KEY', 'readAsDataURL', 'xtmHero']:
    print('%-16s bak=%-3d new=%-3d %s' % (tok, cnt(js_bak, tok), cnt(js_new, tok),
                                          'SAME' if cnt(js_bak, tok) == cnt(js_new, tok) else 'DIFF'))

print()
print('---- 现文件 heroApply 出现上下文 ----')
txt = js_new.decode('utf-8')
for i, line in enumerate(txt.split('\n'), 1):
    if 'heroApply' in line:
        print('%5d: %s' % (i, line.rstrip()))

print()
print('---- 现文件 heroInit 出现上下文 ----')
for i, line in enumerate(txt.split('\n'), 1):
    if 'heroInit' in line:
        print('%5d: %s' % (i, line.rstrip()))
