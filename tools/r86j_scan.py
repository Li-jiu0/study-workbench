# -*- coding: utf-8 -*-
"""扫描根目录 *.html 中所有含「好友 / 加好友 / 通讯录 / gotoChat」的行，输出到 r86j_scan.txt"""
import os
import sys

ROOT = r"D:\下载的文件\学习工作台"
TOOLS = os.path.join(ROOT, "tools")
OUT = os.path.join(TOOLS, "r86j_scan.txt")

KEYWORDS = ("好友", "加好友", "通讯录", "gotoChat", "好友申请.html")


def decode(raw: bytes) -> str:
    for enc in ("utf-8", "gbk", "utf-8-sig"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def main() -> int:
    htmls = sorted(
        f for f in os.listdir(ROOT)
        if f.lower().endswith(".html") and os.path.isfile(os.path.join(ROOT, f))
    )
    lines_out = []
    total = {"好友": 0, "加好友": 0, "通讯录": 0}
    per_file = {}

    for name in htmls:
        path = os.path.join(ROOT, name)
        with open(path, "rb") as fh:
            raw = fh.read()
        text = decode(raw)
        crlf = raw.count(b"\r\n")
        lf_only = raw.count(b"\n") - crlf
        eol = "CRLF" if crlf and not lf_only else ("MIXED" if crlf and lf_only else "LF")

        hits = []
        for idx, line in enumerate(text.split("\n"), start=1):
            if not any(k in line for k in KEYWORDS):
                continue
            hits.append((idx, line.rstrip("\r")))
            if "好友" in line:
                total["好友"] += 1
            if "加好友" in line:
                total["加好友"] += 1
            if "通讯录" in line:
                total["通讯录"] += 1

        per_file[name] = (len(hits), eol, len(raw))
        if not hits:
            continue

        lines_out.append("=" * 100)
        lines_out.append("FILE: %s   [EOL=%s]  [size=%d bytes]" % (name, eol, len(raw)))
        for idx, line in hits:
            shown = line.strip()
            if len(shown) > 400:
                shown = shown[:400] + " ...<TRUNC>"
            lines_out.append("  L%-5d| %s" % (idx, shown))
        lines_out.append("")

    header = []
    header.append("# r86j 扫描报告 —— 关键词: %s" % " / ".join(KEYWORDS))
    header.append("# 根目录 *.html 共 %d 个" % len(htmls))
    header.append("# 含「好友」的行数=%d  含「加好友」的行数=%d  含「通讯录」的行数=%d"
                  % (total["好友"], total["加好友"], total["通讯录"]))
    header.append("")
    header.append("### 每文件统计 (命中行数 / 换行符 / 字节数)")
    for name in htmls:
        n, eol, sz = per_file[name]
        header.append("  %-46s hits=%-4d eol=%-6s size=%d" % (name, n, eol, sz))
    header.append("")
    header.append("### 明细")
    header.append("")

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(header + lines_out))
    print("WROTE", OUT)
    print("files=%d  好友=%d  加好友=%d  通讯录=%d"
          % (len(htmls), total["好友"], total["加好友"], total["通讯录"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
