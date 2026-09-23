# -*- coding: utf-8 -*-
"""R171 发版前的「缓存戳全景扫描」（只读，不写盘）。

目的：找出本批真正变更的 assets/*.js|css，以及全站各页面对它们的引用与当前戳，
为统一 bump 提供精确清单（避免漏页导致老用户命中旧缓存）。
同时列出「非本批资产」的戳现状做护栏参照。
"""
import glob
import io
import os
import re
import subprocess

ROOT = r"D:\下载的文件\学习工作台"

# ---- 1) 从 git status 取变更的 assets ----
r = subprocess.run(['git', '-c', 'core.quotepath=false', 'status', '--porcelain'],
                   cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
changed_assets = []
for ln in (r.stdout or '').splitlines():
    if len(ln) < 4:
        continue
    st = ln[:2].strip()
    p = ln[3:].strip().strip('"')
    if ' -> ' in p:
        p = p.split(' -> ')[-1].strip().strip('"')
    pp = p.replace('\\', '/')
    if pp.startswith('assets/') and pp.endswith(('.js', '.css', '.json')):
        base = os.path.basename(pp)
        if base.startswith('_') or '.bak' in base.lower() or '.backup' in base.lower():
            continue
        changed_assets.append((st, pp))

# 本批涉及但可能未被 git 标为变更的（兜底显式加入）
for extra in ('assets/admin-ops.js', 'assets/xt-announce.js', 'assets/xt-topbar.css',
              'assets/admin.css', 'assets/api.js', 'assets/xt-moments.js'):
    if os.path.exists(os.path.join(ROOT, extra.replace('/', os.sep))) and \
            not any(a == extra for _, a in changed_assets):
        changed_assets.append(('??', extra))

changed_assets = sorted(set(changed_assets), key=lambda x: x[1])
names = [a for _, a in changed_assets]

# ---- 2) 扫根目录正式页 ----
pages = []
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    n = os.path.basename(p)
    if n.startswith('_') or '.bak' in n.lower() or '.backup' in n.lower():
        continue
    pages.append(p)

out = []
out.append('== 本批变更资产（%d）==' % len(names))
for st, a in changed_assets:
    out.append('  %-3s %s' % (st, a))

out.append('')
out.append('== 各变更资产的引用页 + 当前戳 ==')
all_refs = {}   # asset -> {stamp: [pages]}
for a in names:
    hits = {}
    for p in pages:
        s = io.open(p, encoding='utf-8', errors='replace').read()
        for m in re.finditer(re.escape(a) + r'\?v=([0-9A-Za-z]+)', s):
            hits.setdefault(m.group(1), []).append(os.path.basename(p))
    all_refs[a] = hits
    total = sum(len(v) for v in hits.values())
    if not hits:
        out.append('  %-26s （根目录无 ?v= 引用）' % a)
    for stmp, ps in sorted(hits.items()):
        out.append('  %-26s %-12s %2d 页: %s' % (a, stmp, len(ps), ','.join(ps)))

out.append('')
out.append('== 护栏：非本批资产的戳现状（应保持不变）==')
others = []
for p in pages:
    s = io.open(p, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'assets/([A-Za-z0-9._-]+\.(?:js|css))\?v=([0-9A-Za-z]+)', s):
        if 'assets/' + m.group(1) in names:
            continue
        others.append((m.group(1), m.group(2)))
agg = {}
for a, stmp in others:
    agg.setdefault(a, {}).setdefault(stmp, 0)
    agg[a][stmp] += 1
for a in sorted(agg):
    out.append('  %-26s %s' % (a, {k: v for k, v in sorted(agg[a].items())}))

# ---- 3) 引用这些资产的页面（决定哪些 html 必须一起传）----
ref_pages = set()
for a in names:
    for ps in all_refs[a].values():
        ref_pages.update(ps)
out.append('')
out.append('== 必须随本批一起发布的页面（引用到变更资产，共 %d 个）==' % len(ref_pages))
out.append('  ' + ', '.join(sorted(ref_pages)))

# ---- 4) 根目录被删除的文件 ----
del_root = []
for ln in (r.stdout or '').splitlines():
    if ln[:2].strip() == 'D':
        del_root.append(ln[3:].strip())
out.append('')
out.append('== 根目录删除项（不进发版清单）==')
out.append('  ' + (', '.join(del_root) if del_root else '（无）'))

io.open(os.path.join(ROOT, 'tools', 'qa', '_r171_stamp_scan.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('SCAN_WRITTEN assets=%d pages=%d refpages=%d' % (len(names), len(pages), len(ref_pages)))
