# -*- coding: utf-8 -*-
"""批次九 · Wave1收尾 + N9-25 补充包：部署前最终 QA（一次跑完，一次性出结论）"""
import os, re, io, subprocess

ROOT = r'D:\下载的文件\学习工作台'
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
OUT = os.path.join(ROOT, 'tools', 'qa', '_final_qa_out.txt')

def git(args):
    p = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false'] + args,
                       capture_output=True)
    b = p.stdout
    try:
        return b.decode('utf-8')
    except Exception:
        return b.decode('gbk', errors='replace')

changed = [l.strip() for l in git(['diff', '--name-only', 'HEAD']).splitlines() if l.strip()]
targets = [f for f in changed if not f.lower().endswith('.md')]

def read(p):
    with io.open(os.path.join(ROOT, p), encoding='utf-8', errors='replace') as f:
        return f.read()

L = []
L.append('=== 0. 改动面 ===')
L.append('共 %d 个文件（已剔除 .md）：' % len(targets))
for t in targets:
    L.append('  - ' + t)

# 1. 老 WebView 禁用语法
BAN = [
    ('可选链 ?.',      re.compile(r'\?\.[A-Za-z0-9_(\["]')),
    ('空值合并 ??',    re.compile(r'\?\?')),
    ('replaceAll',   re.compile(r'\breplaceAll\s*\(')),
    ('Object.fromEntries', re.compile(r'Object\s*\.\s*fromEntries')),
    ('Array.at',     re.compile(r'\.\s*at\s*\(\s*-?\d+\s*\)')),
    ('正则lookbehind', re.compile(r'\(\?<[=!]')),
]
L.append('')
L.append('=== 1. 老 WebView 禁用语法扫描（必须全 0）===')
ban_hit = 0
for t in targets:
    s = read(t)
    hits = []
    for name, rx in BAN:
        m = rx.findall(s)
        if m:
            hits.append('%s x%d' % (name, len(m)))
    if hits:
        ban_hit += len(hits)
        L.append('  [NG] %s : %s' % (t, ' / '.join(hits)))
L.append('  -> 命中文件数 = %d' % ban_hit)

# 2. 原生弹窗
L.append('')
L.append('=== 2. 原生 alert/confirm/prompt（必须 0）===')
rx_native = re.compile(r'(?<![A-Za-z0-9_.])(alert|confirm|prompt)\s*\(')
n_hit = 0
for t in targets:
    s = read(t)
    ms = rx_native.findall(s)
    if ms:
        n_hit += len(ms)
        L.append('  [NG] %s : %s x%d' % (t, ms[0], len(ms)))
L.append('  -> 命中总数 = %d' % n_hit)

# 3. node --check
L.append('')
L.append('=== 3. node --check（改动的 .js）===')
js = [t for t in targets if t.lower().endswith('.js')]
for j in js:
    p = subprocess.run([NODE, '--check', os.path.join(ROOT, j)], capture_output=True)
    L.append('  rc=%d  %s  %s' % (p.returncode, j,
             ((p.stderr or b'').decode('utf-8', 'replace')[:200].replace('\n', ' ')) if p.returncode else ''))

# 4. 版本戳清单
L.append('')
L.append('=== 4. 全站版本戳清单（根 HTML 引用 assets/*.js?v=）===')
htmls = sorted([f for f in os.listdir(ROOT) if f.lower().endswith('.html')])
inv = {}
for h in htmls:
    s = read(h)
    stamps = sorted(set(re.findall(r'assets/([A-Za-z0-9_\-]+\.js)\?v=([0-9a-zA-Z]+)', s)))
    for fn, st in stamps:
        inv.setdefault(fn, {}).setdefault(st, []).append(h)
for fn in sorted(inv):
    parts = []
    for st in sorted(inv[fn]):
        parts.append('%s: %d页' % (st, len(inv[fn][st])))
    L.append('  %-26s %s' % (fn, ' | '.join(parts)))
L.append('')
L.append('  -- 非最新戳页面明细（针对最常见的那个戳之外的）--')
for fn in sorted(inv):
    if len(inv[fn]) > 1:
        for st in sorted(inv[fn]):
            L.append('    %s  %s -> %s' % (fn, st, ', '.join(inv[fn][st])))

# 5. 本次重点 XPath 断言
L.append('')
L.append('=== 5. 关键落点断言 ===')
def has(f, pat):
    return re.search(pat, read(f)) is not None
CHECKS = [
    ('商务礼仪面试.html', r'ivQuizSubmit',        '今日一题 提交函数'),
    ('商务礼仪面试.html', r'interview_daily_answers', 'localStorage 键'),
    ('私聊.html',         r"activeEntry|acEntry",  '联系管理员入口'),
    ('学习博客.html',     r'blogViewStats',        '统计容器'),
    ('四级备考.html',     r'cet-read\.js\?v=20260915f', 'cet-read 戳 f'),
    ('assets/cet-read.js', r'cr-col-quiz',         '阅读右栏'),
    ('更多.html',         r'mp-group|mpGroup|fold', '更多分组折叠'),
    ('学习工作台.html',   r'各模块进度',            '首页模块进度'),
]
for f, pat, desc in CHECKS:
    try:
        ok = has(f, pat)
    except Exception as e:
        ok = False
    L.append('  %-6s %-24s %s' % ('OK' if ok else 'MISS', desc, f))

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(L))
print('done')
