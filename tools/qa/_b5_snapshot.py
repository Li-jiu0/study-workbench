# -*- coding: utf-8 -*-
"""批次五收尾快照：.bak-b5end（8 分片 + 2 索引 + patch + app.js + voiceplayer.js）。"""
import os
import shutil

ROOT = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8d0a1649"
DATA = os.path.join(ROOT, "assets", "data")

files = [
    os.path.join(ROOT, "assets", "app.js"),
    os.path.join(ROOT, "assets", "voiceplayer.js"),
    os.path.join(DATA, "vocab-cet4-ext-index.json"),
    os.path.join(DATA, "exam-bank-ext-index.json"),
    os.path.join(DATA, "vocab-ext-fields-patch.json"),
]
files += [os.path.join(DATA, "vocab-cet4-ext-%s.json" % s)
          for s in ("a-c", "d-f", "g-i", "j-l", "m-o", "p-r", "s-u", "v-z")]

done = 0
for p in files:
    if not os.path.isfile(p):
        print("MISSING:", p)
        continue
    dst = p + ".bak-b5end"
    shutil.copy2(p, dst)
    done += 1
    print("snapshot: %s (%d bytes)" % (os.path.relpath(dst, ROOT), os.path.getsize(dst)))
print("合计快照 %d 个" % done)
