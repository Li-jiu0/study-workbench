# -*- coding: utf-8 -*-
"""R92-B：从模型配置删除三个「即将下线」模型。
1) assets/ai-config.js：删除 3 个模型条目（L492-527）+ MODEL_INFO 3 条说明（L901-903）
2) AI模型对接文档.md：视频生成表 5 个 → 2 个，删 3 行，加删除标注
字节级替换，行尾自适应（ai-config.js=CRLF，doc=LF）。
"""
import io

P_JS = r"D:\下载的文件\学习工作台\assets\ai-config.js"
P_MD = r"D:\下载的文件\学习工作台\AI模型对接文档.md"
LOG = r"D:\下载的文件\学习工作台\tools\qa\r92b_patch_log.txt"

lines_out = []
lines_out.append("R92-B patch log")

# ---------- ai-config.js (CRLF) ----------
with io.open(P_JS, "rb") as f:
    js = f.read()
crlf = js.count(b"\r\n"); lf = js.count(b"\n")
nl_js = b"\r\n" if crlf >= (lf - crlf) else b"\n"
lines_out.append("ai-config.js before: size=%d CRLF=%d LF=%d pureLF=%d NL=%r"
                 % (len(js), crlf, lf, lf - crlf, nl_js))

def S(lines):
    return nl_js.join([l.encode("utf-8") for l in lines])

OLD_ENTRIES = S([
    "    {",
    "      id: \"ark-seedance-1-5-pro\",",
    "      name: \"Doubao-Seedance-1.5-pro\",",
    "      provider: \"ark\",",
    "      model: \"doubao-seedance-1-5-pro-251215\",",
    "      types: [\"video\"],",
    "      tag: \"即将下线\",",
    "      rate: \"1x\",",
    "      temperature: 0.7,",
    "      maxTokens: 1000,",
    "      fallback: \"ark-seedance-1-0-pro\"",
    "    },",
    "    {",
    "      id: \"ark-seedance-1-0-lite-t2v\",",
    "      name: \"Doubao-Seedance-1.0-lite-t2v\",",
    "      provider: \"ark\",",
    "      model: \"doubao-seedance-1-0-lite-t2v-250428\",",
    "      types: [\"video\"],",
    "      tag: \"即将下线\",",
    "      rate: \"1x\",",
    "      temperature: 0.7,",
    "      maxTokens: 1000,",
    "      fallback: \"ark-seedance-1-0-pro\"",
    "    },",
    "    {",
    "      id: \"ark-seedance-1-0-lite-i2v\",",
    "      name: \"Doubao-Seedance-1.0-lite-i2v\",",
    "      provider: \"ark\",",
    "      model: \"doubao-seedance-1-0-lite-i2v-250428\",",
    "      types: [\"video\"],",
    "      tag: \"即将下线\",",
    "      rate: \"1x\",",
    "      temperature: 0.7,",
    "      maxTokens: 1000,",
    "      fallback: \"ark-seedance-1-0-pro-fast\"",
    "    },",
])

OLD_INFO = S([
    "    \"ark-seedance-1-5-pro\": { platform: \"火山方舟\", params: \"\", type: \"视频生成（即将下线）\", stars: 4, speed: \"慢\", advantage: \"文生视频 / 图生视频；输入文字或首帧图，输出 5～10 秒 MP4；分钟级异步返回；单次消耗约 10 万 tokens 量级；该型号即将下线，新任务建议改用 Seedance-1.0-pro\", applicable: \"文生视频、图生视频（过渡型号）\" },",
    "    \"ark-seedance-1-0-lite-t2v\": { platform: \"火山方舟\", params: \"\", type: \"文生视频（轻量·即将下线）\", stars: 3, speed: \"慢\", advantage: \"仅文生视频；输入文字，输出短视频；分钟级异步返回；单次消耗约 10 万 tokens 量级；该型号即将下线\", applicable: \"文生视频（轻量过渡型号）\" },",
    "    \"ark-seedance-1-0-lite-i2v\": { platform: \"火山方舟\", params: \"\", type: \"图生视频（轻量·即将下线）\", stars: 3, speed: \"慢\", advantage: \"仅图生视频；输入一张图（可再配文字），输出短视频；分钟级异步返回；单次消耗约 10 万 tokens 量级；该型号即将下线\", applicable: \"图生视频（轻量过渡型号）\" },",
])

