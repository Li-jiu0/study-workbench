# -*- coding: utf-8 -*-
"""STAMP=20260916L 资源版本戳补全（交付物 A）
对 D:\下载的文件\学习工作台\*.html（跳过文件名含 bak 的）逐个处理：
 (a) 已存在的 ?v=<任意值> -> ?v=20260916L
 (b) 裸路径 assets 引用（src/href，值不含 ?）补 ?v=20260916L
 (c) AI.html 在 ai-config.js 之后、ai-service.js 之前插入 ai-presets.js
 全程单行匹配、只改 src/href 属性值、不动注释/标签结构；改后做配对校验。
"""
import io, glob, re, os, sys

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916L'
RE_V = re.compile(r'\?v=[0-9A-Za-z_\-\.]+')
RE_BARE = re.compile(r'(?<![\w-])(src|href)=("|\')(assets/[^"\'\?]+\.(?:js|css))\2')
RE_BROKEN = re.compile(r'\.js\?v=[0-9A-Za-z._]+"[^>\s]')

REPORT = []
n_files = 0
n_bump = 0      # (a) 已存在 ?v= 替换处数
n_add = 0       # (b) 裸路径补戳处数
n_ai_insert = 0

def validate(s, name):
    problems = []
    if s.count('<!--') != s.count('-->'):
        problems.append('%s: 注释不平衡 %d/%d' % (name, s.count('<!--'), s.count('-->')))
    nd = len(re.findall(r'<div[\s>]', s)); ed = s.count('</div>')
    if nd != ed:
        problems.append('%s: div 不平衡 %d/%d' % (name, nd, ed))
    m = RE_BROKEN.search(s)
    if m:
        problems.append('%s: 损坏片段 %r' % (name, m.group(0)[:40]))
    return problems

for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    s = io.open(p, encoding='utf-8-sig', errors='ignore').read()
    n_files += 1

    # (a) 已存在 ?v= 替换
    s2, ka = RE_V.subn('?v=' + STAMP, s)
    # (b) 裸路径补戳（单行内，值不含 ?，保留原引号）
    s3, kb = RE_BARE.subn(lambda m: '%s=%s%s?v=%s%s' % (m.group(1), m.group(2), m.group(3), STAMP, m.group(2)), s2)

    changed = (ka + kb) > 0
    n_bump += ka
    n_add += kb

    # (c) AI.html 插入 ai-presets.js
    if b.lower() == 'ai.html':
        if 'ai-presets.js' not in s3:
            lines = s3.split('\n')
            out = []
            done = False
            for line in lines:
                out.append(line)
                if not done and 'assets/ai-config.js' in line and 'src=' in line and '<script' in line:
                    indent = re.match(r'\s*', line).group(0)
                    out.append(indent + '<script src="assets/ai-presets.js?v=' + STAMP + '" defer></script>')
                    done = True
                    n_ai_insert += 1
            s3 = '\n'.join(out)
            changed = True

    # 校验
    probs = validate(s3, b)
    if probs:
        REPORT.append('!! 校验失败，跳过写盘: ' + ' | '.join(probs))
        io.open(r'C:\Users\ATM\_bump_out.txt', 'w', encoding='utf-8').write('\n'.join(REPORT))
        sys.exit(3)

    if changed:
        io.open(p, 'w', encoding='utf-8-sig').write(s3)
        REPORT.append('改 %s (+%d ?v=替换, +%d 裸补)' % (b, ka, kb))

# AI.html 三行顺序自证
ai_path = os.path.join(ROOT, 'AI.html')
ai = io.open(ai_path, encoding='utf-8-sig', errors='ignore').read()
order = []
for i, ln in enumerate(ai.splitlines(), 1):
    if 'assets/ai-config.js' in ln: order.append(('ai-config', i))
    if 'assets/ai-presets.js' in ln: order.append(('ai-presets', i))
    if 'assets/ai-service.js' in ln: order.append(('ai-service', i))
REPORT.append('AI.html ai-config/ai-presets/ai-service 行序: ' + ', '.join('%s@L%d' % t for t in sorted(order, key=lambda x: x[1])))
REPORT.append('汇总: 处理 %d 个 HTML, (a)替换 %d 处, (b)裸补 %d 处, AI.html 插 ai-presets %d 处' % (n_files, n_bump, n_add, n_ai_insert))

io.open(r'C:\Users\ATM\_bump_out.txt', 'w', encoding='utf-8').write('\n'.join(REPORT))
print('bump done; files=%d bump=%d add=%d ai=%d' % (n_files, n_bump, n_add, n_ai_insert))
