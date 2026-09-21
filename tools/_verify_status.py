# -*- coding: utf-8 -*-
import os, json, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # 脚本在 tools/ 下，上两级才是仓库根
data_dir = os.path.join(ROOT, "assets", "data")
qa_dir = os.path.join(ROOT, "tools", "qa")

out = []
out.append("ROOT=" + ROOT)
out.append("EXISTS data_dir=" + str(os.path.isdir(data_dir)))

problems = []

# 1) vocab
vp = os.path.join(data_dir, "vocab-cet4-ext.json")
with open(vp, encoding="utf-8") as fh:
    v = json.load(fh)
words = v.get("words", v) if isinstance(v, dict) else v
out.append("vocab 词数=%d" % len(words))
# 与内置去重比对
existing = set()
appjs = os.path.join(ROOT, "assets", "app.js")
if os.path.exists(appjs):
    txt = open(appjs, encoding="utf-8", errors="ignore").read()
    # 提取 word: "..." 形式
    import re
    for m in re.findall(r'word:\s*"([^"]+)"', txt):
        existing.add(m)
overlap = [w for w in words if w.get("word") in existing]
out.append("内置词数=%d, 与内置重复数=%d" % (len(existing), len(overlap)))
if overlap:
    problems.append("vocab 与内置重复: " + ",".join(w.get("word") for w in overlap[:10]))
# 字段完整性
need = {"word","phonetic","meaning","root","collocation","synonym","antonym","example","example2"}
bad = [w.get("word") for w in words if not need.issubset(w.keys())]
out.append("字段缺失的词数=%d" % len(bad))
if bad:
    problems.append("字段缺失: " + ",".join(bad[:10]))

# 2) exam 分片
all_ids = []
type_count = {}
for f in sorted(os.listdir(data_dir)):
    if f.startswith("exam-bank-ext-") and f.endswith(".json"):
        fp = os.path.join(data_dir, f)
        with open(fp, encoding="utf-8") as fh:
            d = json.load(fh)
        qs = d.get("questions", [])
        ids = [q.get("id") for q in qs]
        all_ids += ids
        out.append("%s: 题数=%d, id=%s~%s" % (f, len(qs), min(ids), max(ids)))
out.append("exam 总分片题数=%d, 全局id最小=%s 最大=%s" % (len(all_ids), min(all_ids), max(all_ids)))
dup = len(all_ids) != len(set(all_ids))
out.append("exam 跨文件重复id=%s" % dup)
if dup:
    problems.append("exam 存在重复 id")
# 答案索引合法性
for f in sorted(os.listdir(data_dir)):
    if f.startswith("exam-bank-ext-") and f.endswith(".json"):
        fp = os.path.join(data_dir, f)
        with open(fp, encoding="utf-8") as fh:
            d = json.load(fh)
        for q in d.get("questions", []):
            o = q.get("o", []); a = q.get("a")
            if not isinstance(a, int) or a < 0 or a >= len(o):
                problems.append("%s id=%s 答案索引非法" % (f, q.get("id")))

# 3) listening
lp = os.path.join(data_dir, "listening-ext.json")
with open(lp, encoding="utf-8") as fh:
    ld = json.load(fh)
sc = ld.get("scenes", {})
lines = sum(len(v.get("lines", [])) for v in sc.values())
out.append("listening 场景数=%d, 总行数=%d" % (len(sc), lines))

# 4) 运行 scan 脚本（应针对所有 exam-bank*.json）
sp = os.path.join(qa_dir, "scan_question_leak.py")
out.append("---- scan 脚本输出 ----")
if os.path.exists(sp):
    r = subprocess.run([sys.executable, sp], cwd=ROOT, capture_output=True, text=True)
    out.append("scan 退出码=%d" % r.returncode)
    out.append("scan stdout:\n" + (r.stdout or ""))
    out.append("scan stderr:\n" + (r.stderr or ""))
else:
    problems.append("scan 脚本缺失")

out.append("==== 问题汇总 problems=%d ====" % len(problems))
for p in problems:
    out.append("  - " + p)

with open(os.path.join(HERE, "_verify_status.log"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
