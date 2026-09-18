# -*- coding: utf-8 -*-
"""A4 完工自检汇总"""
import os, re, datetime, subprocess

ROOT = r'D:\下载的文件\学习工作台'
out = []


def nlc(p):
    b = open(p, 'rb').read()
    crlf = b.count(b'\r\n')
    lf = b.count(b'\n') - crlf
    return crlf, lf, len(b)


def stt(p):
    st = os.stat(p)
    return st.st_size, datetime.datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d %H:%M:%S')


H = os.path.join(ROOT, 'AI模拟面试.html')
J = os.path.join(ROOT, 'assets', 'iv-prep.js')
D = os.path.join(ROOT, '交互文档-N9-19-模拟面试六阶段状态机-20260916.md')

out.append('=== 【1】 独占文件字节数 / mtime / 换行符 ===')
for tag, p in [('AI模拟面试.html', H), ('assets/iv-prep.js', J),
               ('交互文档(md, 新增)', D)]:
    sz, mt = stt(p)
    c, l, tot = nlc(p)
    out.append('  %-24s %7s B  CRLF=%-5s BARE_LF=%-5s  mtime=%s' % (tag, sz, c, l, mt))

out.append('')
out.append('=== 【2】 换行符契约 ===')
c, l, _ = nlc(H)
out.append('  AI模拟面试.html  纯CRLF? %s  (CRLF=%d, BARE_LF=%d)' % ('PASS' if l == 0 else 'FAIL', c, l))
c, l, _ = nlc(J)
out.append('  assets/iv-prep.js 纯LF? %s  (CRLF=%d, BARE_LF=%d)' % ('PASS' if c == 0 else 'FAIL', c, l))

h = open(H, 'r', encoding='utf-8').read()
j = open(J, 'r', encoding='utf-8').read()

out.append('')
out.append('=== 【3】 HTML 配对 ===')
for a, b in [('<!--', '-->'), ('<div', '</div>'), ('<script', '</script>'), ('<style', '</style>')]:
    ca, cb = h.count(a), h.count(b)
    out.append('  %-9s=%3d  %-11s=%3d  -> %s' % (a, ca, b, cb, 'PASS' if ca == cb else 'FAIL'))

out.append('')
out.append('=== 【4】 禁用语法 Grep（须 0 命中）===')
FORB = [
    (r'\?\.', '?. 可选链'),
    (r'\?\?', '?? 空值合并'),
    (r'\.replaceAll\s*\(', 'replaceAll'),
    (r'Object\.fromEntries', 'Object.fromEntries'),
    (r'\.at\s*\(', '.at('),
    (r'\(\?<=', '(?<= 后行断言'),
    (r'\(\?<!', '(?<! 后行断言'),
    (r'catch\s*\{', 'catch{} 可选绑定'),
]
tot_hit = 0
for pat, nm in FORB:
    hits = []
    for fn, txt in [('html', h), ('iv-prep', j)]:
        for i, ln in enumerate(txt.split('\n'), 1):
            if re.search(pat, ln):
                hits.append('%s:%d' % (fn, i))
    tot_hit += len(hits)
    out.append('  %-22s -> %s' % (nm, 'PASS (0)' if not hits else 'HIT x%d :: %s' % (len(hits), ','.join(hits[:6]))))

# ** 幂运算符：排除引号内字符串与 /** 注释
hits = []
for fn, txt in [('html', h), ('iv-prep', j)]:
    for i, ln in enumerate(txt.split('\n'), 1):
        s = ln
        s = re.sub(r'"[^"]*"', '""', s)
        s = re.sub(r"'[^']*'", "''", s)
        s = re.sub(r'/\*.*?\*/', '', s)
        s = re.sub(r'//.*$', '', s)
        s = re.sub(r'^\s*\*.*$', '', s)
        if '**' in s:
            hits.append('%s:%d :: %s' % (fn, i, ln.strip()[:100]))
out.append('  %-22s -> %s' % ('** 幂运算符', 'PASS (0)' if not hits else 'HIT x%d' % len(hits)))
for x in hits:
    out.append('      ' + x)

