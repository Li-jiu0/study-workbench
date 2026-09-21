# -*- coding: utf-8 -*-
"""
全项目 bug 排查 (只读) -- v132
================================
覆盖 6 道闸: 语法 / 全局冲突 / 死链 / APK资源 / 明错 / (jsdom冒烟可选略)
产出: D:/下载的文件/学习工作台/_qa_report_v132.md
绝不修改任何业务文件。
"""
import os, re, sys, json, subprocess, glob

ROOT = r'D:\下载的文件\学习工作台'
TOOLS = os.path.join(ROOT, 'tools', 'qa')
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
PY = r'C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe'
OUT_REPORT = os.path.join(ROOT, '_qa_report_v132.md')
LOG = os.path.join(TOOLS, '_investigate_log.txt')
import sys as _sys
_logf = open(LOG, 'w', encoding='utf-8')
_sys.stdout = _logf
_sys.stderr = _logf

def jsfiles():
    out = []
    for p in glob.glob(os.path.join(ROOT, 'assets', '*.js')):
        nm = os.path.basename(p)
        if '.bak' in nm.lower() or '.backup' in nm.lower():
            continue
        out.append(p)
    return out

def htmlfiles():
    out = []
    for p in glob.glob(os.path.join(ROOT, '*.html')):
        nm = os.path.basename(p)
        if '.bak' in nm.lower() or '.backup' in nm.lower():
            continue
        out.append(p)
    return out

def strip_line(line):
    out = []
    i, n = 0, len(line)
    while i < n:
        c = line[i]
        if c == '/' and i + 1 < n and line[i + 1] == '/':
            break
        if c == '/' and i + 1 < n and line[i + 1] == '*':
            j = line.find('*/', i + 2)
            i = j + 2 if j != -1 else n
            continue
        if c in '"\'' or c == '`':
            q = c; i += 1
            while i < n:
                if line[i] == '\\': i += 2; continue
                if line[i] == q: i += 1; break
                i += 1
            continue
        out.append(c); i += 1
    return ''.join(out)

def strip_file(text):
    """多行感知的 JS 注释/字符串剥离.

    区别 strip_line(): 跨行 /* ... */ 块注释全程剥离; 模板字符串 `...` 仅剥离
    插值外文本, ${...} 内的代码保留供扫描; 行内 // 与单双引号剥离保持不变.
    返回按行切分的剥离后字符串列表(行数与 text.split('\\n') 一致).
    """
    lines = text.split('\n')
    out = [''] * len(lines)
    buf = []
    li = 0
    # 栈元素: ('block',) / ('sq',) / ('dq',) / ('tmpl',) / ('expr', depth)
    stack = []
    n = len(text)
    i = 0
    def flush():
        out[li] = ''.join(buf)
    while i < n:
        c = text[i]
        if c == '\n':
            flush(); li += 1; buf = []; i += 1; continue
        top = stack[-1] if stack else None
        if top is None or top[0] == 'expr':
            nx = text[i + 1] if i + 1 < n else ''
            if c == '/' and nx == '*':
                stack.append(('block',)); i += 2; continue
            if c == '/' and nx == '/':
                j = text.find('\n', i)
                i = n if j == -1 else j
                continue
            if c == "'":
                stack.append(('sq',)); i += 1; continue
            if c == '"':
                stack.append(('dq',)); i += 1; continue
            if c == '`':
                stack.append(('tmpl',)); i += 1; continue
            if top is not None and top[0] == 'expr':
                if c == '{':
                    stack[-1] = ('expr', top[1] + 1); buf.append(c); i += 1; continue
                if c == '}':
                    if top[1] <= 1:
                        stack.pop()
                    else:
                        stack[-1] = ('expr', top[1] - 1); buf.append(c)
                    i += 1; continue
                buf.append(c); i += 1; continue
            buf.append(c); i += 1; continue
        elif top[0] == 'block':
            if c == '*' and i + 1 < n and text[i + 1] == '/':
                stack.pop(); i += 2; continue
            i += 1; continue
        elif top[0] in ('sq', 'dq'):
            if c == '\\':
                i += 2; continue
            q = "'" if top[0] == 'sq' else '"'
            if c == q:
                stack.pop(); i += 1; continue
            i += 1; continue
        elif top[0] == 'tmpl':
            if c == '\\':
                i += 2; continue
            if c == '`':
                stack.pop(); i += 1; continue
            if c == '$' and i + 1 < n and text[i + 1] == '{':
                stack.append(('expr', 1)); i += 2; continue
            i += 1; continue
    flush()
    return out

