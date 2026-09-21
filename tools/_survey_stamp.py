# -*- coding: utf-8 -*-
import io, glob, re, os
ROOT = r'D:\下载的文件\学习工作台'

# 裸 assets 引用（src 或 href，值里不含 ?）
RE_BARE = re.compile(r'(?:src|href)=["\'](assets/[^"\'\?]+)["\']')
# 已带 ?v= 的
RE_V = re.compile(r'(?:src|href)=["\']assets/[^"\'\?]+\?v=[0-9A-Za-z_.]+["\']')

bare_ext = {}
bare_tag = {}
bare_in_script_body = []   # 出现在 <script>...</script> 体内（非 <script src> 标签）的误伤风险
v_total = 0
files_with_bare = 0

for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    s = io.open(p, encoding='utf-8', errors='ignore').read()
    # 找出 inline script 块区间（粗略：按 <script ...> 不带 src 的块），用于检测误伤
    # 统计裸引用
    nb = 0
    for m in RE_BARE.finditer(s):
        val = m.group(1)
        nb += 1
        e = os.path.splitext(val)[1].lower() or '(none)'
        bare_ext[e] = bare_ext.get(e, 0) + 1
        # 判断该匹配所在行是否 <script / <link / <img 标签
        line_start = s.rfind('\n', 0, m.start()) + 1
        lin = s[line_start:m.end()]
        tag = 'OTHER'
        ls = lin.lstrip()
        if ls.startswith('<script'):
            tag = 'script'
        elif ls.startswith('<link'):
            tag = 'link'
        elif ls.startswith('<img'):
            tag = 'img'
        elif ls.startswith('<'):
            tag = 'tag:' + ls[1:lin.find(' ', 1)].split('>')[0].split('\t')[0]
        bare_tag[tag] = bare_tag.get(tag, 0) + 1
    if nb:
        files_with_bare += 1
    for m in RE_V.finditer(s):
        v_total += 1

out = []
out.append('裸 assets src/href 引用 按扩展名: %s' % bare_ext)
out.append('裸 assets 引用 按出现标签类型: %s' % bare_tag)
out.append('含 ?v= 的 assets 引用总数: %d' % v_total)
out.append('有裸引用的文件数: %d' % files_with_bare)

# 检测 inline script 体内是否含 src="assets/ 或 href="assets/ (误伤风险)
risk = []
RE_SCRIPT_BODY = re.compile(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', re.I)
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    s = io.open(p, encoding='utf-8', errors='ignore').read()
    for m in RE_SCRIPT_BODY.finditer(s):
        body = m.group(1)
        for mm in re.finditer(r'(?:src|href)=["\'](assets/[^"\'\?]+)["\']', body):
            risk.append('%s :: %s' % (b, mm.group(1)))
out.append('--- inline script 体内含 src/href="assets/ 的风险点(%d) ---' % len(risk))
out.extend(risk[:40])

io.open(r'C:/Users/ATM/_survey_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('written')
