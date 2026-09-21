# -*- coding: utf-8 -*-
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
d = os.path.join(ROOT, "assets", "data")

mapping = {
    "exam-bank-ext-图形推理.json": "exam-bank-ext-figure.json",
    "exam-bank-ext-定义判断.json": "exam-bank-ext-define.json",
    "exam-bank-ext-类比推理.json": "exam-bank-ext-analogy.json",
    "exam-bank-ext-逻辑判断.json": "exam-bank-ext-logic.json",
    "exam-bank-ext-言语理解.json": "exam-bank-ext-verbal.json",
    "exam-bank-ext-数量关系.json": "exam-bank-ext-quant.json",
    "exam-bank-ext-资料分析.json": "exam-bank-ext-data.json",
}

lines = []
for a, b in mapping.items():
    src = os.path.join(d, a)
    dst = os.path.join(d, b)
    if os.path.exists(src):
        if os.path.exists(dst):
            lines.append("已存在跳过: " + b)
        else:
            os.rename(src, dst)
            lines.append("重命名: " + a + " -> " + b)
    else:
        lines.append("源缺失: " + a)

with open(os.path.join(HERE, "_rename.log"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))
