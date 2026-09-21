# -*- coding: utf-8 -*-
import io, re
cfg = io.open(r"D:\下载的文件\学习工作台\assets\ai-config.js", encoding="utf-8").read()
pg = io.open(r"D:\下载的文件\学习工作台\assets\ai-page.js", encoding="utf-8").read()
out = []

# 1. 清单 12 模型的 model ID 是否全部登记
checklist = ["deepseek-v4-pro-260425", "doubao-seed-2-0-code-preview", "doubao-seed-2-0-lite-260215",
             "doubao-seed-character-251128", "doubao-seed-character-260628", "doubao-seed-2-0-lite-260428",
             "doubao-seed-2-1-turbo-260628", "doubao-seed-evolving", "glm-5-2-260617",
             "seedream-4-0-20260415", "seedream-4-0-250828", "seedream-5-0-pro-260628"]
out.append("== 清单 12 模型在 ai-config.js ==")
for m in checklist:
    out.append("  %-34s %d" % (m, cfg.count(m)))

# 2. id 重复出现的位置（builtinModels 内重复=bug；builtinModels+modelDetails=正常）
out.append("== id 双现位置排查 ==")
for aid in ["ark-turbo-260628", "ark-evolving", "ark-glm-5.2", "ark-seedream-4-0828"]:
    pos = [m.start() for m in re.finditer(re.escape('id: "' + aid + '"'), cfg)]
    ctxs = []
    for p in pos:
        # 找该位置上方最近的区块标记
        head = cfg[max(0, p - 3000):p]
        mk = ""
        for key in ["builtinModels", "modelDetails", "providerGroups", "modelModes", "autoRoute", "FUNC_TYPES"]:
            if key in head:
                mk = key
        ctxs.append(mk)
    out.append("  %-24s x%d at %s" % (aid, len(pos), ctxs))

# 3. ai-page.js 兜底表是否含新 id（汇报称同步，但它报的 id 是假的）
out.append("== ai-page.js 兜底表新 id ==")
for aid in ["ark-turbo-260628", "ark-lite-260428", "ark-evolving", "ark-glm-5.2", "ark-character-260628",
            "ark-character-251128", "ark-code-preview", "ark-v4-pro-260425", "ark-lite-260215",
            "ark-seedream-4-0415", "ark-seedream-4-0828", "ark-seedream-5-pro",
            "ark-v4-lite", "ark-kimi-k2-thinking"]:
    out.append("  %-24s %d" % (aid, pg.count(aid)))

# 4. ai-config 内部降级链/autoRoute 是否引用新 id（自洽性）
out.append("== ai-config 降级链/autoRoute 引用新 id ==")
for aid in ["ark-turbo-260628", "ark-lite-260428", "ark-evolving", "ark-glm-5.2", "ark-v4-pro-260425"]:
    out.append("  %-24s %d" % (aid, cfg.count(aid)))

# 5. imagegen 分流与 arkimage
out.append("imagegen in cfg=%d, in page=%d, arkimage in cfg=%d" % (cfg.count("imagegen"), pg.count("imagegen"), cfg.count("arkimage")))

io.open(r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8677e3fc\_r76_check3.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
