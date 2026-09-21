# -*- coding: utf-8 -*-
"""全站机械改造：底部导航删除「工具」项 + 开启生产模式 __XT_PROD__
处理范围：根目录 *.html，排除 AI.html / 工具.html / 学习工作台.html / 登录.html
"""
import os
import re
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'AI.html', '工具.html', '学习工作台.html', '登录.html'}
EXCLUDE_DIRS = {'备份', '_w2t1_img', 'tools', '.qa', 'node_modules', 'assets'}

PROD_TAG = '<script>window.__XT_PROD__=true;</script>'


def list_targets():
    out = []
    for name in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, name)
        if not os.path.isfile(p):
            continue
        if not name.endswith('.html'):
            continue
        if name in SKIP:
            continue
        out.append(p)
    return out


ITEM_RE = re.compile(r'<(?:div|a)\s+class="bottom-nav-item')
TAG_RE = re.compile(r'<div\b|</div>|<a\b|</a>')


def find_items(html):
    """返回所有 bottom-nav-item 块 (start, end)"""
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
            t = mo.group()
            if t.startswith('</'):
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


def icon_markup(sample_block, icon_name):
    """按同文件已有写法生成图标标签"""
    m = re.search(r'<span class="nav-icon"[^>]*data-icon="[^"]+"[^>]*>\s*</span>', sample_block)
    if m:
        return re.sub(r'data-icon="[^"]+"', 'data-icon="%s"' % icon_name, m.group(0))
    m = re.search(r'<div class="bn-icon"[^>]*data-icon="[^"]+"[^>]*>\s*</div>', sample_block)
    if m:
        return re.sub(r'data-icon="[^"]+"', 'data-icon="%s"' % icon_name, m.group(0))
    return '<div class="bn-icon" data-icon="%s"></div>' % icon_name


def build_ai_item(sample_block, indent):
    icon = icon_markup(sample_block, 'sparkles')
    return ('%s<div class="bottom-nav-item" onclick="location.href=\'AI.html\'">'
            '<div class="bn-icon">%s</div><div class="bn-label">AI</div></div>'
            % (indent, icon))


def dedent_of(html, start):
    """取该行起始缩进"""
    ls = html.rfind('\n', 0, start)
    line = html[ls + 1:start]
    return re.match(r'[\t ]*', line).group(0)


def process(path):
    with io.open(path, 'r', encoding='utf-8', errors='replace', newline='') as f:
        html = f.read()
    orig = html
    name = os.path.basename(path)
    res = {'name': name, 'nav': False, 'removed': 0, 'ai_added': False,
           'prod': False, 'prod_exists': False, 'items': 0, 'err': ''}

    # ---------- 任务 A：底部导航 ----------
    items = find_items(html)
    if items:
        res['nav'] = True
        # 从后往前删，避免索引偏移
        for (s, e) in reversed(items):
            block = html[s:e]
            if 'wrench' in block or ('工具.html' in block and '>工具<' in block):
                # 连同其后空白/换行一起删
                e2 = e
                while e2 < len(html) and html[e2] in ' \t':
                    e2 += 1
                if html[e2:e2 + 2] == '\r\n':
                    e2 += 2
                elif html[e2:e2 + 1] == '\n':
                    e2 += 1
                html = html[:s] + html[e2:]
                res['removed'] += 1

        items2 = find_items(html)
        res['items'] = len(items2)
        has_ai = any(('AI.html' in html[s:e]) or ('>AI<' in html[s:e]) for (s, e) in items2)
        if not has_ai and items2:
            # 找首页项，插到其后
            target = None
            for (s, e) in items2:
                if '>首页<' in html[s:e] or 'home' in html[s:e]:
                    target = e
                    break
            if target is None:
                target = items2[0][1]
            nl = '\r\n' if '\r\n' in html else '\n'
            ind = dedent_of(html, items2[0][0])
            ins = nl + nl.join(build_ai_item(html[items2[0][0]:items2[0][1]], ind).splitlines())
            html = html[:target] + ins + html[target:]
            res['ai_added'] = True
            res['items'] = len(find_items(html))

    # ---------- 任务 B：生产模式 ----------
    if '__XT_PROD__' in html:
        res['prod_exists'] = True
    else:
        head_end = html.find('</head>')
        m = re.search(r'<script', html, re.I)
        if m and (head_end == -1 or m.start() < head_end):
            pos = m.start()
            nl = '\r\n' if '\r\n' in html else '\n'
            ind = dedent_of(html, pos)
            html = html[:pos] + PROD_TAG + nl + ind + html[pos:]
            res['prod'] = True
        elif head_end != -1:
            nl = '\r\n' if '\r\n' in html else '\n'
            ind = dedent_of(html, head_end)
            html = html[:head_end] + ind + PROD_TAG + nl + html[head_end:]
            res['prod'] = True

    if html != orig:
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(html)
    return res


def main():
    targets = list_targets()
    lines = []
    total_removed = 0
    total_prod = 0
    ai_pages = []
    navless = []
    for p in targets:
        try:
            r = process(p)
        except Exception as ex:
            lines.append(u'ERROR %s : %s' % (os.path.basename(p), ex))
            continue
        total_removed += r['removed']
        if r['prod']:
            total_prod += 1
        if r['ai_added']:
            ai_pages.append(r['name'])
        if not r['nav']:
            navless.append(r['name'])
        lines.append(u'%-22s nav=%-5s items=%-2s rm=%d ai_add=%s prod=%s%s' % (
            r['name'], r['nav'], r['items'], r['removed'], r['ai_added'],
            r['prod'], u'(已存在)' if r['prod_exists'] else u''))

    lines.append(u'')
    lines.append(u'处理文件数: %d' % len(targets))
    lines.append(u'删除工具项总数: %d' % total_removed)
    lines.append(u'插入 __XT_PROD__ 数: %d' % total_prod)
    lines.append(u'补插 AI 项页面: %s' % (u'、'.join(ai_pages) if ai_pages else u'无'))
    lines.append(u'无底部导航页面: %s' % (u'、'.join(navless) if navless else u'无'))

    out = os.path.join(ROOT, 'tools', '_nav_prod_report.txt')
    with io.open(out, 'w', encoding='utf-8') as f:
        f.write(u'\n'.join(lines))


if __name__ == '__main__':
    main()
