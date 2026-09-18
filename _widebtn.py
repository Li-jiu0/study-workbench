# -*- coding: utf-8 -*-
import os, re, io

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/_widebtn_scan.txt")
L = []
def w(s=""): L.append(s)

# 只扫 live 根目录 html，排除 备份/ tools/
files = [f for f in sorted(os.listdir(ROOT))
         if f.lower().endswith(".html") and os.path.isfile(os.path.join(ROOT, f))]

w("=== 各页面「通栏/超宽」按钮扫描（live 根目录 html，共 %d 个）===" % len(files))
w("判别：button 或 .btn 类元素上出现 width:100% / flex:1 / btn-block / width:100vw")
w("")

total_hits = 0
per_file = {}
for f in files:
    t = io.open(os.path.join(ROOT, f), "r", encoding="utf-8", errors="replace").read()
    lines = t.split("\n")
    hits = []
    for i, ln in enumerate(lines):
        s = ln.strip()
        # 只看含 <button 或 class 含 btn 的行
        if "<button" not in s and 'class="btn' not in s:
            continue
        pat = []
        if "btn-block" in s: pat.append("btn-block")
        if re.search(r"width\s*:\s*100%", s): pat.append("width:100%")
        if re.search(r"width\s*:\s*100vw", s): pat.append("width:100vw")
        if re.search(r"flex\s*:\s*1\s*[;\"]", s): pat.append("flex:1")
        if pat:
            txt = re.sub(r"<[^>]+>", "", s)[:40].strip()
            hits.append("  L%-5d [%s]  %s" % (i + 1, "+".join(pat), txt or "(无文字)"))
    if hits:
        per_file[f] = hits
        total_hits += len(hits)

for f in sorted(per_file):
    w("-- %s --" % f)
    for h in per_file[f]:
        w(h)
    w("")

w("========== 汇总：%d 个文件命中，共 %d 处 ==========" % (len(per_file), total_hits))
if not per_file:
    w("!! 无命中：live 树已无通栏按钮")
else:
    w("文件清单：" + ", ".join(sorted(per_file)))

io.open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("scanned %d files, hits=%d" % (len(files), total_hits))