ok = True
c1 = js.count(OLD_ENTRIES)
c2 = js.count(OLD_INFO)
lines_out.append("entry-block occurrence=%d (expect 1)" % c1)
lines_out.append("model-info occurrence=%d (expect 1)" % c2)
if c1 == 1 and c2 == 1:
    js = js.replace(OLD_ENTRIES, b"", 1)
    js = js.replace(OLD_INFO, b"", 1)
    with io.open(P_JS, "wb") as f:
        f.write(js)
else:
    ok = False
    lines_out.append("[ABORT] ai-config.js NOT modified")

# ---------- AI模型对接文档.md (LF) ----------
with io.open(P_MD, "rb") as f:
    md = f.read()
crlf_m = md.count(b"\r\n"); lf_m = md.count(b"\n")
nl_md = b"\r\n" if crlf_m >= (lf_m - crlf_m) else b"\n"
lines_out.append("doc before: size=%d CRLF=%d LF=%d pureLF=%d NL=%r"
                 % (len(md), crlf_m, lf_m, lf_m - crlf_m, nl_md))

def M(lines):
    return nl_md.join([l.encode("utf-8") for l in lines])

MD_REPL = [
    ("doc: count 5 -> 2",
     ["**视频生成（5 个）** `quotaType: \"tokens\"`"],
     ["**视频生成（2 个）** `quotaType: \"tokens\"`"]),
    ("doc: drop 3 retiring rows + add removal note",
     ["| Doubao-Seedance-1.5-pro | `ark-seedance-1-5-pro` | `doubao-seedance-1-5-pro-251215` | 2000000 | 退役中 |",
      "| Doubao-Seedance-1.0-lite-t2v | `ark-seedance-1-0-lite-t2v` | `doubao-seedance-1-0-lite-t2v-250428` | 2000000 | 退役中 |",
      "| Doubao-Seedance-1.0-lite-i2v | `ark-seedance-1-0-lite-i2v` | `doubao-seedance-1-0-lite-i2v-250428` | 2000000 | 退役中 |"],
     ["> 2026-09-19（R92-B）：`ark-seedance-1-5-pro` / `ark-seedance-1-0-lite-t2v` / `ark-seedance-1-0-lite-i2v`",
      "> 三个「即将下线」模型已从前端模型配置（assets/ai-config.js 模型条目 + modelDetails）删除；",
      "> 服务端 model_registry.json / model_quota.json 的对应条目带 `expireAt: 2026-09-21` 自动过期，保留作为历史记录。"]),
]
for label, old_l, new_l in MD_REPL:
    ob = M(old_l)
    nb = M(new_l)
    cm = md.count(ob)
    lines_out.append("%s occurrence=%d (expect 1)" % (label, cm))
    if cm == 1:
        md = md.replace(ob, nb, 1)
    else:
        ok = False
        lines_out.append("[ABORT] doc NOT modified (this pair skipped)")
if ok:
    with io.open(P_MD, "wb") as f:
        f.write(md)

# ---------- verify ----------
with io.open(P_JS, "rb") as f:
    v = f.read()
crlf2 = v.count(b"\r\n"); lf2 = v.count(b"\n")
for sid in ["ark-seedance-1-5-pro", "ark-seedance-1-0-lite-t2v", "ark-seedance-1-0-lite-i2v"]:
    lines_out.append("[VERIFY js] %s hit=%d (expect 0)" % (sid, v.count(sid.encode("utf-8"))))
# kept models still present
for keep in ["ark-seedance-1-0-pro", "ark-seedance-1-0-pro-fast"]:
    lines_out.append("[VERIFY js] kept %s hit=%d (expect >0)" % (keep, v.count(keep.encode("utf-8"))))
lines_out.append("ai-config.js after: size=%d CRLF=%d LF=%d pureLF=%d" % (len(v), crlf2, lf2, lf2 - crlf2))

with io.open(P_MD, "rb") as f:
    vm = f.read()
for sid in ["ark-seedance-1-5-pro", "ark-seedance-1-0-lite-t2v", "ark-seedance-1-0-lite-i2v"]:
    lines_out.append("[VERIFY doc] %s hit=%d (expect 0 in rows; note line keeps mention? -> 见下)" % (sid, vm.count(sid.encode("utf-8"))))
crlf3 = vm.count(b"\r\n"); lf3 = vm.count(b"\n")
lines_out.append("doc after: size=%d CRLF=%d LF=%d pureLF=%d" % (len(vm), crlf3, lf3, lf3 - crlf3))
lines_out.append("RESULT=%s" % ("PASS" if ok else "CHECK"))

with io.open(LOG, "w", encoding="utf-8") as f:
    f.write("\n".join(lines_out))
