# -*- coding: utf-8 -*-
# R72 任务三：静态自测（行尾 / ES2017 禁令 / 版本号 / 静态引用 / 全局名 / 计数）
import io, os, re, glob

BASE = r'D:\下载的文件\学习工作台'
out = []
def log(s): out.append(s)
def check(name, cond, extra=''):
    log(('PASS' if cond else 'FAIL') + ' | ' + name + ((' | ' + str(extra)) if extra != '' else ''))
    return cond

TOUCHED = [
    '学习工作台.html', '演示.html', '个人中心.html', '更多.html', '关于.html', '学习概括.html',
    '我的文件.html', '导入题库.html',
    'assets/app.js', 'assets/importer.js',
    'AI.html', 'blog_wechat.html', 'PPT案例拆解.html', 'PPT版式库.html', '万能金句库.html',
    '企业定向库.html', '动态.html', '商务礼仪.html', '四级词汇.html', '场景话术库.html',
    '时政热点.html', '工具.html', '私聊.html', '申论刷题.html', '社区.html', '英语.html',
    '行测刷题.html', '管理员.html', '行测.html', '面试题库.html', '设置.html', '错题本.html',
    '面测.html', '表达.html',
]

def read_text(p):
    t = io.open(p, 'r', encoding='utf-8-sig', newline='').read()
    return t.replace('\r\n', '\n').replace('\r', '\n')

def raw(p):
    return open(p, 'rb').read()

# ① 行尾
log('=== ① 行尾（CRLF，loneLF==0）===')
for f in TOUCHED:
    p = os.path.join(BASE, f)
    b = raw(p)
    lone = b.count(b'\n') - b.count(b'\r\n')
    check('loneLF==0 %s' % f, lone == 0, 'loneLF=%d' % lone)

# ② 新增/改动文件语法（node --check 在 bash 单独跑；此处做基础括号平衡？略）
log('=== ② 见 node --check 输出（bash） ===')

# ③ ES2017 禁令
log('=== ③ ES2017 禁令逐项 0 命中（在去除注释与字符串字面后的代码上判定）===')

def strip_js(t):
    """去 // 行注释、/* */ 块注释、'\"` 字符串/模板字面（保留换行）；不处理正则字面量，
       故后行断言等「正则内」禁令仍可被检出。"""
    out = []
    i = 0
    n = len(t)
    state = 'code'
    while i < n:
        c = t[i]
        if state == 'code':
            if c == '/' and i + 1 < n and t[i + 1] == '/':
                state = 'line'; i += 2; continue
            if c == '/' and i + 1 < n and t[i + 1] == '*':
                state = 'block'; i += 2; continue
            if c == "'" or c == '"' or c == '`':
                state = c; i += 1; continue
            out.append(c); i += 1
        elif state == 'line':
            if c == '\n':
                state = 'code'; out.append('\n')
            i += 1
        elif state == 'block':
            if c == '*' and i + 1 < n and t[i + 1] == '/':
                state = 'code'; i += 2; continue
            if c == '\n':
                out.append('\n')
            i += 1
        else:
            if c == '\\':
                i += 2; continue
            if c == state:
                state = 'code'
            i += 1
    return ''.join(out)

PATTERNS = {
    '可选链 ?.': re.compile(r'\?\.'),
    '空值合并 ??': re.compile(r'\?\?'),
    '对象展开 {...': re.compile(r'\{\s*\.\.\.'),
    '对象剩余 ...}': re.compile(r'\.\.\.\s*[A-Za-z_$][\w$]*\s*\}'),
    '.replaceAll(': re.compile(r'\.replaceAll\('),
    'Object.fromEntries': re.compile(r'Object\.fromEntries'),
    '.at(': re.compile(r'\.at\('),
    '后行断言 (?<=': re.compile(r'\(\?<='),
    '后行断言 (?<!': re.compile(r'\(\?<!'),
    '指数 **': re.compile(r'[A-Za-z0-9_\)\]]\s*\*\*\s*[A-Za-z0-9_\(]'),
    '可选 catch 绑定': re.compile(r'catch\s*\{'),
}
for f in TOUCHED + ['工具.html']:
    p = os.path.join(BASE, f)
    raw_t = read_text(p)
    t = strip_js(raw_t)
    hits = []
    for nm, rx in PATTERNS.items():
        m = rx.findall(t)
        if m:
            hits.append('%s x%d' % (nm, len(m)))
    check('ES2017 %s' % f, len(hits) == 0, ','.join(hits) if hits else '')
    # 透明化：仅在注释/字符串里出现的（非真实语法）逐条列出，供人工核对
    raw_only = []
    for nm, rx in PATTERNS.items():
        if rx.findall(raw_t) and not rx.findall(t):
            raw_only.append(nm)
    if raw_only:
        log('      (注) %s：以下禁令仅出现在注释/字符串字面中（非真实语法）：%s' % (f, ','.join(raw_only)))

