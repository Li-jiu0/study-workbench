# -*- coding: utf-8 -*-
"""执行刷戳（二进制读写，仅改 ?v= 戳值）。
1) 备份每个待改页面到 tools/_bak_stamp_r88d/
2) 按 plan 精确替换 assets/<asset>?v=<old>  ->  assets/<asset>?v=20260918d
   对无戳的 blog_wechat ai-cap-*：assets/<asset>[">/space]  ->  assets/<asset>?v=20260918d
3) 回读校验行尾零漂移 + 计数
"""
import os, re, io, json, shutil

ROOT = r"D:\下载的文件\学习工作台"
NEW = "20260918d"
BAK = os.path.join(ROOT, "tools", "_bak_stamp_r88d")
os.makedirs(BAK, exist_ok=True)

plan = json.load(io.open(os.path.join(ROOT,"tools","qa","_stamp_edit_plan.json"), encoding="utf-8"))

# 按页面聚合
by_page = {}
for x in plan:
    by_page.setdefault(x["page"], []).append(x)

def le(b):
    crlf=b.count(b"\r\n"); lf=b.count(b"\n"); cr=b.count(b"\r")
    return {"bytes":len(b),"lines":lf,"crlf":crlf,"lone_lf":lf-crlf,"lone_cr":cr-crlf}

report_rows = []
errors = []

for page, ops in sorted(by_page.items()):
    p = os.path.join(ROOT, page)
    orig = open(p, "rb").read()
    before = le(orig)
    data = orig
    per_asset_ops = []

    for op in ops:
        asset = op["asset"]; old = op["old"]
        # 构造精确查找串
        if old is not None:
            needle = ("assets/%s?v=%s" % (asset, old)).encode("utf-8")
            repl = ("assets/%s?v=%s" % (asset, NEW)).encode("utf-8")
        else:
            # 无戳：只替换 "assets/<asset>" 后紧跟引号 或空白/'>' 的情况（严格：紧跟双引号）
            # 实际写法： src="assets/ai-cap-xxx.js"></script>
            asset_b = ("assets/%s" % asset).encode("utf-8")
            # 匹配 assets/<asset>"  （紧跟闭合双引号），替换为 assets/<asset>?v=NEW"
            needle = asset_b + b'"'
            repl = asset_b + ("?v=%s" % NEW).encode("utf-8") + b'"'
        cnt = data.count(needle)
        if cnt != 1:
            errors.append("PAGE %s ASSET %s old=%s : found %d occurrence(s) of needle" % (page, asset, old, cnt))
        data = data.replace(needle, repl)
        per_asset_ops.append({"asset":asset,"old":old,"count":cnt})

    after = le(data)
    # 判定原类型
    orig_kind = "CRLF" if (before["crlf"]>0 and before["lone_lf"]==0) else ("LF" if (before["crlf"]==0 and before["lines"]>0) else "MIXED")
    drift = None
    if orig_kind == "CRLF":
        drift = (after["lone_lf"] != 0) or (after["lone_cr"] != 0)
    elif orig_kind == "LF":
        drift = (after["crlf"] != 0) or (after["lone_cr"] != 0)
    else:
        drift = True
    if drift:
        errors.append("PAGE %s : LINE-ENDING DRIFT %s -> %s" % (page, orig_kind, after))

    # 备份
    shutil.copy2(p, os.path.join(BAK, os.path.basename(page) + ".bak-stamp-r88d"))
    # 写回
    with open(p, "wb") as f:
        f.write(data)

    report_rows.append({
        "page": page,
        "bytes_before": before["bytes"], "bytes_after": after["bytes"],
        "kind": orig_kind,
        "loneLF_before": before["lone_lf"], "loneLF_after": after["lone_lf"],
        "loneCR_before": before["lone_cr"], "loneCR_after": after["lone_cr"],
        "ops": per_asset_ops,
        "ops_count": sum(o["count"] for o in per_asset_ops),
    })

io.open(os.path.join(ROOT,"tools","qa","_stamp_exec_report.json"),"w",encoding="utf-8").write(
    json.dumps({"rows":report_rows,"errors":errors}, ensure_ascii=False, indent=2))

# 文本表
lines=["page\tbytes_before\tbytes_after\tkind\tloneLF(前→后)\tloneCR(前→后)\tops"]
for r in report_rows:
    lines.append("%s\t%d\t%d\t%s\t%d→%d\t%d→%d\t%d" % (
        r["page"], r["bytes_before"], r["bytes_after"], r["kind"],
        r["loneLF_before"], r["loneLF_after"], r["loneCR_before"], r["loneCR_after"], r["ops_count"]))
total_ops = sum(r["ops_count"] for r in report_rows)
lines.append("")
lines.append("TOTAL_PAGES=%d TOTAL_OPS=%d ERRORS=%d" % (len(report_rows), total_ops, len(errors)))
for e in errors: lines.append("ERR: "+e)
io.open(os.path.join(ROOT,"tools","qa","_stamp_exec_report.txt"),"w",encoding="utf-8").write("\n".join(lines)+"\n")
print("DONE pages=%d ops=%d errors=%d" % (len(report_rows), total_ops, len(errors)))
