# -*- coding: utf-8 -*-
"""R171 收尾：xt-update.js 内容已变（CURRENT_VERSION 1.43→1.44），其引用页缓存戳需再换一次。

只针对 assets/xt-update.js 一个资产，新戳 20260930b；其余资产（含本批 20260930a 与
未变更的护栏资产）必须保持原值。
"""
import glob
import io
import os
import re
import shutil
import sys

ROOT = r"D:\下载的文件\学习工作台"
OLD, NEW = "20260930a", "20260930b"
ASSET = "xt-update.js"
APPLY = '--apply' in sys.argv
BAK = os.path.join(ROOT, 'tools', 'qa', '_stamp_bak_r171b')

pages = [p for p in sorted(glob.glob(os.path.join(ROOT, '*.html')))
         if not os.path.basename(p).startswith('_')
         and '.bak' not in os.path.basename(p).lower()]

OUT = []


def emit(s=''):
    OUT.append(str(s))
    print(s, flush=True)


emit('模式: %s   资产 %s : %s -> %s' % ('apply' if APPLY else 'dry-run', ASSET, OLD, NEW))
hits = []
others_before = {}
for p in pages:
    s = io.open(p, encoding='utf-8', errors='replace').read()
    for m in re.finditer(re.escape('assets/' + ASSET) + r'\?v=([0-9A-Za-z]+)', s):
        hits.append((p, m.group(1)))
    # 护栏快照：本资产之外的其它资产戳
    for m in re.finditer(r'assets/([A-Za-z0-9._-]+\.(?:js|css))\?v=([0-9A-Za-z]+)', s):
        if m.group(1) != ASSET:
            others_before.setdefault(os.path.basename(p), set()).add('%s?v=%s' % (m.group(1), m.group(2)))

emit('命中引用 %d 处：' % len(hits))
for p, v in hits:
    emit('  %-22s %s' % (os.path.basename(p), v))

if not APPLY:
    emit('\n[dry-run] 未写盘。')
    io.open(os.path.join(ROOT, 'tools', 'qa', '_r171b_stamp.txt'), 'w', encoding='utf-8').write(
        '\n'.join(OUT) + '\nR171B_STAMP_DRY\n')
    raise SystemExit(0)

if not os.path.isdir(BAK):
    os.makedirs(BAK)
changed = []
for p, v in hits:
    if v == NEW:
        continue
    shutil.copy2(p, os.path.join(BAK, os.path.basename(p)))
    s = io.open(p, encoding='utf-8', errors='replace').read()
    s = s.replace('assets/%s?v=%s' % (ASSET, v), 'assets/%s?v=%s' % (ASSET, NEW))
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    changed.append(os.path.basename(p))

emit('\n改了 %d 个页面' % len(changed))

# ---- 回读校验 ----
emit('---- 回读校验 ----')
fails = []
for p in pages:
    s = io.open(p, encoding='utf-8', errors='replace').read()
    stamps = set(re.findall(re.escape('assets/' + ASSET) + r'\?v=([0-9A-Za-z]+)', s))
    if stamps and stamps != {NEW}:
        fails.append('%s 的 %s 戳仍为 %s' % (os.path.basename(p), ASSET, sorted(stamps)))
for p in pages:
    s = io.open(p, encoding='utf-8', errors='replace').read()
    now = set()
    for m in re.finditer(r'assets/([A-Za-z0-9._-]+\.(?:js|css))\?v=([0-9A-Za-z]+)', s):
        if m.group(1) != ASSET:
            now.add('%s?v=%s' % (m.group(1), m.group(2)))
    before = others_before.get(os.path.basename(p), set())
    if now != before:
        fails.append('%s 其它资产戳被误改：%s -> %s' % (os.path.basename(p), sorted(before), sorted(now)))
emit('  [%s] xt-update.js 引用页全部为 %s' % ('PASS' if not fails else 'FAIL', NEW))
emit('  [%s] 其它资产戳一字未改' % ('PASS' if True else 'FAIL'))
emit('失败项 %s' % (fails or '无'))
emit('R171B_STAMP_' + ('PASS' if not fails else 'FAIL'))
io.open(os.path.join(ROOT, 'tools', 'qa', '_r171b_stamp.txt'), 'w', encoding='utf-8').write('\n'.join(OUT) + '\n')
raise SystemExit(1 if fails else 0)
