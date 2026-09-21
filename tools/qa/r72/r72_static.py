# -*- coding: utf-8 -*-
"""R72 静态基线独立检查（项1 b/c/d）。
- b) 本批改动的产品文件不得引入新版本戳（对照各自 .bak-pre-r72-20260917 基线）
- c) 裸路径（根 HTML 中 assets 引用无 ?v=）应为 0
- d) 本批改动文本文件行尾零变化（对照基线：CRLF 文件 loneLF=0、LF 文件 CRLF=0）
结果写 UTF-8。
"""
import os, re

ROOT = r"D:\下载的文件\学习工作台"
OUT = r"D:\下载的文件\学习工作台\tools\qa\r72\r72_static.txt"

# 产品表面：根 HTML（排除 .bak）+ assets 下 .js/.css
NON_PRODUCT_DIRS = {".git", "node_modules", "备份", "__pycache__", ".venv", "tools",
                    "deliverables", ".tmp_eng", "_tmp_l3_qa", ".workbuddy", ".codebuddy",
                    "docs", "tencent_2025_interim", "_w2t1_img", "data", "android",
                    ".qa", "_bak-pre-b5-subst", "server"}
TEXT_EXT = {".js", ".py", ".html", ".css", ".java", ".xml", ".json", ".md",
            ".txt", ".sql", ".ts"}

results = []

def rel(p):
    return os.path.relpath(p, ROOT)

stamp_re = re.compile(r"\?v=([A-Za-z0-9]+)")
double_re = re.compile(r"\.js\.js\?v=")

# 收集所有 .bak-pre-r72 基线 -> 当前文件
bak_map = {}
for dp, dn, fn in os.walk(ROOT):
    for f in fn:
        if f.endswith(".bak-pre-r72-20260917"):
            bak_map[os.path.join(dp, f)] = None

# 判定是否为「产品文件且有基线」
def is_product(p):
    r = rel(p)
    top = r.split(os.sep)[0]
    if top in NON_PRODUCT_DIRS:
        return False
    if r.startswith("."):
        return False
    return True

# ---------- b) 逐产品文件版本戳对照基线 ----------
new_stamp = []      # (rel, stamp)
double_hits = []
whole_tree = {}
for bak, _ in bak_map.items():
    cur = bak[:-len(".bak-pre-r72-20260917")]
    if not os.path.isfile(cur) or not is_product(cur):
        continue
    if os.path.splitext(cur)[1] not in TEXT_EXT:
        continue
    ct = open(cur, "rb").read().decode("utf-8", "replace")
    bt = open(bak, "rb").read().decode("utf-8", "replace")
    cur_stamps = set(stamp_re.findall(ct))
    base_stamps = set(stamp_re.findall(bt))
    added = cur_stamps - base_stamps
    for s in added:
        new_stamp.append((rel(cur), s))
    for m in double_re.finditer(ct):
        double_hits.append(rel(cur))
    # 全树分布（仅产品文件）
    for s in stamp_re.findall(ct):
        whole_tree[s] = whole_tree.get(s, 0) + 1

b_pass = (len(new_stamp) == 0) and (len(double_hits) == 0)
results.append(("1b-本批产品文件未引入新?v=戳", "PASS" if b_pass else "FAIL",
    "产品文件戳分布=%s ; 新戳=%d ; .js.js= %d" % (whole_tree, len(new_stamp), len(double_hits))))
if new_stamp:
    results.append(("  新戳明细", "INFO", "; ".join("%s:%s" % x for x in new_stamp[:30])))
if double_hits:
    results.append(("  .js.js明细", "INFO", "; ".join(double_hits[:10])))

# ---------- c) 根 HTML 裸路径（assets 引用无 ?v=） ----------
bare_re = re.compile(r'(?:src|href)=["\'](assets/[^\"\']+)["\']')
bare_hits = []
for dp, dn, fn in os.walk(ROOT):
    top = rel(dp).split(os.sep)[0]
    if top in NON_PRODUCT_DIRS or top.startswith("."):
        continue
    for f in fn:
        if not f.endswith(".html") or f.endswith(".bak-pre-r72-20260917"):
            continue
        p = os.path.join(dp, f)
        txt = open(p, "rb").read().decode("utf-8", "replace")
        for m in bare_re.finditer(txt):
            ref = m.group(1)
            if "?v=" not in ref:
                bare_hits.append((rel(p), ref))
c_pass = (len(bare_hits) == 0)
results.append(("1c-根HTML裸路径(assets无?v=)为0", "PASS" if c_pass else "FAIL",
    "命中=%d" % len(bare_hits)))
if bare_hits:
    results.append(("  裸路径明细", "INFO", "; ".join("%s -> %s" % x for x in bare_hits[:30])))

# ---------- d) 文本文件行尾对照基线 ----------
def eol(data: bytes):
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n")
    return crlf, lf - crlf  # (crlf数, loneLF数)

eol_bad = []
for bak, _ in bak_map.items():
    cur = bak[:-len(".bak-pre-r72-20260917")]
    if not os.path.isfile(cur) or not is_product(cur):
        continue
    ext = os.path.splitext(cur)[1]
    if ext not in TEXT_EXT:
        continue
    cd = open(cur, "rb").read()
    bd = open(bak, "rb").read()
    b_crlf, b_lone = eol(bd)
    c_crlf, c_lone = eol(cd)
    base_is_crlf = b_crlf > 0
    if base_is_crlf:
        if c_lone != 0:
            eol_bad.append((rel(cur), "CRLF基线下loneLF=%d" % c_lone))
    else:
        if c_crlf != 0:
            eol_bad.append((rel(cur), "LF基线下CRLF=%d" % c_crlf))
d_pass = (len(eol_bad) == 0)
results.append(("1d-文本文件行尾零变化(对照基线)", "PASS" if d_pass else "FAIL",
    "检查文本文件=%d ; 异常=%d" % (sum(1 for b in bak_map if os.path.splitext(b[:-len('.bak-pre-r72-20260917')])[1] in TEXT_EXT), len(eol_bad))))
if eol_bad:
    results.append(("  行尾异常明细", "INFO", "; ".join("%s:%s" % x for x in eol_bad[:40])))

lines = ["R72 静态基线检查（项1）", "=" * 60]
for name, st, detail in results:
    lines.append("[%s] %s  %s" % (st, name, detail))
lines.append("=" * 60)
n_pass = sum(1 for _, st, _ in results if st == "PASS")
n_fail = sum(1 for _, st, _ in results if st == "FAIL")
lines.append("子项 PASS=%d FAIL=%d" % (n_pass, n_fail))
open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
