# -*- coding: utf-8 -*-
"""r89_qa_c.py —— 工线C 独立性复核（更新.html 误删还原 / 品牌块位置 / 外链）"""
import os, re, sys

BASE = r'D:\下载的文件\学习工作台'
OUT = []
def P(*a):
    s = ' '.join(str(x) for x in a); OUT.append(s)

def rd(rel):
    p = os.path.join(BASE, rel.replace('/', os.sep))
    return open(p, 'rb').read().decode('utf-8', errors='replace') if os.path.exists(p) else None

P('=' * 70); P('工线 C 独立复核（更新.html / 更多.html）'); P('=' * 70)

up = rd('更新.html')
lines = up.split('\n')

P('\n### C1 回归：.morepage-title / 「检测更新」')
P('  .morepage-title 计数 =', up.count('morepage-title'), '(期望 1)')
P('  「检测更新」计数 =', up.count('检测更新'), '(期望 4)')
P('  data-icon="download" data-icon-size="18" =', 'data-icon="download" data-icon-size="18"' in up)
tgt = None
for i, l in enumerate(lines, 1):
    if 'class="morepage-title"' in l:
        tgt = (i, l)
P('  含 class="morepage-title" 的行:', tgt[0] if tgt else 'NONE')
if tgt:
    P('    原文 =', tgt[1].strip())
    # 逐词核对
    for tok in ['<div class="morepage-title">', 'nav-icon', 'data-icon="download"', 'data-icon-size="18"', '检测更新', '</div>']:
        P('      %-34s -> %s' % (tok, 'IN' if tok in tgt[1] else '*** MISSING ***'))

P('\n### C1b 与备份逐字节比对 .morepage-title 行')
import glob
baks = sorted(glob.glob(os.path.join(BASE, '更新.html.bak*')))
P('  找到备份:', [os.path.basename(b) for b in baks])
ref = None
for b in baks:
    t = open(b, 'rb').read().decode('utf-8', errors='replace')
    for l in t.split('\n'):
        if 'class="morepage-title"' in l:
            ref = l.strip(); P('  备份 %s 的该行 = %s' % (os.path.basename(b), ref[:170])); break
    if ref: break
if ref and tgt:
    P('  >>> 与当前行完全一致:', ref == tgt[1].strip())

P('\n### C2 品牌块位置：在 #page-update 内、.xt-up-wrap 之前')
for i, l in enumerate(lines, 1):
    s = l.strip()
    if 'xt-up-brand' in s and 'class' in s:
        P('  L%d: %s' % (i, s[:170]))
pos_page = None; pos_brand = None; pos_wrap = None
for i, l in enumerate(lines, 1):
    if 'id="page-update"' in l: pos_page = i
    if pos_brand is None and 'class="xt-up-brand"' in l: pos_brand = i
    if pos_wrap is None and 'class="xt-up-wrap"' in l: pos_wrap = i
P('  #page-update 行=%s  .xt-up-brand 行=%s  .xt-up-wrap 行=%s' % (pos_page, pos_brand, pos_wrap))
if pos_page and pos_brand and pos_wrap:
    P('  brand 在 page-update 之后:', pos_brand > pos_page, '| brand 在 wrap 之前:', pos_brand < pos_wrap)

P('\n### C3 无外链资源（file:// 下外链必挂）')
ext = re.findall(r'(?:src|href)\s*=\s*["\']((?:https?:)?//[^"\']+)["\']', up)
P('  http/protocol-relative 外链:', ext if ext else 'NONE')
files = re.findall(r'(?:src|href)\s*=\s*["\']([^"\']*\.(?:png|jpg|jpeg|gif|svg|webp|ico))["\']', up)
P('  图片文件引用:', files if files else 'NONE')
P('  data-icon 使用数 =', len(re.findall(r'data-icon="', up)))

P('\n### C4 样式不外溢：新增规则前缀')
# 提取本页 <style> 内容
m = re.search(r'<style[^>]*>(.*?)</style>', up, re.S)
sty = m.group(1) if m else ''
sels = re.findall(r'(?m)^\s*([.#][A-Za-z0-9_.:#\[\]()\- ]+)\s*\{', sty)
uniq = []
for s in sels:
    s = s.strip()
    if s and s not in uniq: uniq.append(s)
P('  本页 <style> 内选择器总数 =', len(uniq))
nonUp = [s for s in uniq if ('.xt-up' not in s and not s.startswith('@')) and not re.match(r'^\.xt-up\b', s)]
P('  非 .xt-up-* 前缀的选择器:')
for s in nonUp[:40]:
    P('     ', s)

P('\n### C5 品牌块内容纯 data-icon（无 svg 内联/文件）')
brand_block = ''
lines2 = lines
if pos_brand:
    for i in range(pos_brand - 1, min(pos_brand + 8, len(lines2))):
        brand_block += lines2[i] + '\n'
P('  品牌块片段:'); 
for l in brand_block.strip().split('\n'): P('     ', l.strip()[:170])
P('  片段含 <svg:', '<svg' in brand_block, '| 含 <img:', '<img' in brand_block)

P('\n### C6 更多.html 未改')
mo = rd('更多.html')
P('  字节 =', os.path.getsize(os.path.join(BASE, '更多.html')), '(期望 18875)')
for kw in ['morepageUpdateCard', 'xtMoreUpdateVer', 'XTUpdate.openUpdatePage()']:
    P('  %-30s 计数=%d' % (kw, mo.count(kw)))

P('\n### C7 更新.html 结构配对')
for a, b in [('<!--', '-->'), ('<div', '</div'), ('<style', '</style'), ('<script', '</script')]:
    P('  %-10s=%d  %-10s=%d  %s' % (a, up.count(a), b, up.count(b), 'OK' if up.count(a) == up.count(b) else '**DIFF**'))
P('  <head=%d </head>=%d' % (len(re.findall(r'<head[\s>]', up)), up.count('</head>')))

P('\n### C8 更新.html 媒体查询 / 禁 CSS 数学函数')
P('  @media (max-width:360px) 存在 =', '@media (max-width:360px)' in up)
P('  clamp/min/max =', bool(re.search(r'clamp\(|\bmin\(|\bmax\(', up)))
for mm in re.finditer(r'@media[^{]*\{', up):
    P('     ', mm.group(0).strip()[:120])

open(os.path.join(BASE, 'tools', 'qa', 'r89_qa_c_out.txt'), 'w', encoding='utf-8').write('\n'.join(OUT))
print('\n'.join(OUT))
