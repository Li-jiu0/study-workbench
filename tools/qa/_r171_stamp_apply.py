# -*- coding: utf-8 -*-
"""R171 发版：统一本批「变更资产」的引用页缓存戳 → 20260930a。

规则（项目铁律）：凡引用本批变更 assets 的正式页，`?v=` 戳必须换成新值，
否则老用户会命中旧 JS/CSS 缓存（改了等于没改）。

本批变更资产（由 `tools/qa/_r171_stamp_need.py` 实测「本地 md5 ≠ 线上 md5」得出 13 个，
其中 assets/xt-topbar.css 在根目录无任何引用 → 不参与换戳，只随包上传）：

    admin-ops.js  admin.css  admin.js  api.js  app.js  mock-result.js
    subpage-router.js  topic-express.js  xt-announce.js  xt-applist.js
    xt-moments.js  xt-update.js

只扫根目录正式页（*.html）；跳过 _ 开头 / *.bak* / 备份目录。
改前打印清单 → 改后逐页回读断言，任何异常即中止。
备份写到 tools/qa/_stamp_bak_r171/（不进发版清单）。

用法：
    python tools/qa/_r171_stamp_apply.py            # dry-run（不写盘）
    python tools/qa/_r171_stamp_apply.py --apply    # 真写盘
"""
import glob
import io
import os
import re
import shutil
import sys

ROOT = r"D:\下载的文件\学习工作台"
NEW = "20260930a"
APPLY = '--apply' in sys.argv
BAK = os.path.join(ROOT, 'tools', 'qa', '_stamp_bak_r171')

TARGETS = [
    "admin-ops.js", "admin.css", "admin.js", "api.js", "app.js",
    "mock-result.js", "subpage-router.js", "topic-express.js",
    "xt-announce.js", "xt-applist.js", "xt-moments.js", "xt-update.js",
]

# 这些资产不属于本批，换戳时必须保持原值（护栏）
GUARD = ["common.css", "icon-map.js", "xt-log.js", "config.js", "page-head.css",
         "polish.css", "states.css", "xt-toast.js", "layer-stack.js", "xt-polyfill.js",
         "error-boundary.js", "img-viewer.js"]

pages = []
for p in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
    n = os.path.basename(p)
    if n.startswith("_") or ".bak" in n.lower() or ".backup" in n.lower():
        continue
    pages.append(p)

OUT = []


def emit(s=''):
    OUT.append(str(s))
    print(s)


emit("模式: %s   新戳: %s" % ("apply（写盘）" if APPLY else "dry-run（不写盘）", NEW))
emit("扫描 %d 个根目录正式页" % len(pages))

# ---- 1) 先记录护栏资产的改前快照 ----
guard_before = {}
for p in pages:
    s = io.open(p, encoding="utf-8", errors="replace").read()
    for a in GUARD:
        for m in re.finditer(re.escape("assets/" + a) + r"\?v=([0-9A-Za-z]+)", s):
            guard_before.setdefault(os.path.basename(p), {}).setdefault(a, set()).add(m.group(1))

# ---- 2) 计算需要改的位置 ----
edits = []          # (path, asset, old)
no_versioned = []   # 引用无 ?v= 的情况（告警）
for p in pages:
    s = io.open(p, encoding="utf-8", errors="replace").read()
    for a in TARGETS:
        for m in re.finditer(re.escape("assets/" + a) + r"\?v=([0-9A-Za-z]+)", s):
            if m.group(1) != NEW:
                edits.append((p, a, m.group(1)))
        # 真正的「无 ?v= 裸引用」：仅看 src=/href= 属性，避免命中 HTML 注释里的文件名
        for m in re.finditer(r'(?:src|href)="' + re.escape("assets/" + a) + r'"', s):
            no_versioned.append((os.path.basename(p), a))

emit("")
if not edits:
    emit("无需改动：所有引用页都已是 %s" % NEW)
else:
    emit("需要改动的引用（%d 处）：" % len(edits))
    for p, a, old in edits:
        emit("  %-24s %-20s %s -> %s" % (os.path.basename(p), a, old, NEW))

if no_versioned:
    emit("")
    emit("[告警] 以下引用没有 ?v= 缓存戳（本工具不会动它们，浏览器可能命中旧缓存）：")
    for n, a in sorted(set(no_versioned)):
        emit("  %-24s %s" % (n, a))

# ---- 3) 写盘 ----
by_file = {}
for p, a, old in edits:
    by_file.setdefault(p, set()).add((a, old))

if not APPLY:
    emit("")
    emit("[dry-run] 未写盘。加 --apply 才真正生效。")
    io.open(os.path.join(ROOT, 'tools', 'qa', '_r171_stamp_apply.txt'), 'w', encoding='utf-8').write(
        '\n'.join(OUT) + '\nR171_STAMP_DRY\n')
    raise SystemExit(0)

if not os.path.isdir(BAK):
    os.makedirs(BAK)

changed = []
for p, pairs in sorted(by_file.items()):
    shutil.copy2(p, os.path.join(BAK, os.path.basename(p)))
    s = io.open(p, encoding="utf-8", errors="replace").read()
    for a, old in pairs:
        s = s.replace("assets/%s?v=%s" % (a, old), "assets/%s?v=%s" % (a, NEW))
    io.open(p, "w", encoding="utf-8", newline="").write(s)
    changed.append(os.path.basename(p))

# ---- 4) 回读断言 ----
emit("")
emit("---- 回读断言 ----")
fails = []
for p in pages:
    s = io.open(p, encoding="utf-8", errors="replace").read()
    for a in TARGETS:
        stamps = set(re.findall(re.escape("assets/" + a) + r"\?v=([0-9A-Za-z]+)", s))
        if stamps and stamps != {NEW}:
            fails.append("%s 的 %s 戳仍为 %s" % (os.path.basename(p), a, sorted(stamps)))

emit("各资产的引用页与戳（改后）：")
for a in TARGETS:
    hits = {}
    for p in pages:
        s = io.open(p, encoding="utf-8", errors="replace").read()
        for st in re.findall(re.escape("assets/" + a) + r"\?v=([0-9A-Za-z]+)", s):
            hits.setdefault(st, []).append(os.path.basename(p))
    if not hits:
        emit("  %-20s （根目录无 ?v= 引用）" % a)
    for st, ps in sorted(hits.items()):
        emit("  %-20s %-12s %2d 页" % (a, st, len(ps)))

# 护栏：非本批资产的戳必须一字未改
emit("")
emit("[护栏] 未列入本批的资产戳必须保持原值：")
g_fail = []
for p in pages:
    s = io.open(p, encoding="utf-8", errors="replace").read()
    n = os.path.basename(p)
    for a in GUARD:
        after = set(re.findall(re.escape("assets/" + a) + r"\?v=([0-9A-Za-z]+)", s))
        before = guard_before.get(n, {}).get(a, set())
        if after != before:
            g_fail.append("%s 的 %s: %s -> %s" % (n, a, sorted(before), sorted(after)))
if g_fail:
    fails.extend(g_fail)
    for x in g_fail:
        emit("  CHANGED " + x)
else:
    emit("  全部保持原值 OK")

emit("")
emit("改了 %d 个页面文件（备份在 tools/qa/_stamp_bak_r171/）" % len(changed))
emit("失败项 %s" % (fails or "无"))
emit("R171_STAMP_" + ("PASS" if not fails else "FAIL"))

io.open(os.path.join(ROOT, 'tools', 'qa', '_r171_stamp_apply.txt'), 'w', encoding='utf-8').write(
    '\n'.join(OUT) + '\n')
raise SystemExit(1 if fails else 0)
