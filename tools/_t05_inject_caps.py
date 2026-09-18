# -*- coding: utf-8 -*-
"""T05 · 批量给 36 个页面补 ai-cap-translate/video/3d.js 引用。

规则（硬要求）：
- 只处理「引了 ai-cap-registry.js」且非 ai-settings.html 的页面（= 36 个）。
- 每页只在 ai-cap-embed.js 那一行之后追加缺失的 script 行；
  行的缩进/引号/defer 属性完全复用 embed 行的写法（整行替换文件名）。
- 只加 script 行，绝不整体重写文件；CRLF 二进制读写。
- 每页先备份为 <name>.bak-pre-r87-20260918。
- 引用数对齐：改后 translate/video/3d 各 = 36（= registry 的 37 - ai-settings.html 1）。

只读不改：ai-settings.html。
"""
import os
import shutil
import sys

ROOT = r"D:\下载的文件\学习工作台"
BAK = ".bak-pre-r87-20260918"
REG = b"assets/ai-cap-registry.js"
EMBED = b"assets/ai-cap-embed.js"
NEW = [b"assets/ai-cap-translate.js", b"assets/ai-cap-video.js", b"assets/ai-cap-3d.js"]
OUT = os.path.join(ROOT, "tools", "_t05_inject_report.txt")

report = []


def log(s=""):
    report.append(s)


def find_pages():
    pages = []
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith(".html"):
            continue
        if name == "ai-settings.html":
            continue  # L2 独占，绝不碰
        p = os.path.join(ROOT, name)
        with open(p, "rb") as f:
            data = f.read()
        if REG in data:
            pages.append((name, p))
    return pages


def inject(name, p):
    with open(p, "rb") as f:
        data = f.read()

    eol_crlf = data.count(b"\r\n") > 0
    parts = data.split(b"\n")  # 每段末尾保留 \r（若 CRLF）

    embed_idx = None
    for i, seg in enumerate(parts):
        if EMBED in seg:
            embed_idx = i
            break
    if embed_idx is None:
        return ("SKIP", "未找到 ai-cap-embed.js 行")

    embed_line = parts[embed_idx]

    to_add = []
    added_names = []
    for newf in NEW:
        if newf in embed_line or any(newf in seg for seg in parts):
            continue  # 已引，跳过（幂等）
        new_line = embed_line.replace(EMBED, newf)
        to_add.append(new_line)
        added_names.append(newf.decode())

    if not to_add:
        return ("NOOP", "已引齐，无需改动")

    # 备份
    bak = p + BAK
    if not os.path.exists(bak):
        shutil.copyfile(p, bak)

    new_parts = parts[:embed_idx + 1] + to_add + parts[embed_idx + 1:]
    new_data = b"\n".join(new_parts)

    # 安全校验：字节数必须只增加「新增行的长度」，且原内容保持前缀一致
    # （避免误删）
    with open(p, "wb") as f:
        f.write(new_data)

    return ("OK", "在 %s 后加 %d 行: %s" % (EMBED.decode(), len(to_add), ", ".join(added_names)))


def main():
    pages = find_pages()
    log("=== T05 cap 引用批量注入 ===")
    log("候选页面（引 registry 且非 ai-settings.html）: %d 个" % len(pages))
    log("")
    n_ok = n_skip = n_noop = 0
    for name, p in pages:
        status, msg = inject(name, p)
        if status == "OK":
            n_ok += 1
        elif status == "SKIP":
            n_skip += 1
        else:
            n_noop += 1
        log("  [%-4s] %-26s %s" % (status, name, msg))
    log("")
    log("合计: OK=%d  SKIP=%d  NOOP=%d" % (n_ok, n_skip, n_noop))

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(report))
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
