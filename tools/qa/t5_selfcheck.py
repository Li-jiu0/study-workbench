# -*- coding: utf-8 -*-
"""任务五：自检 —— node --check / escheck / multi_check / 标签配对 / 禁用语法。"""
import io
import os
import re
import subprocess

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', 't5_selfcheck.txt')
out = []

CHANGED_JS = ['ai-page.js', 'ai-presets.js', 'api.js', 'app.js', 'cet-read.js',
              'cet-translate.js', 'chat-local.js', 'comm-cases.js', 'data-exam-company.js',
              'design-class.js', 'group-discussion.js', 'mini-cet.js', 'mini-comm.js',
              'mini-exam.js', 'mini-interview.js', 'mini-ppt.js', 'ppt-tips.js',
              'ppt-works.js', 'qbank.js', 'roleplay.js', 'topic-express.js', 'tpl-preview.js']

def run(cmd):
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                           encoding='utf-8', errors='replace', shell=True, timeout=300)
        return (r.returncode, (r.stdout or '') + (r.stderr or ''))
    except Exception as e:
        return (-1, 'EXC: %s' % e)

# 1) node --check
out.append('=== 1. node --check（改动过的 js）===')
fail = 0
for n in CHANGED_JS:
    p = os.path.join('assets', n)
    code, msg = run('node --check "%s"' % p)
    ok = code == 0
    if not ok:
        fail += 1
    out.append('  %-22s %s %s' % (n, 'PASS' if ok else 'FAIL(%d)' % code,
                                  (msg.strip()[:300] if not ok else '')))
out.append('  node --check 失败数 = %d' % fail)
out.append('')

# 2) escheck
out.append('=== 2. node tools/qa/escheck_es2017.js ===')
code, msg = run('node tools/qa/escheck_es2017.js')
out.append(msg.strip()[-3000:])
out.append('  exit=%d' % code)
out.append('')

# 3) multi_check
out.append('=== 3. node tools/qa/multi_check.js ===')
code, msg = run('node tools/qa/multi_check.js')
out.append(msg.strip()[-4000:])
out.append('  exit=%d' % code)
out.append('')

# 4) 禁用语法 grep（仅改动文件）
out.append('=== 4. 禁用语法扫描（改动过的 js + 改动的 html）===')
PAT = [
    ('可选链 ?.', r'\?\.'),
    ('空值合并 ??', r'\?\?'),
    ('replaceAll', r'\.replaceAll\('),
    ('Object.fromEntries', r'Object\.fromEntries'),
    ('.at(', r'\.at\('),
    ('后行断言 (?<=', r'\(\?<='),
    ('后行断言 (?<!', r'\(\?<!'),
]
CHANGED_HTML = ['AI.html', 'PPT案例拆解.html', 'PPT版式库.html', 'blog_wechat.html',
                'mock_exam.html', '万能金句库.html', '个人中心.html', '企业定向库.html',
                '动态.html', '商务礼仪.html', '四级词汇.html', '场景话术库.html',
                '学习工作台.html', '学途.html', '工具.html', '时政热点.html', '更多.html',
                '申论刷题.html', '私聊.html', '管理员.html', '行测刷题.html', '设置.html',
                '错题本.html', '面试题库.html',
                '社区.html', '英语.html', '行测.html', '表达.html', '面测.html', '演示.html']
tot = 0
for rel in ['assets' + os.sep + n for n in CHANGED_JS] + CHANGED_HTML:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        out.append('  !! 缺失 %s' % rel)
        continue
    c = io.open(p, encoding='utf-8', errors='replace').read()
    for name, pat in PAT:
        for m in re.finditer(pat, c):
            # 排除正则字面量/字符串内的误报：仅在 JS 文件里简单排除 `\\?` 场景
            tot += 1
            ls = c.rfind('\n', 0, m.start()) + 1
            le = c.find('\n', m.start())
            if le == -1:
                le = len(c)
            out.append('  !! [%s] %s | %s' % (name, rel, c[ls:le].strip()[:160]))
out.append('  禁用语法命中 = %d' % tot)
out.append('')

# 5) HTML 标签配对
out.append('=== 5. HTML 标签配对（<!--/--> 与 div）===')
bad = 0
for rel in CHANGED_HTML:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    c = io.open(p, encoding='utf-8', errors='replace').read()
    a = len(re.findall(r'<!--', c))
    b = len(re.findall(r'-->', c))
    # 剔除 script / style
    s = re.sub(r'<script\b[\s\S]*?</script>', '', c, flags=re.I)
    s = re.sub(r'<style\b[\s\S]*?</style>', '', s, flags=re.I)
    d1 = len(re.findall(r'<div\b', s))
    d2 = len(re.findall(r'</div>', s))
    flag = (a == b) and (d1 == d2)
    if not flag:
        bad += 1
    out.append('  %-18s <!--=%d -->=%d  div=%d /div=%d  %s'
               % (rel, a, b, d1, d2, 'OK' if flag else '<<< 不配对'))
out.append('  不配对文件数 = %d' % bad)
out.append('')

# 6) 禁 alert/confirm/prompt 新增（改动文件）
out.append('=== 6. alert/confirm/prompt 扫描（改动文件）===')
n_alert = 0
for rel in ['assets' + os.sep + n for n in CHANGED_JS] + CHANGED_HTML:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    c = io.open(p, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'\b(alert|confirm|prompt)\s*\(', c):
        n_alert += 1
        ls = c.rfind('\n', 0, m.start()) + 1
        le = c.find('\n', m.start())
        if le == -1:
            le = len(c)
        out.append('  ? %s | %s' % (rel, c[ls:le].strip()[:140]))
out.append('  命中 = %d（本次为纯文本/文件名替换，应为既有值）' % n_alert)

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE', OUT)
