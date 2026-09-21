# -*- coding: utf-8 -*-
"""R2B 资产戳：只换本批真改过的 assets/xt-update.js 的引用戳（最小变更，§2.1）
新戳 20260922d（20260922c 已服务过生产，不可复用 —— §5.0.2）
二进制读写，属性锚定，终态独立复验。
"""
import os, re

STAMP = '20260922d'
TREES = [r'D:\下载的文件\学习工作台',
         r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3']
TARGETS = ['xt-update.js']
KEEP = {'AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html', '好友申请.html', '登录.html'}


def pat(name):
    return re.compile(rb'((?:src|href)\s*=\s*["\'])assets/' + re.escape(name.encode()) +
                      rb'(\?v=[0-9A-Za-z]+)?(["\'])', re.IGNORECASE)


def run(root):
    n = 0
    for fn in sorted(os.listdir(root)):
        if not fn.endswith('.html') or '.bak' in fn or fn in KEEP:
            continue
        p = os.path.join(root, fn)
        raw = open(p, 'rb').read()
        new = raw
        k = 0
        for name in TARGETS:
            new, c = pat(name).subn(
                lambda m: m.group(1) + b'assets/' + name.encode() + b'?v=' + STAMP.encode() + m.group(3), new)
            k += c
        if k and new != raw:
            open(p, 'wb').write(new)
            n += 1
    print('[%s] 改写 %d 页' % (root, n))


def verify(root):
    dist = {}
    for fn in sorted(os.listdir(root)):
        if not fn.endswith('.html') or '.bak' in fn:
            continue
        raw = open(os.path.join(root, fn), 'rb').read()
        for name in TARGETS:
            for m in re.finditer(rb'(?:src|href)\s*=\s*["\']assets/' + re.escape(name.encode()) +
                                 rb'(?:\?v=([0-9A-Za-z]+))?["\']', raw, re.IGNORECASE):
                dist.setdefault((m.group(1) or b'BARE').decode(), []).append(fn)
    print('  %s 戳值分布: %s' % (root.split(os.sep)[0], {k: len(v) for k, v in dist.items()}))
    return list(dist.keys()) == [STAMP]


if __name__ == '__main__':
    for t in TREES:
        run(t)
    ok = all(verify(t) for t in TREES)
    print('ALL_OK' if ok else 'HAS_PROBLEM')
