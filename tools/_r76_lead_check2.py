# -*- coding: utf-8 -*-
import io, re
t = io.open(r"D:\下载的文件\学习工作台\assets\ai-config.js", encoding="utf-8").read()
out = []
for m in ["doubao-seed-1-6-lite", "doubao-seed-1-6-flash-32k-260628", "doubao-seed-1-6-evolving",
          "glm-5-2-261015", "kimi-k2-thinking", "glm-5-2-flash", "doubao-seed-2-0-lite-260428",
          "doubao-seed-2-1-turbo-260628", "doubao-seed-evolving", "glm-5-2-260617", "deepseek-v4-pro-260425"]:
    out.append("model %-34s count=%d" % (m, t.count(m)))
ids = re.findall(r'id:\s*"(ark[^"]+)"', t)
out.append("ark ids: %s" % ids)
i = t.find("deepseek-v4-pro-260425")
if i >= 0:
    out.append("ctx: %s" % t[max(0, i - 150):i + 100].replace("\n", " "))
io.open(r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8677e3fc\_r76_check2.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
