# -*- coding: utf-8 -*-
"""Wave 2 波末统一 bump：6 个改动资产 20260915c -> 20260915g
只改 *.html 中形如 `<资产名>?v=20260915c` 的引用片段，按白名单精确到文件名，绝不误伤其它戳。
"""
import io, os, re, glob

ROOT = r"D:\下载的文件\学习工作台"
SRC, DST = "20260915c", "20260915g"

ASSETS = ["data-ppt-class.js", "design-class.js", "data-ppt-tips.js",
          "ppt-tips.js", "voiceplayer.js", "chat-local.js"]

# 逐资产精确匹配：<资产名>?v=旧戳   （前面必须有 / 或引号等分隔符，避免 ppt-tips.js 与 talk-ppt-tips.js 之类混淆）
OUT = []
changed_files = []
total = 0
per_asset = {}

for hp in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
    name = os.path.basename(hp)
    src = io.open(hp, encoding="utf-8").read()
    orig = src
    file_hits = 0
    for asset in ASSETS:
        rx = re.compile(r"(?<![\w.-])(" + re.escape(asset) + r"\?v=)" + re.escape(SRC) + r"(?![\w.])")
        src, n = rx.subn(lambda m: m.group(1) + DST, src)
        if n:
            per_asset[asset] = per_asset.get(asset, 0) + n
            file_hits += n
    if file_hits:
        io.open(hp, "w", encoding="utf-8", newline="").write(src)
        changed_files.append((name, file_hits))
        total += file_hits

OUT.append("### bump %s -> %s" % (SRC, DST))
OUT.append("")
for a in ASSETS:
    OUT.append("  %-24s %d 处" % (a, per_asset.get(a, 0)))
OUT.append("")
OUT.append("### 受影响文件 (%d)" % len(changed_files))
for n, c in changed_files:
    OUT.append("  %-28s %d 处" % (n, c))
OUT.append("")
OUT.append("--> 总计替换 %d 处" % total)

# 复查：这些资产是否还有残留旧戳
OUT.append("")
OUT.append("### 复查：残留旧戳")
leftover = 0
for hp in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
    src = io.open(hp, encoding="utf-8").read()
    for asset in ASSETS:
        rx = re.compile(r"(?<![\w.-])" + re.escape(asset) + r"\?v=" + re.escape(SRC) + r"(?![\w.])")
        hits = rx.findall(src)
        if hits:
            leftover += len(hits)
            OUT.append("  [残留] %s : %s" % (os.path.basename(hp), asset))
OUT.append("  残留总数: %d %s" % (leftover, "(OK)" if leftover == 0 else "(!!)"))

# 畸形戳普查
OUT.append("")
OUT.append("### 全站畸形戳普查（含连续字母 aaa 等非标准形态）")
rx_any = re.compile(r"\?v=([0-9a-zA-Z_]+)")
odd = []
for hp in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
    src = io.open(hp, encoding="utf-8").read()
    for m in rx_any.finditer(src):
        v = m.group(1)
        # 标准形态: 20260915 + 单个小写字母，或 20260915 + 短 token
        if re.fullmatch(r"20260915[a-z]", v) or re.fullmatch(r"2026\d{4}[a-z]{0,2}", v):
            continue
        odd.append("%s : %s" % (os.path.basename(hp), v))
OUT.append("  非标准戳数量: %d" % len(odd))
for o in odd[:30]:
    OUT.append("    " + o)

io.open(os.path.join(ROOT, "tools", "qa", "_bump_out.txt"), "w", encoding="utf-8").write("\n".join(OUT))
print("DONE", total)
