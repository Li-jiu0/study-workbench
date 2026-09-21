# -*- coding: utf-8 -*-
p = r"D:\下载的文件\学习工作台\server\config.py"
t = open(p, "rb").read().decode("utf-8")
out = []
i = t.find("AI_PROVIDERS")
seg = t[i - 100: i + 2600]
out.append(seg)
with open(r"C:\Users\ATM\_r88m1_prov2.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