FORBIDDEN = [
    ('optional_chaining', re.compile(r'(?<![?\w])\?\.')),
    ('nullish_coalescing', re.compile(r'\?\?')),
    ('replaceAll', re.compile(r'\.replaceAll\(')),
    ('Object.fromEntries', re.compile(r'Object\.fromEntries')),
    ('Array.at', re.compile(r'\.at\(')),
    ('lookbehind_pos', re.compile(r'\(\?<=')),
    ('lookbehind_neg', re.compile(r'\(\?<!')),
    ('exponent', re.compile(r'\*\*')),
    ('optional_catch', re.compile(r'catch\s*\{')),
    ('object_spread', re.compile(r'\{\s*\.\.\.')),
]

def scan_forbidden(js_list):
    hits = []  # (file, line, name)
    for p in js_list:
        try:
            text = open(p, 'r', encoding='utf-8', errors='replace').read()
        except Exception as e:
            continue
        stripped = strip_file(text)
        for idx, s in enumerate(stripped, 1):
            if not s.strip():
                continue
            for name, rx in FORBIDDEN:
                if rx.search(s):
                    hits.append((os.path.relpath(p, ROOT), idx, name))
    return hits

def node_check(js_list):
    bad = []  # (file, msg)
    for p in js_list:
        try:
            r = subprocess.run([NODE, '--check', p], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
        except Exception as e:
            bad.append((os.path.relpath(p, ROOT), 'RUN_ERROR: ' + str(e)))
            continue
        if r.returncode != 0:
            msg = (r.stderr or r.stdout).strip().split('\n')
            msg = msg[-1] if msg else 'syntax error'
            bad.append((os.path.relpath(p, ROOT), msg[:160]))
    return bad

def top_level_await(js_list):
    found = []  # (file, [lines])
    for p in js_list:
        try:
            text = open(p, 'r', encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        stripped = strip_file(text)
        has_async = any('async' in s for s in stripped)
        if has_async:
            continue
        awaits = []
        for idx, s in enumerate(stripped, 1):
            if re.search(r'(?<![.\w])await\s', s):
                awaits.append(idx)
        if awaits:
            found.append((os.path.relpath(p, ROOT), awaits[:5], len(awaits)))
    return found

# ---- 全局冲突 (复用 global_name_scan) ----
def global_conflicts():
    r = subprocess.run([PY, os.path.join(TOOLS, 'global_name_scan_20260916m.py')],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)
    rep = os.path.join(TOOLS, 'global_name_out_20260916m.txt')
    txt = open(rep, 'r', encoding='utf-8', errors='replace').read() if os.path.exists(rep) else ''
    conflicts = []  # (name, sev, files_with_kinds)
    cur = None
    for ln in txt.split('\n'):
        m = re.match(r'\s*\[(FATAL|RISK|WARN)[^\]]*\]\s*(\S+)\s+出现于', ln)
        if m:
            cur = {'name': m.group(2), 'sev': m.group(1), 'files': []}
            conflicts.append(cur)
            continue
        mf = re.match(r'\s*-\s+(\S+)\s*:\s*(.+)', ln)
        if mf and cur is not None:
            cur['files'].append((mf.group(1), mf.group(2).strip()))
    return conflicts

def decl_line(rel, name):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return '?'
    try:
        lines = open(p, 'r', encoding='utf-8', errors='replace').read().split('\n')
    except Exception:
        return '?'
    rx1 = re.compile(r'(?:var|let|const|function|class)\s+' + re.escape(name) + r'\b')
    rx2 = re.compile(r'\b' + re.escape(name) + r'\b')
    for i, l in enumerate(lines, 1):
        if rx1.search(l):
            return str(i)
    for i, l in enumerate(lines, 1):
        if rx2.search(l):
            return str(i)
    return '?'

# ---- 死链 + 资源引用 ----
SKIP_PREFIX = ('http://', 'https://', 'mailto:', 'tel:', 'javascript:', '#', 'data:', 'blob:', './')

def scan_html_links(html_list):
    dead = []      # (file, line, target, kind)
    missing_asset = []  # (file, line, asset)
    for p in html_list:
        try:
            lines = open(p, 'r', encoding='utf-8', errors='replace').read().split('\n')
        except Exception:
            continue
        rel = os.path.relpath(p, ROOT)
        for idx, ln in enumerate(lines, 1):
            # 导航目标: location.href = '...' / "..."  (含 window.location)
            for m in re.finditer(r'location\.href\s*=\s*["\']([^"\']+)["\']', ln):
                t = m.group(1)
                # 动态拼接 location.href = '...' + var 豁免: 静态前缀非真实文件, 属误报
                after = ln[m.end():].lstrip()
                if after.startswith('+'):
                    continue
                if t.startswith(SKIP_PREFIX) or t.startswith('http'):
                    continue
                base = t.split('#')[0]
                if not base or base.startswith('?'):
                    continue
                if base.startswith('./'):
                    base = base[2:]
                if not os.path.exists(os.path.join(ROOT, base)):
                    dead.append((rel, idx, base, 'location.href'))
            # <a href="...">
            for t in re.findall(r'<a\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', ln, re.I):
                if t.startswith(SKIP_PREFIX) or t.startswith('http'):
                    continue
                base = t.split('#')[0]
                if not base or base.startswith('?'):
                    continue
                if base.startswith('./'):
                    base = base[2:]
                if not os.path.exists(os.path.join(ROOT, base)):
                    dead.append((rel, idx, base, 'a.href'))
            # 资源引用: src=/href= 指向本地 assets 或相对文件
            for t in re.findall(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', ln, re.I):
                if t.startswith(SKIP_PREFIX) or t.startswith('http'):
                    continue
                if ('assets/' in t) or t.endswith('.js') or t.endswith('.css') or t.endswith('.png') or t.endswith('.jpg') or t.endswith('.svg') or t.endswith('.woff') or t.endswith('.json'):
                    base = t[2:] if t.startswith('./') else t
                    if not os.path.exists(os.path.join(ROOT, base)):
                        missing_asset.append((rel, idx, base))
            # url(...) 内联
            for t in re.findall(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', ln):
                if t.startswith(SKIP_PREFIX) or t.startswith('http') or t.startswith('data:'):
                    continue
                if 'assets/' in t:
                    base = t[2:] if t.startswith('./') else t
                    if not os.path.exists(os.path.join(ROOT, base)):
                        missing_asset.append((rel, idx, base))
    return dead, missing_asset

# ---- 明错: 重复 id ----
def duplicate_ids(html_list):
    dups = []  # (file, id, count)
    for p in html_list:
        try:
            text = open(p, 'r', encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        rel = os.path.relpath(p, ROOT)
        ids = re.findall(r'\bid\s*=\s*["\']([^"\']+)["\']', text, re.I)
        seen = {}
        for x in ids:
            seen[x] = seen.get(x, 0) + 1
        for x, c in seen.items():
            if c > 1:
                dups.append((rel, x, c))
    return dups

# ---- 明错: getElementById 未判空直接解引用 (抽样) ----
def gebi_risky(html_list, js_list, limit=10):
    samples = []
    files = html_list + js_list
    for p in files:
        try:
            lines = open(p, 'r', encoding='utf-8', errors='replace').read().split('\n')
        except Exception:
            continue
        rel = os.path.relpath(p, ROOT)
        for idx, ln in enumerate(lines, 1):
            s = strip_line(ln)
            if re.search(r'getElementById\([^)]*\)\.\s*(?:style|innerHTML|innerText|textContent|value|classList|appendChild|setAttribute|remove|addEventListener|src|href)', s):
                samples.append((rel, idx, ln.strip()[:120]))
                if len(samples) >= limit:
                    return samples
    return samples

# ---- 明错: onclick 引用未定义函数 (跨文件粗查) ----
BUILTIN_CALLS = set(['if','for','while','switch','catch','function','return','typeof','new','do',
    'else','case','var','let','const','await','yield','with','in','of','void','delete','throw',
    'window','document','console','this','requestAnimationFrame','setTimeout','setInterval',
    'addEventListener','querySelector','querySelectorAll','getElementById','navigateTo','goBack',
    'toggleTheme','alert','confirm','prompt','location','history','Math','JSON','Object','Array',
    'String','Number','Boolean','Date','parseInt','parseFloat','isNaN','setProperty'])

def collect_defs(js_list, html_list):
    defs = set()
    files = js_list + html_list
    for p in files:
        try:
            text = open(p, 'r', encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        # inline scripts of html
        bodies = [text]
        for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', text):
            bodies.append(m.group(1))
        for b in bodies:
            for mm in re.finditer(r'function\s+([A-Za-z_$][\w$]*)\s*\(', b):
                defs.add(mm.group(1))
            for mm in re.finditer(r'(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function', b):
                defs.add(mm.group(1))
            for mm in re.finditer(r'(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>', b):
                defs.add(mm.group(1))
    return defs

def onclick_undef(html_list, defs):
    found = []  # (file, line, call)
    for p in html_list:
        try:
            lines = open(p, 'r', encoding='utf-8', errors='replace').read().split('\n')
        except Exception:
            continue
        rel = os.path.relpath(p, ROOT)
        for idx, ln in enumerate(lines, 1):
            for m in re.finditer(r'onclick\s*=\s*["\']([^"\']*)["\']', ln, re.I):
                handler = m.group(1)
                for cm in re.finditer(r'([A-Za-z_$][\w$]*)\s*\(', handler):
                    name = cm.group(1)
                    if name in BUILTIN_CALLS or name in defs:
                        continue
                    # 排除对象方法调用 obj.method(
                    # 粗略: 若前面紧跟 . 则跳过
                    pos = cm.start()
                    if pos > 0 and handler[pos - 1] == '.':
                        continue
                    found.append((rel, idx, name))
    return found

# ---- APK 资源闸 ----
def apk_gate():
    bp = os.path.join(ROOT, 'android', 'build_apk.py')
    text = open(bp, 'r', encoding='utf-8', errors='replace').read()
    m = re.search(r'REQUIRED_ASSETS\s*=\s*\[(.*?)\]', text, re.S)
    required = []
    if m:
        required = re.findall(r'["\']([^"\']+)["\']', m.group(1))
    # 实际 assets 文件(含子目录)
    actual = set()
    for root, dirs, files in os.walk(os.path.join(ROOT, 'assets')):
        for f in files:
            if '.bak' in f.lower():
                continue
            actual.add(os.path.relpath(os.path.join(root, f), os.path.join(ROOT, 'assets')).replace('\\', '/'))
    missing_required = [a for a in required if a not in actual]
    # HTML 引用的核心运行时 JS
    core_js = ['icon-map.js', 'subpage-router.js', 'emoji/manifest.js', 'api.js', 'app.js',
              'config.js', 'chat-local.js', 'xt-android.js', 'ai-service.js', 'ai-page.js', 'common.css']
    html_refs = set()
    for p in htmlfiles():
        text = open(p, 'r', encoding='utf-8', errors='replace').read()
        for t in re.findall(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', text, re.I):
            if 'assets/' in t:
                html_refs.add(t.split('?')[0])
    not_in_whitelist = [h for h in sorted(html_refs) if h.replace('assets/', '', 1) not in required]
    return required, missing_required, actual, not_in_whitelist

# =================== 主流程 ===================
def main():
    F = []  # findings: dict(level, loc, desc, fix)
    def add(level, loc, desc, fix):
        F.append({'level': level, 'loc': loc, 'desc': desc, 'fix': fix})

    js = jsfiles()
    html = htmlfiles()

    # ---- 闸1 语法 ----
    bad_syntax = node_check(js)
    for f, msg in bad_syntax:
        add('P0', f, 'node --check 语法错误: ' + msg, '用 acorn/浏览器定位并修正语法')
    forb = scan_forbidden(js)
    # 归类
    forb_by_file = {}
    for f, ln, name in forb:
        forb_by_file.setdefault(f, []).append((ln, name))
    for f, items in sorted(forb_by_file.items()):
        # 同文件合并
        names = {}
        for ln, name in items:
            names.setdefault(name, []).append(ln)
        parts = []
        for name, lns in names.items():
            parts.append('%s@%s' % (name, ','.join(map(str, lns[:8]))))
        add('P0', f, '禁用语法命中: ' + '; '.join(parts) + ' (老WebView仅ES2017, 触发即整文件白屏)', '改用 ES2017 等价写法')
    tla = top_level_await(js)
    for f, lns, cnt in tla:
        add('P0', f, '疑似顶层 await (%d 处, 文件无 async): 行 %s (老WebView不支持, 整文件白屏)' % (cnt, ','.join(map(str, lns))), '移入 async 函数或改为 Promise')

    # ---- 闸2 全局冲突 ----
    confs = global_conflicts()
    for c in confs:
        sev = c['sev']
        level = 'P0' if sev == 'FATAL' else ('P1' if sev == 'RISK' else 'P2')
        locs = []
        for f, kinds in c['files']:
            locs.append('%s:%s(%s)' % (f, decl_line(f, c['name']), kinds))
        add(level, ' / '.join(locs), '全局名「%s」在 %d 个文件重复声明 [%s]' % (c['name'], len(c['files']), sev),
            '改为 window.%s 守卫或改名, 避免重复声明 SyntaxError 整文件白屏' % c['name'])

    # ---- 闸3 死链 / 资源 ----
    dead, missing_asset = scan_html_links(html)
    for f, ln, tgt, kind in dead:
        add('P1', '%s:%d' % (f, ln), '死链/缺失跳转目标: %s (%s)' % (tgt, kind), '补全目标页或修正路径')
    for f, ln, a in missing_asset:
        ext = os.path.splitext(a)[1].lower()
        lvl = 'P1' if ext in ('.js', '.css') else 'P2'
        add(lvl, '%s:%d' % (f, ln), '引用的本地资源不存在: %s' % a, '补文件或修正引用路径')

    # ---- 闸4 APK 资源 ----
    required, missing_required, actual, not_in_wl = apk_gate()
    for a in missing_required:
        add('P0', 'android/build_apk.py', 'APK 白名单 REQUIRED_ASSETS 缺失源文件: %s (打包将中止)' % a, '补该资源或从白名单移除')
    for a in not_in_wl:
        add('P2', 'assets', 'HTML 引用但不在 APK 白名单(防删盲点): %s' % a, '若为核心运行时JS, 加入 REQUIRED_ASSETS')

    # ---- 闸5 明错 ----
    dups = duplicate_ids(html)
    for f, x, c in dups:
        add('P2', f, '重复 id「%s」出现 %d 次 (getElementById 只取首个)' % (x, c), '改为唯一 id')
    risky = gebi_risky(html, js, 10)
    for f, ln, snippet in risky:
        add('P1', '%s:%d' % (f, ln), 'getElementById 结果未判空直接解引用: %s' % snippet, '先判空 if(el) 再操作, 防元素缺失抛 TypeError')
    undef = onclick_undef(html, collect_defs(js, html))
    seen_u = set()
    for f, ln, name in undef:
        if name in seen_u:
            continue
        seen_u.add(name)
        add('P1', '%s:%d' % (f, ln), 'onclick 调用疑似未定义函数: %s (跨文件未找到定义)' % name, '确认函数已定义或在对应页面引入脚本')

    # ---- 汇总 + 写报告 ----
    counts = {'P0': 0, 'P1': 0, 'P2': 0}
    for x in F:
        counts[x['level']] += 1
    L = []
    L.append('# 星途全项目 Bug 排查报告 (v132, 只读)')
    L.append('')
    L.append('- 时间: ' + __import__('datetime').datetime.now().isoformat())
    L.append('- 范围: 根目录全部 HTML + assets/*.js (排除 .bak/.backup)')
    L.append('- 原则: 只查不修, 未改动任何业务文件')
    L.append('- 扫描文件: %d 个 JS, %d 个 HTML' % (len(js), len(html)))
    L.append('')
    L.append('## 汇总')
    L.append('')
    L.append('| 等级 | 数量 | 含义 |')
    L.append('|------|------|------|')
    L.append('| P0 | %d | 白屏/整文件报废(老WebView) |' % counts['P0'])
    L.append('| P1 | %d | 功能坏/死链/解引用崩溃 |' % counts['P1'])
    L.append('| P2 | %d | 体验/隐患 |' % counts['P2'])
    L.append('')
    order = {'P0': 0, 'P1': 1, 'P2': 2}
    F.sort(key=lambda x: (order[x['level']], x['loc']))
    cur = None
    for x in F:
        if x['level'] != cur:
            cur = x['level']
            L.append('')
            L.append('## %s 级发现' % cur)
            L.append('')
            L.append('| 位置 | 说明 | 建议修法 |')
            L.append('|------|------|----------|')
        L.append('| `%s` | %s | %s |' % (x['loc'], x['desc'], x['fix']))
    L.append('')
    L.append('## 备注')
    L.append('')
    L.append('- 闸6 (jsdom 控制台冒烟) 为可选项, 本次未执行(避免对并行施工的 3 位 UI 工程师造成干扰, 且需本地静态服务); 建议在波末稳定后用 page_check.js / multi_check.js 跑运行时体检。')
    L.append('- 禁用语法扫描已用多行感知剥离: 跨行 /* */ 块注释、行内 // 与单双引号字符串、模板字符串 `...`(插值外文本剥离, ${} 内代码保留)。块注释说明文字/示例(如禁用语法清单、`**` 加粗、`{...}` 示例)不再误报。若 `**` 仍有命中, 需人工 Read 确认是否真在可执行代码里的指数运算。')
    L.append('- 全局冲突闸基于 acorn AST 作用域分析(非正则启发), 隐式全局与函数局部已区分; FATAL=两文件均 let/const/class, RISK=let/const 配 var/function(看加载顺序), WARN=仅 var/function/implicit。')
    report = '\n'.join(L)
    open(OUT_REPORT, 'w', encoding='utf-8').write(report)
    print('REPORT WRITTEN: ' + OUT_REPORT)
    print('P0=%d P1=%d P2=%d total=%d' % (counts['P0'], counts['P1'], counts['P2'], len(F)))

if __name__ == '__main__':
    main()
