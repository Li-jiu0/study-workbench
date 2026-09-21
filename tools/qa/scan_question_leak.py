# -*- coding: utf-8 -*-
"""
scan_question_leak.py —— 入库质检关卡（R3-4）
---------------------------------------------------------------------------
扫描 assets/data/ 下所有题库 JSON（exam-bank*.json），对「图形推理」题型的
题干（q 字段）做正则检测，若命中泄露规律的表述（如"依次""规律""顺时针"
"逆时针""递增""递减"以及旋转/平移/对称/叠加/遍历等图形变化描述词），
则打印「文件 + id + 题干」并退出码非 0。

设计要点：
- 路径自动推导：优先用脚本所在仓库根（tools/qa -> 仓库根），其次退化为
  process.cwd()，不硬编码任何绝对路径（避免旧 verifier 的毛病）。
- 只检测 type == "图形推理" 的题干；解析（x）、选项（o）不扫描。
- 输出中文报告，命中即失败退出（exit 1）。

用法：
    python tools/qa/scan_question_leak.py
"""

import os
import re
import sys
import json

# 泄露规律的表述（仅针对图形推理题干）。这些词一旦出现在题干，等于把图形
# 的变化规律直接告诉了考生，违反防泄题要求。
LEAK_PATTERNS = [
    r"依次", r"规律", r"顺时针", r"逆时针", r"递增", r"递减",
    r"逐次", r"逐渐", r"每次", r"等差", r"等比",
    r"旋转", r"平移", r"翻转", r"对称", r"叠加",
    r"遍历", r"去同存异", r"去异存同", r"移动", r"变化规律",
]
LEAK_RE = re.compile("|".join(LEAK_PATTERNS))


def repo_root():
    """推导仓库根目录：脚本位于 <root>/tools/qa/ ，上两级即仓库根。"""
    here = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.dirname(os.path.dirname(here))  # tools/qa -> root
    if os.path.isdir(os.path.join(candidate, "assets", "data")):
        return candidate
    # 退化：以当前工作目录为准
    return os.getcwd()


def scan_file(path):
    """返回该文件内命中的 (id, q) 列表。"""
    hits = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print("【跳过】无法解析 JSON：%s （%s）" % (path, e))
        return hits
    if not isinstance(data, dict):
        return hits
    questions = data.get("questions")
    if not isinstance(questions, list):
        return hits
    for q in questions:
        if not isinstance(q, dict):
            continue
        if q.get("type") != "图形推理":
            continue
        stem = q.get("q") or ""
        if LEAK_RE.search(stem):
            hits.append((q.get("id"), stem))
    return hits


def main():
    root = repo_root()
    data_dir = os.path.join(root, "assets", "data")
    if not os.path.isdir(data_dir):
        print("【错误】未找到题库目录：%s" % data_dir)
        return 1

    json_files = sorted(
        fn for fn in os.listdir(data_dir)
        if fn.startswith("exam-bank") and fn.endswith(".json")
    )
    if not json_files:
        print("【提示】assets/data/ 下未发现 exam-bank*.json 文件。")
        return 0

    print("=" * 60)
    print("泄题扫描关卡 · 扫描目录：%s" % data_dir)
    print("待扫描文件：%s" % "、".join(json_files))
    print("=" * 60)

    total_hits = 0
    for fn in json_files:
        hits = scan_file(os.path.join(data_dir, fn))
        if hits:
            total_hits += len(hits)
            print("\n【命中】%s 共 %d 处：" % (fn, len(hits)))
            for qid, stem in hits:
                print("  · id=%s  题干：%s" % (qid, stem))
        else:
            print("【通过】%s （图形推理题干无泄题表述）" % fn)

    print("\n" + "=" * 60)
    if total_hits:
        print("结果：不合格 —— 共 %d 处泄题表述，请修改题干后重新入库。" % total_hits)
        print("=" * 60)
        return 1
    print("结果：合格 —— 所有图形推理题干均未泄露规律，0 处命中。")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
