# -*- coding: utf-8 -*-
import os
import re
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'AI.html', '工具.html', '学习工作台.html', '登录.html'}

ITEM_RE = re.compile(r'<(?:div|a)\s+class="bottom-nav-item')
TAG_RE = re.compile(r'<div\b|</div>|<a\b|</a>')


def find_items(html):
    items = []
    pos = 0
    while True:
        m = ITEM_RE.search(html, pos)
        if not m:
            break
        start = m.start()
        j = start
        depth = 0
        end = None
        while True:
            mo = TAG_RE.search(html, j)
            if not mo:
                break
            if mo.group().startswith('</'):
                depth -= 1
                if depth == 0:
                    end = mo.end()
                    break
            else:
                depth += 1
            j = mo.end()
        if end is None:
            break
        items.append((start, end))
        pos = end
    return items


def label_of(block):
    m = re.search(r'class="bn-label"[^>]*>([^<]*)<', block)
    if m:
        return m.group(1).strip()
    m = re.search(r'data-page="([^"]+)"', block)
    if m:
        return '[' + m.group(1) + ']'
    return '?'


lines = []
bad = []
prod_ok = 0
nav_pages = 0
for name in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, name)
    if not os.path.isfile(p) or not name.endswith('.html') or name in SKIP:
        continue
    with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()

    # prod tag 位置校验
    head_end = html.find('</head>')
    head = html[:head_end] if head_end != -1 else html
    first_script = re.search(r'<script', head, re.I)
    has_prod = 'window.__XT_PROD__=true' in head
    prod_pos_ok = False
    if has_prod and first_script:
        prod_pos_ok = head.find('window.__XT_PROD__=true') < first_script.start()
    if has_prod:
        prod_ok += 1

    items = find_items(html)
    if items:
        nav_pages += 1
        labels = [label_of(html[s:e]) for (s, e) in items]
        has_ai = any('AI' == l for l in labels)
        line = u'%-22s n=%d %s | AI=%s' % (name, len(items), u'/'.join(labels), has_ai)
        if len(items) != 5 or not has_ai:
            bad.append(line)
        lines.append(line)
    else:
        line = u'%-22s 无bottom-nav-item | bottom-nav出现=%s | prod=%s' % (
            name, ('bottom-nav' in html), has_prod)
        lines.append(line)
    if not has_prod:
        bad.append(u'缺__XT_PROD__: ' + name)

lines.append(u'')
lines.append(u'含 __XT_PROD__ 页面数: %d' % prod_ok)
lines.append(u'含底部导航页面数: %d' % nav_pages)
lines.append(u'异常项: %s' % (u' | '.join(bad) if bad else u'无'))

with io.open(os.path.join(ROOT, 'tools', '_nav_prod_verify.txt'), 'w', encoding='utf-8') as f:
    f.write(u'\n'.join(lines))
