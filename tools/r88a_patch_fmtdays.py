# -*- coding: utf-8 -*-
"""R88-A 补丁 2：assets/xt-aiusage.js —— 新增 fmtDays 并清掉临时占位锚点函数。"""
import sys

PATH = r"D:\下载的文件\学习工作台\assets\xt-aiusage.js"

REPLACEMENTS = []


def add(label, old, new):
    REPLACEMENTS.append((label, old, new))


# 1) 新增 fmtDays：把「天数」如实格式化成人话（<1 天用小时示意，不编造精度）
add(
    "fmtDays",
    '  function fmtSeconds(sec) {\n'
    '    var v = Number(sec) || 0;\n'
    '    if (!isFinite(v) || v < 0) v = 0;\n'
    '    return v.toFixed(1);\n'
    '  }',
    '  function fmtSeconds(sec) {\n'
    '    var v = Number(sec) || 0;\n'
    '    if (!isFinite(v) || v < 0) v = 0;\n'
    '    return v.toFixed(1);\n'
    '  }\n'
    '\n'
    '  // R88-A：把「还能撑 N 天」（服务端推算）如实格式化：\n'
    '  //   <1 天 → 折算小时（保留 1 位）；≥1 天 → 保留 1 位天；非常大 → 保留整数天\n'
    '  //   取不到 / 非有限值 → "—"（调用方负责不展示编造值）\n'
    '  function fmtDays(days) {\n'
    '    var v = Number(days);\n'
    '    if (!isFinite(v) || v < 0) return "—";\n'
    '    if (v < 1) return (v * 24).toFixed(1) + " 小时";\n'
    '    if (v < 100) return v.toFixed(1) + " 天";\n'
    '    return Math.round(v) + " 天";\n'
    '  }',
)

# 2) 清掉临时占位锚点函数（R88-A 已把 statusLabel 上移，这个占位不再需要）
add(
    "drop-anchor",
    '  // 原 statusLabel 定义位置（R88-A 已上移并扩展，此处仅保留占位锚点不再重复定义）\n'
    '  function _statusLabelAnchor(st) {\n',
    '',
)


def main():
    with open(PATH, "rb") as f:
        raw = f.read()
    if raw.count(b"\r") != 0:
        print("FATAL: 非纯 LF，拒绝改动")
        sys.exit(2)
    text = raw.decode("utf-8")

    for idx, (label, old, new) in enumerate(REPLACEMENTS, 1):
        cnt = text.count(old)
        if cnt != 1:
            print("FATAL: [%s] 锚点 %d 次" % (label, cnt))
            sys.exit(3)
        text = text.replace(old, new, 1)
        print("OK  [%s]" % label)

    with open(PATH, "wb") as f:
        f.write(text.encode("utf-8"))

    with open(PATH, "rb") as f:
        check = f.read()
    print("bytes: %d -> %d, CR=%d" % (len(raw), len(check), check.count(b"\r")))
    if check.count(b"\r") != 0:
        print("FATAL: 行尾污染")
        sys.exit(4)
    t = check.decode("utf-8")
    if "function fmtDays(" not in t:
        print("FATAL: fmtDays 未生效")
        sys.exit(5)
    if "_statusLabelAnchor" in t:
        print("FATAL: 占位锚点未清掉")
        sys.exit(6)
    print("EOL = LF ✔  改动生效 ✔")


if __name__ == "__main__":
    main()