# ④ 全局名交集：xtFiles 仅出现在 我的文件.html 与 importer.js
log('=== ④ 全局名交集 ===')
files_with_xtfiles = []
for f in sorted(glob.glob(os.path.join(BASE, '*.html'))) + sorted(glob.glob(os.path.join(BASE, 'assets', '*.js'))):
    base = os.path.basename(f)
    if base.endswith('.bak') or '.backup' in base or '.bak-' in base:
        continue
    try:
        t = read_text(f)
    except Exception:
        continue
    if 'xtFiles' in t:
        files_with_xtfiles.append(base)
check('xtFiles 仅出现在 我的文件.html + importer.js', set(files_with_xtfiles) == {'我的文件.html', 'importer.js'}, files_with_xtfiles)
t = read_text(os.path.join(BASE, '我的文件.html'))
for nm in ['xtFilesRender', 'xtFilesFilter', 'xtFilesOpen', 'xtFilesDel', 'xtFilesAdd', 'xtFilesRegister', 'xtFilesRemove']:
    guarded = ("typeof window.%s !== 'function'" % nm) in t
    check('typeof 守卫 %s' % nm, guarded)

# ⑦ 关于.html 版本号 / chips
log('=== ⑦ 关于.html 版本号与 chips ===')
ta = read_text(os.path.join(BASE, '关于.html'))
check("关于.html 含 v2.3 版本（span+script+日志）", ta.count('v2.3') == 3, 'count=%d' % ta.count('v2.3'))
check('关于.html span id=aboutVersion 为 v2.3', 'id="aboutVersion">v2.3<' in ta)
check('关于.html 脚本 textContent v2.3', "el.textContent = 'v2.3'" in ta)
check('关于.html chips 无「演示」', '<span class="ab-chip">演示</span>' not in ta)
check('关于.html chips 有「我的文件」', '<span class="ab-chip">我的文件</span>' in ta)
tapp = read_text(os.path.join(BASE, 'assets', 'app.js'))
check('app.js showAboutDialog v2.3', '星途 v2.3' in tapp)
check('app.js 无 星途 v2.2', '星途 v2.2' not in tapp)

# ⑧ 演示.html 静态引用完整性
log('=== ⑧ 演示.html 停引 + 文件仍在磁盘 ===')
td = read_text(os.path.join(BASE, '演示.html'))
STOP = ['ppt-works.js', 'ppt-tips.js', 'tpl-preview.js', 'design-class.js', 'mini-ppt.js', 'data-ppt-', 'xt-content.js', 'mini.js']
for s in STOP:
    check('演示.html 不引用 %s' % s, s not in td)
for s in ['ppt-works.js', 'ppt-tips.js', 'tpl-preview.js', 'design-class.js', 'mini-ppt.js', 'xt-content.js', 'mini.js',
          'data-ppt-templates.js', 'data-ppt-class.js', 'data-ppt-tips.js']:
    check('磁盘仍存在 assets/%s' % s, os.path.exists(os.path.join(BASE, 'assets', s)))

# 需求登记点
log('=== 附：app.js 登记点 ===')
check('PAGE_FILES 含 files', "files: '我的文件.html'" in tapp)
check('PAGE_FILES ppt 改指新页', "ppt: '我的文件.html'" in tapp)
check('HOME_DEF 我的文件', "url: '我的文件.html'" in tapp)
check('MODULE_INDEX 我的文件', "title: '我的文件'" in tapp)
check('migrate 不再 removeItem 裸键', 'localStorage.removeItem(key)' not in tapp)
check('notify 原生桥 AndroidBridge.notify', 'window.AndroidBridge.notify(nTitle, nText)' in tapp)

# ⑥ 批量改名计数（抽查 data-page="ppt" 残留）
log('=== ⑥ 批量改名残留 ===')
leftover = []
for f in sorted(glob.glob(os.path.join(BASE, '*.html'))):
    base = os.path.basename(f)
    if base in ('演示.html',):
        continue
    if 'data-page="ppt"' in read_text(f):
        leftover.append(base)
check('除演示页外无 data-page="ppt" 残留', leftover == [], leftover)

# 兜底：更多.html / 关于.html 名称
check('更多.html 导入题库卡 onclick', "location.href='导入题库.html'" in read_text(os.path.join(BASE, '更多.html')))

txt = '\n'.join(out)
io.open(os.path.join(BASE, 'tools', 'r72_selftest_static_out.txt'), 'w', encoding='utf-8').write(txt)
print(txt)
print('\nFAIL=%d' % len([x for x in out if x.startswith('FAIL')]))
