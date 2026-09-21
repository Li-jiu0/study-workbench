# -*- coding: utf-8 -*-
"""R2A 资产戳统一脚本（安全版，遵循 study-workbench-deploy §2 六条约束）

- 二进制读写：行尾逐字节不变（防 §5.0「全站 CRLF 变 LF」事故）
- 属性锚定：只改 (src|href)="assets/<name>(?v=...)?"
- 捕获组不带后缀，替换串只出现一次 .js
- 终态用独立 pattern 复验：每资产戳值只能有 1 种
- 显式扫描污染：'.js.js?v=' 必须为 0；损坏签名必须为 0
"""
import os, re, sys, io

STAMP = '20260922c'
TREES = [
    r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3',
    r'D:\下载的文件\学习工作台',
]
# 本批内容真正改过的资产（最小变更：不动未改动资源的旧戳）
TARGETS = [
    'app.js', 'api.js', 'xt-settings.js', 'xt-update.js',
    'chat-local.js', 'xt-moments.js', 'img-viewer.js',
]
# 跨批次豁免名单（study-workbench-deploy §2）：不加载 assets/app.js 的 5 个页面
KEEP_OLD = {'AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html', '好友申请.html', '登录.html'}


def attr_pat(name):
    return re.compile(
        rb'((?:src|href)\s*=\s*["\'])assets/' + re.escape(name.encode('ascii')) +
        rb'(\?v=[0-9A-Za-z]+)?(["\'])', re.IGNORECASE)


def run(root):
    if not os.path.isdir(root):
        print('SKIP(不存在):', root)
        return
    changed = 0
    for fn in sorted(os.listdir(root)):
        if not fn.endswith('.html') or '.bak' in fn:
            continue
        if fn in KEEP_OLD:
            continue
        p = os.path.join(root, fn)
        with open(p, 'rb') as f:
            raw = f.read()
        new = raw
        n = 0
        for name in TARGETS:
            new, k = attr_pat(name).subn(
                lambda m: m.group(1) + b'assets/' + name.encode('ascii') +
                          b'?v=' + STAMP.encode('ascii') + m.group(3),
                new)
            n += k
        if n and new != raw:
            with open(p, 'wb') as f:
                f.write(new)
            changed += 1
    print('[%s] 改写页面数 = %d' % (root, changed))


def verify(root):
    """独立 pattern 复验（与替换用的 pattern 不同）"""
    print('---- 终态复验: %s' % root)
    dist = {}
    for fn in sorted(os.listdir(root)):
        if not fn.endswith('.html') or '.bak' in fn:
            continue
        with open(os.path.join(root, fn), 'rb') as f:
            raw = f.read()
        for name in TARGETS:
            for m in re.finditer(
                    rb'(?:src|href)\s*=\s*["\']assets/' + re.escape(name.encode('ascii')) +
                    rb'(\?v=([0-9A-Za-z]+))?["\']', raw, re.IGNORECASE):
                key = m.group(2).decode('ascii') if m.group(2) else '\u88f8'
                dist.setdefault(name, {}).setdefault(key, []).append(fn)
    ok = True
    for name in TARGETS:
        d = dist.get(name)
        if not d:
            print('  %-16s 未被引用（TARGET 里可核）' % name)
            continue
        keys = list(d.keys())
        print('  %-16s 戳值=%s' % (name, {k: len(v) for k, v in d.items()}))
        if keys != [STAMP]:
            ok = False
            print('      ★异常：戳值不唯一')
    # 污染扫描
    for fn in sorted(os.listdir(root)):
        if not fn.endswith('.html') or '.bak' in fn:
            continue
        with open(os.path.join(root, fn), 'rb') as f:
            raw = f.read()
        if b'.js.js?v=' in raw:
            print('  ★污染 .js.js?v= 命中:', fn); ok = False
        for m in re.finditer(rb'\.js\?v=[0-9A-Za-z]+"[^>\s]', raw):
            print('  ★损坏签名:', fn, m.group(0)[:60]); ok = False
    print('  复验结论:', 'PASS' if ok else 'FAIL')
    return ok


if __name__ == '__main__':
    for t in TREES:
        run(t)
    allok = True
    for t in TREES:
        allok = verify(t) and allok
    print('ALL_OK' if allok else 'HAS_PROBLEM')