# 对象展开 {... / 对象剩余解构
hits = []
for fn, txt in [('html', h), ('iv-prep', j)]:
    for i, ln in enumerate(txt.split('\n'), 1):
        if re.search(r'\{\s*\.\.\.', ln):
            hits.append('%s:%d :: %s' % (fn, i, ln.strip()[:100]))
out.append('  %-22s -> %s' % ('{...} 对象展开', 'PASS (0)' if not hits else 'HIT x%d' % len(hits)))
for x in hits:
    out.append('      ' + x)

out.append('')
out.append('=== 【5】 原生 alert/confirm/prompt（须 0）===')
for nm, txt in [('html', h), ('iv-prep', j)]:
    hits = []
    for i, ln in enumerate(txt.split('\n'), 1):
        s = re.sub(r'"[^"]*"', '""', ln); s = re.sub(r"'[^']*'", "''", s)
        if re.search(r'(?:^|[^.\w$])(alert|confirm|prompt)\s*\(', s):
            hits.append('%d :: %s' % (i, ln.strip()[:120]))
    out.append('  %-10s -> %s' % (nm, 'PASS (0)' if not hits else 'HIT x%d :: %s' % (len(hits), hits[:5])))

out.append('')
out.append('=== 【6】 顶层声明冲突（iv-prep.js 零缩进顶层应为 0）===')
TOP = re.compile(r'^(var|const|let)\s+([A-Za-z_$][\w$]*)', re.M)
ivp_top = sorted(set(m.group(2) for m in TOP.finditer(j)))
out.append('  iv-prep.js 零缩进顶层声明数 = %d  -> %s' % (len(ivp_top), 'PASS' if not ivp_top else 'FAIL ' + str(ivp_top)))
html_tops = set()
for b in re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', h):
    for m in TOP.finditer(b):
        html_tops.add(m.group(2))
RISK = ['INTERVIEW_QUESTIONS', 'toastTimer', 'STAGES', 'IV_STAGES', 'IV_BAR_STAGES',
        'IV_TERMINAL', 'IV_STAGE_LABEL', 'currentStage', 'stages', 'stage', 'OPEN_MAP',
        'MIN_ANSWER', 'LS_PREFIX', 'VIEW_ID', 'REG_NAME']
bad = [r for r in RISK if r in ivp_top]
out.append('  与 HTML 顶层风险名交叉 -> %s' % ('PASS（无重叠）' if not bad else 'FAIL ' + str(bad)))
out.append('  iv-prep.js 向全局只经 window.xxx 挂载：')
for m in sorted(set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', j))):
    out.append('      window.%s' % m)

out.append('')
out.append('=== 【7】 文档产物核对 ===')
d = open(D, 'r', encoding='utf-8').read()
out.append('  文档字节 = %d' % len(d.encode('utf-8')))
out.append('  含 stateDiagram-v2      -> %s' % ('PASS' if 'stateDiagram-v2' in d else 'FAIL'))
out.append('  含阶段明细表(阶段/id/进入/退出/DOM/埋点) -> %s' % ('PASS' if all(k in d for k in ['进入条件', '退出条件', '涉及 DOM 容器', '与 AI 的交互点', '埋点']) else 'FAIL'))
out.append('  含走通路径(从首页到结束)  -> %s' % ('PASS' if '走通路径（QA 照此点击，从首页到结束）' in d else 'FAIL'))
out.append('  含未做视觉验证标注       -> %s' % ('PASS' if '未做视觉验证' in d else 'FAIL'))
out.append('  六阶段 id 全覆盖         -> %s' % ('PASS' if all(k in d for k in ['setup', 'reading', 'preparing', 'answering', 'submitting', 'reviewing', 'eval']) else 'FAIL'))
out.append('  三条回退 R1/R2/R3        -> %s' % ('PASS' if all(k in d for k in ['R1', 'R2', 'R3']) else 'FAIL'))
# mermaid 代码块配对
out.append('  ``` 代码围栏数 = %d -> %s' % (d.count('```'), 'PASS（偶数）' if d.count('```') % 2 == 0 else 'FAIL（奇数）'))

open(os.path.join(ROOT, 'tools', 'qa', '_a4_selfcheck_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
