# -*- coding: utf-8 -*-
# R76 task#6: integrate 12 Volcano Ark models into ai-config.js (CRLF) + ai-page.js (LF) sync
import shutil, os, sys, re

CFG = r"D:\下载的文件\学习工作台\assets\ai-config.js"
PAGE = r"D:\下载的文件\学习工作台\assets\ai-page.js"
for p, suf in [(CFG, ".bak-pre-r76-20260917"), (PAGE, ".bak-pre-r76-20260917")]:
    if not os.path.exists(p + suf):
        shutil.copyfile(p, p + suf)

# ================= ai-config.js (CRLF) =================
data = open(CFG, "rb").read()
assert data.count(b"\r\n") == data.count(b"\n") == 607 and data.count(b"\r") == 607
text = data.decode("utf-8")
lines = text.split("\r\n")
assert len(lines) == 608 and lines[-1] == ""

def chk(idx0, expect):
    assert expect in lines[idx0], "L%d mismatch: %r not in %r" % (idx0 + 1, expect, lines[idx0][:100])

chk(31, "},")            # L32 ark provider close
chk(94, "ark-glm-flash") # L95
chk(232, "16 \u4e2a")    # L233
chk(238, "\u5185\u7f6e\u514d\u8d39\u6a21\u578b\u5217\u8868")  # L239
chk(240, "builtinModels: [")  # L241
chk(435, "],")           # L436
chk(440, "modelDetails: {")   # L441
chk(457, "},")           # L458
chk(461, "modelModes")   # L462
chk(488, "7 \u7c7b\u529f\u80fd")  # L489
chk(501, "ark-doubao-pro")       # L502 reasoning fallback
chk(541, "ark-doubao-pro")       # L542 creative fallback
chk(544, "}")            # L545 creative close
chk(545, "}")            # L546 FUNC_TYPES close

ARK_KEY = "ark-e725e1de-7d62-4b4a-aebb-a5def4f05ba7-c22bf"
chk(30, ARK_KEY)

PROVIDER_BLOCK = """    // \u706b\u5c71\u65b9\u821f\u56fe\u7247\u751f\u6210\uff08seedream \u7cfb\u5217\u4e13\u7528\uff1aimages/generations \u63a5\u53e3\uff0cKey \u4e0e ark \u76f8\u540c\uff09
    arkimage: {
      name: "\u706b\u5c71\u65b9\u821f\u00b7\u56fe\u7247\u751f\u6210",
      apiUrl: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
      apiKey: "ark-e725e1de-7d62-4b4a-aebb-a5def4f05ba7-c22bf"
    },"""

PG_NEW = """        { id: "ark-turbo-260628", name: "Doubao-Turbo", types: ["general"] },
        { id: "ark-lite-260428", name: "Doubao-Lite", types: ["general"] },
        { id: "ark-evolving", name: "Doubao-Evolving", types: ["general","reasoning"] },
        { id: "ark-glm-5.2", name: "GLM-5.2", types: ["general"] },
        { id: "ark-character-260628", name: "Doubao-Character\uff08\u65b0\u7248\uff09", types: ["general","creative"] },
        { id: "ark-character-251128", name: "Doubao-Character\uff08\u65e7\u7248\uff09", types: ["general","creative"] },
        { id: "ark-code-preview", name: "Doubao-Code-Preview", types: ["general"] },
        { id: "ark-v4-pro-260425", name: "DeepSeek-V4-Pro\uff08\u65e7\u7248\uff09", types: ["general","reasoning"] },
        { id: "ark-lite-260215", name: "Doubao-Lite\uff08\u65e7\u7248\uff09", types: ["general"] }"""

def entry(mid, name, provider, model, types, rate, temp, mt, fb, extra=""):
    t = "[" + ",".join('"%s"' % x for x in types) + "]"
    return ('    {\n      id: "%s",\n      name: "%s",\n      provider: "%s",\n      model: "%s",\n      types: %s,\n      tag: "\u514d\u8d39",\n      rate: "%s",\n      temperature: %s,\n      maxTokens: %d,\n      fallback: %s%s\n    }'
            % (mid, name, provider, model, t, rate, temp, mt, fb, (",\n      " + extra) if extra else ""))

ARK_EXISTING = [
    ("ark-v4-flash", "DeepSeek-V4-Flash", "deepseek-v4-flash-ga-260731", ["general"], "0.8x", "0.7", 1200, '"ark-doubao-mini"', ""),
    ("ark-doubao-mini", "Doubao-Mini", "doubao-seed-2-0-mini-260428", ["general"], "0.8x", "0.7", 1200, '"glm-4.7"', ""),
    ("ark-v4-1-flash", "DeepSeek-V4.1-Flash", "deepseek-v4-1-flash-260910", ["general","math"], "1x", "0.5", 2000, '"ark-v4-flash"', ""),
    ("ark-v4-pro", "DeepSeek-V4-Pro", "deepseek-v4-pro-ga-260813", ["general","reasoning"], "1.5x", "0.3", 2500, '"ark-v4-1-flash"', ""),
    ("ark-doubao-pro", "Doubao-Pro", "doubao-seed-2-1-pro-260915", ["general","creative","longtext"], "1.5x", "0.7", 2000, '"ark-v4-flash"', ""),
    ("ark-glm-flash", "GLM-5.3-Flash", "glm-5-3-flash-260828", ["general"], "1x", "0.7", 1200, '"ark-v4-flash"', ""),
]
ARK_NEW = [
    ("ark-turbo-260628", "Doubao-Turbo", "doubao-seed-2-1-turbo-260628", ["general"], "1x", "0.5", 2000, '"ark-v4-1-flash"'),
    ("ark-lite-260428", "Doubao-Lite", "doubao-seed-2-0-lite-260428", ["general"], "0.5x", "0.7", 800, '"ark-doubao-mini"'),
    ("ark-evolving", "Doubao-Evolving", "doubao-seed-evolving", ["general","reasoning"], "1.5x", "0.4", 2500, '"ark-v4-pro"'),
    ("ark-glm-5.2", "GLM-5.2", "glm-5-2-260617", ["general"], "1x", "0.7", 1500, '"ark-glm-flash"'),
    ("ark-character-260628", "Doubao-Character\uff08\u65b0\u7248\uff09", "doubao-seed-character-260628", ["general","creative"], "1x", "0.8", 1500, '"ark-doubao-pro"'),
    ("ark-character-251128", "Doubao-Character\uff08\u65e7\u7248\uff09", "doubao-seed-character-251128", ["general","creative"], "1x", "0.8", 1500, '"ark-character-260628"'),
    ("ark-code-preview", "Doubao-Code-Preview", "doubao-seed-2-0-code-preview", ["general"], "1x", "0.3", 2000, '"ark-doubao-pro"'),
    ("ark-v4-pro-260425", "DeepSeek-V4-Pro\uff08\u65e7\u7248\uff09", "deepseek-v4-pro-260425", ["general","reasoning"], "1.5x", "0.3", 2500, '"ark-v4-pro"'),
    ("ark-lite-260215", "Doubao-Lite\uff08\u65e7\u7248\uff09", "doubao-seed-2-0-lite-260215", ["general"], "0.5x", "0.7", 800, '"ark-doubao-mini"'),
]
OTHER = [
    ("glm-4.7", "GLM-4.7", "zhipu", "glm-4.7", ["general"], "1x", "0.7", 1000, '"ark-v4-flash"', ""),
    ("glm-4v-flash", "GLM-4V-Flash", "zhipu", "glm-4v-flash", ["image"], "1x", "0.5", 1500, "null", ""),
    ("glm-4.6v-flash", "GLM-4.6V-Flash", "zhipu", "glm-4.6v-flash", ["image","general"], "1.2x", "0.5", 1500, '"glm-4v-flash"', ""),
    ("qf-ernie-32k", "ERNIE-4.5-Turbo", "qianfan", "ernie-4.5-turbo-32k", ["general"], "1x", "0.7", 1200, '"qf-ernie-128k"', ""),
    ("qf-ernie-128k", "ERNIE-4.5-Turbo-128K", "qianfan", "ernie-4.5-turbo-128k", ["general","longtext"], "1.2x", "0.5", 2000, '"ark-v4-flash"', ""),
    ("or-auto", "OR-Auto", "openrouter", "openrouter/free", ["general"], "1x", "0.7", 1200, '"ark-v4-flash"', ""),
    ("or-nemotron-super", "Nemotron-Super", "openrouter", "nvidia/nemotron-3-super-120b-a12b:free", ["general"], "1x", "0.7", 1500, '"ark-v4-flash"', ""),
    ("or-nemotron-ultra", "Nemotron-Ultra", "openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free", ["general","reasoning"], "2x", "0.3", 2500, '"ark-v4-pro"', ""),
    ("gm-flash-lite", "Gemini-3.5-Flash-Lite", "gemini", "gemini-3.5-flash-lite", ["general"], "0.8x", "0.7", 1200, '"ark-v4-flash"', "needVPN: true"),
    ("gm-flash", "Gemini-3.5-Flash", "gemini", "gemini-3.5-flash", ["general","reasoning"], "1.2x", "0.5", 2500, '"ark-v4-pro"', "needVPN: true"),
]
SEEDREAM = [
    ("ark-seedream-4-0415", "Seedream-4.0", "seedream-4-0-20260415"),
    ("ark-seedream-4-0828", "Seedream-4.0-Fast", "seedream-4-0-250828"),
    ("ark-seedream-5-pro", "Seedream-5-Pro", "seedream-5-0-pro-260628"),
]

bm_parts = []
for (mid, name, model, types, rate, temp, mt, fb, extra) in ARK_EXISTING:
    bm_parts.append(entry(mid, name, "ark", model, types, rate, temp, mt, fb, extra))
for row in ARK_NEW:
    bm_parts.append(entry(row[0], row[1], "ark", row[2], row[3], row[4], row[5], row[6], row[7]))
for (mid, name, prov, model, types, rate, temp, mt, fb, extra) in OTHER:
    bm_parts.append(entry(mid, name, prov, model, types, rate, temp, mt, fb, extra))
for (mid, name, model) in SEEDREAM:
    bm_parts.append(entry(mid, name, "arkimage", model, ["imagegen"], "1x", "0.7", 1000, '"ark-v4-flash"'))
BUILTIN_BLOCK = ",\n".join(bm_parts)

def det(key, ptype, stars, speed, adv, appl):
    return ('    "%s": { platform: "\u706b\u5c71\u65b9\u821f", params: "", type: "%s", stars: %d, speed: "%s", advantage: "%s", applicable: "%s" }'
            % (key, ptype, stars, speed, adv, appl))

DETAIL_ARK_NEW = [
    det("ark-turbo-260628", "\u901a\u7528\u5bf9\u8bdd\uff08turbo\uff09", 4, "\u5feb", "\u901f\u5ea6\u4e0e\u8d28\u91cf\u517c\u987e\u7684 turbo \u7248\uff1b\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", "\u65e5\u5e38\u95ee\u7b54\u3001\u5747\u8861\u573a\u666f"),
    det("ark-lite-260428", "\u8f7b\u91cf\u5bf9\u8bdd\uff08\u65b0\u7248\uff09", 3, "\u5feb", "\u6700\u65b0\u8f7b\u91cf\u6a21\u578b\uff0c\u54cd\u5e94\u6781\u5feb\uff1b\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", "\u6781\u7b80\u5355\u95ee\u7b54\u3001\u5feb\u901f\u5206\u7c7b"),
    det("ark-evolving", "\u901a\u7528\u5bf9\u8bdd\uff08\u6301\u7eed\u8fdb\u5316\uff09", 5, "\u4e2d", "\u6301\u7eed\u8fdb\u5316\u7684\u6700\u65b0\u6a21\u578b\uff0c\u80fd\u529b\u968f\u7248\u672c\u589e\u5f3a\uff1b\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", "\u590d\u6742\u95ee\u7b54\u3001\u957f\u94fe\u601d\u8003"),
    det("ark-glm-5.2", "\u901a\u7528\u5bf9\u8bdd", 4, "\u4e2d", "\u667a\u8c31 GLM-5.2\uff08\u706b\u5c71\u65b9\u821f\u514d\u8d39\u901a\u9053\uff09\uff0c\u4e2d\u6587\u80fd\u529b\u5f3a\uff1b\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", "\u65e5\u5e38\u95ee\u7b54"),
    det("ark-character-260628", "\u89d2\u8272\u626e\u6f14\uff08\u65b0\u7248\uff09", 4, "\u4e2d", "\u89d2\u8272\u626e\u6f14\u4e0e\u4eba\u8bbe\u5bf9\u8bdd\u4f18\u5316\uff1b\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", "\u89d2\u8272\u626e\u6f14\u3001\u60c5\u666f\u5bf9\u8bdd\u3001\u9762\u8bd5\u6a21\u62df\u966a\u7ec3"),
    det("ark-character-251128", "\u89d2\u8272\u626e\u6f14\uff08\u65e7\u7248\uff09", 3, "\u4e2d", "\u65e7\u7248\u89d2\u8272\u6a21\u578b\uff1b\u5efa\u8bae\u4f18\u5148\u4f7f\u7528\u65b0\u7248", "\u89d2\u8272\u626e\u6f14\uff08\u65e7\u7248\u517c\u5bb9\uff09"),
    det("ark-code-preview", "\u4ee3\u7801\u4e13\u7528\uff08\u9884\u89c8\u7248\uff09", 4, "\u4e2d", "\u4ee3\u7801\u7406\u89e3\u4e0e\u751f\u6210\u4e13\u7528\u9884\u89c8\u7248\uff1b\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", "\u7f16\u7a0b\u3001\u4ee3\u7801\u89e3\u91ca\u3001\u7ea0\u9519"),
    det("ark-v4-pro-260425", "\u63a8\u7406\u589e\u5f3a\uff08\u65e7\u7248\uff09", 4, "\u4e2d", "\u65e7\u7248 V4 Pro\uff1b\u5efa\u8bae\u4f18\u5148\u4f7f\u7528\u65b0\u7248 DeepSeek-V4-Pro", "\u590d\u6742\u63a8\u7406\uff08\u65e7\u7248\u517c\u5bb9\uff09"),
    det("ark-lite-260215", "\u8f7b\u91cf\u5bf9\u8bdd\uff08\u65e7\u7248\uff09", 2, "\u5feb", "\u65e7\u7248\u8f7b\u91cf\u6a21\u578b\uff1b\u5efa\u8bae\u4f18\u5148\u4f7f\u7528\u65b0\u7248 Doubao-Lite", "\u6781\u7b80\u5355\u95ee\u7b54\uff08\u65e7\u7248\u517c\u5bb9\uff09"),
]
def det_img(key, ptype, stars, speed, adv, appl):
    return ('    "%s": { platform: "\u706b\u5c71\u65b9\u821f\u00b7\u56fe\u7247\u751f\u6210", params: "", type: "%s", stars: %d, speed: "%s", advantage: "%s", applicable: "%s" }'
            % (key, ptype, stars, speed, adv, appl))
DETAIL_IMG = [
    det_img("ark-seedream-4-0415", "\u56fe\u7247\u751f\u6210", 4, "\u4e2d", "\u6587\u751f\u56fe\uff1b\u8d70 images/generations \u63a5\u53e3\uff0c\u8c03\u7528\u94fe\u8def\u5f85\u8bc4\u4f30", "\u6587\u751f\u56fe\uff08v4 \u521d\u7248\uff09"),
    det_img("ark-seedream-4-0828", "\u56fe\u7247\u751f\u6210\uff08\u6700\u5feb\uff09", 4, "\u5feb", "\u6587\u751f\u56fe\u6700\u5feb\u7248\uff08\u5b9e\u6d4b 4.2 \u79d2\uff09\uff1b\u8d70 images/generations \u63a5\u53e3\uff0c\u8c03\u7528\u94fe\u8def\u5f85\u8bc4\u4f30", "\u6587\u751f\u56fe\uff08\u901f\u5ea6\u4f18\u5148\uff09"),
    det_img("ark-seedream-5-pro", "\u56fe\u7247\u751f\u6210\uff08\u8d28\u91cf\u6700\u597d\uff09", 5, "\u6162", "\u6587\u751f\u56fe\u6700\u65b0\u7248\uff0c\u8d28\u91cf\u6700\u597d\uff1b\u8d70 images/generations \u63a5\u53e3\uff0c\u8c03\u7528\u94fe\u8def\u5f85\u8bc4\u4f30", "\u6587\u751f\u56fe\uff08\u8d28\u91cf\u4f18\u5148\uff09"),
]
DETAIL_EXISTING_ARK = [
    '    "ark-v4-flash": { platform: "\u706b\u5c71\u65b9\u821f", params: "", type: "\u901a\u7528\u5bf9\u8bdd", stars: 3, speed: "\u5feb", advantage: "\u54cd\u5e94\u5feb\uff0c\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", applicable: "\u65e5\u5e38\u95ee\u7b54\u3001\u5feb\u901f\u89e3\u9898" }',
    '    "ark-doubao-mini": { platform: "\u706b\u5c71\u65b9\u821f", params: "", type: "\u901a\u7528\u5bf9\u8bdd", stars: 3, speed: "\u5feb", advantage: "\u8c46\u5305\u8f7b\u91cf\u6a21\u578b\uff0c\u54cd\u5e94\u5feb\uff0c\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", applicable: "\u65e5\u5e38\u95ee\u7b54\u3001\u5feb\u901f\u89e3\u9898" }',
    '    "ark-v4-1-flash": { platform: "\u706b\u5c71\u65b9\u821f", params: "", type: "\u901a\u7528\u5bf9\u8bdd\uff08\u63a8\u7406\u578b\uff09", stars: 4, speed: "\u5feb", advantage: "\u63a8\u7406\u578b\uff0cmaxTokens \u9700 \u22652000\uff1b\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", applicable: "\u9700\u8981\u63a8\u7406\u7684\u95ee\u7b54\u3001\u6570\u5b66\u9898" }',
    '    "ark-v4-pro": { platform: "\u706b\u5c71\u65b9\u821f", params: "", type: "\u63a8\u7406\u589e\u5f3a", stars: 5, speed: "\u4e2d", advantage: "\u63a8\u7406\u80fd\u529b\u66f4\u5f3a\uff0c\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", applicable: "\u590d\u6742\u63a8\u7406\u3001\u957f\u94fe\u601d\u8003" }',
    '    "ark-doubao-pro": { platform: "\u706b\u5c71\u65b9\u821f", params: "", type: "\u901a\u7528\u5bf9\u8bdd\uff08\u521b\u4f5c/\u957f\u6587\u672c\uff09", stars: 5, speed: "\u4e2d", advantage: "\u521b\u4f5c\u4e0e\u957f\u6587\u672c\u80fd\u529b\u8f83\u5f3a\uff0c\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", applicable: "\u6587\u6848\u521b\u4f5c\u3001\u957f\u6587\u672c\u5904\u7406" }',
    '    "ark-glm-flash": { platform: "\u706b\u5c71\u65b9\u821f", params: "", type: "\u901a\u7528\u5bf9\u8bdd", stars: 4, speed: "\u4e2d", advantage: "GLM \u6700\u65b0\u4ee3\u514d\u8d39\u6a21\u578b\uff0c\u989d\u5ea6\u6bcf\u5929 200 \u4e07 token", applicable: "\u65e5\u5e38\u95ee\u7b54" }',
]
DETAIL_OTHER = [
    '    "glm-4.7": { platform: "\u667a\u8c31AI", params: "30B", type: "\u901a\u7528\u6587\u672c", stars: 5, speed: "\u4e2d", recommend: "\u65e5\u5e38\u95ee\u7b54\u9996\u9009", advantage: "\u667a\u8c31\u514d\u8d39\u6a21\u578b\uff0c\u4e2d\u6587\u7406\u89e3\u80fd\u529b\u5f3a\uff0c\u5b9e\u6d4b\u7ea6 5.5 \u79d2", applicable: "\u65e5\u5e38\u5b66\u4e60\u95ee\u7b54\u3001\u65b9\u6cd5\u54a8\u8be2\u3001\u6587\u6848\u751f\u6210\u3001\u9762\u8bd5\u6a21\u62df" }',
    '    "glm-4v-flash": { platform: "\u667a\u8c31AI", params: "", type: "\u89c6\u89c9\u7406\u89e3", stars: 4, speed: "\u5feb", advantage: "\u514d\u8d39\u89c6\u89c9\u6a21\u578b\uff0c\u5b9e\u6d4b\u7ea6 1 \u79d2\uff0c\u9002\u5408\u62cd\u9898", applicable: "\u62cd\u9898\u8bc6\u56fe\u3001\u9898\u76ee\u4e0e\u8bfe\u4ef6\u622a\u56fe\u89e3\u8bfb" }',
    '    "glm-4.6v-flash": { platform: "\u667a\u8c31AI", params: "", type: "\u591a\u6a21\u6001\uff08\u56fe\u7247+\u6587\u672c\uff09", stars: 4, speed: "\u9650\u6d41\u4e2d", advantage: "\u514d\u8d39\u652f\u6301\u56fe\u7247\u7406\u89e3\uff1b\u5f53\u524d\u8bbf\u95ee\u91cf\u8fc7\u5927\u88ab\u9650\u6d41\uff0c\u5931\u8d25\u81ea\u52a8\u964d\u7ea7 GLM-4V-Flash", applicable: "\u56fe\u7247\u7406\u89e3\u3001\u9898\u76ee\u4e0e\u8bfe\u4ef6\u622a\u56fe\u89e3\u8bfb" }',
    '    "qf-ernie-32k": { platform: "\u767e\u5ea6\u5343\u5e06", params: "", type: "\u901a\u7528\u5bf9\u8bdd", stars: 3, speed: "\u5feb", advantage: "\u767e\u5ea6\u6587\u5fc3 ERNIE \u7cfb\u5217\uff0c\u5b9e\u6d4b\u7ea6 2 \u79d2", applicable: "\u901a\u7528\u4e2d\u6587\u95ee\u7b54" }',
    '    "qf-ernie-128k": { platform: "\u767e\u5ea6\u5343\u5e06", params: "", type: "\u901a\u7528\u5bf9\u8bdd\uff08\u5927\u4e0a\u4e0b\u6587\uff09", stars: 3, speed: "\u5feb", advantage: "\u767e\u5ea6\u6587\u5fc3 ERNIE \u7cfb\u5217\uff0c128K \u5927\u4e0a\u4e0b\u6587\uff0c\u5b9e\u6d4b\u7ea6 1.8 \u79d2", applicable: "\u957f\u6587\u672c\u3001\u957f\u4e0a\u4e0b\u6587\u95ee\u7b54" }',
    '    "or-auto": { platform: "OpenRouter", params: "", type: "\u81ea\u52a8\u8def\u7531", stars: 4, speed: "\u5feb", advantage: "\u81ea\u52a8\u9009\u62e9\u5408\u9002\u7684\u514d\u8d39\u6a21\u578b\uff0c\u5b9e\u6d4b\u7ea6 1.8 \u79d2\uff1b\u514d\u8d39\u989d\u5ea6 50 \u6b21/\u5929\u300120 \u6b21/\u5206\u949f\uff1b\u9700\u81ea\u5907\u7f51\u7edc", applicable: "\u4e0d\u786e\u5b9a\u7528\u54ea\u4e2a\u6a21\u578b\u65f6\u7684\u65e5\u5e38\u95ee\u7b54" }',
    '    "or-nemotron-super": { platform: "OpenRouter", params: "", type: "\u901a\u7528\u5bf9\u8bdd", stars: 4, speed: "\u5feb", advantage: "\u5b9e\u6d4b\u7ea6 1.2 \u79d2\uff1b\u514d\u8d39\u989d\u5ea6 50 \u6b21/\u5929\u300120 \u6b21/\u5206\u949f\uff1b\u9700\u81ea\u5907\u7f51\u7edc", applicable: "\u65e5\u5e38\u95ee\u7b54" }',
    '    "or-nemotron-ultra": { platform: "OpenRouter", params: "", type: "\u6df1\u5ea6\u63a8\u7406", stars: 5, speed: "\u4e2d", advantage: "\u6df1\u5ea6\u63a8\u7406\uff08\u5b9e\u6d4b\u7ea6 3.3 \u79d2\uff09\uff1b\u514d\u8d39\u989d\u5ea6 50 \u6b21/\u5929\u300120 \u6b21/\u5206\u949f\uff1b\u9700\u81ea\u5907\u7f51\u7edc", applicable: "\u590d\u6742\u63a8\u7406\u95ee\u9898" }',
    '    "gm-flash-lite": { platform: "Google Gemini", params: "", type: "\u901a\u7528\u5bf9\u8bdd\uff08\u8f7b\u91cf\uff09", stars: 3, speed: "\u5feb", advantage: "\u8d85\u5feb\u8f7b\u91cf\uff08\u5b9e\u6d4b\u7ea6 1 \u79d2\uff09\uff1b\u9700\u81ea\u5907\u7f51\u7edc", applicable: "\u65e5\u5e38\u8f7b\u91cf\u95ee\u7b54" }',
    '    "gm-flash": { platform: "Google Gemini", params: "", type: "\u901a\u7528\u5bf9\u8bdd\uff08\u63a8\u7406\uff09", stars: 4, speed: "\u4e2d", advantage: "\u901a\u7528\u80fd\u529b\u5f3a\uff08\u5b9e\u6d4b\u7ea6 2.9 \u79d2\uff09\uff1b\u9700\u81ea\u5907\u7f51\u7edc", applicable: "\u65e5\u5e38\u95ee\u7b54\u3001\u63a8\u7406" }',
]
DETAILS_BLOCK = ",\n".join(DETAIL_EXISTING_ARK + DETAIL_ARK_NEW + DETAIL_OTHER + DETAIL_IMG)

MODES_BLOCK = """    fast: { label: "\u26a1\u5feb\u901f\u6a21\u5f0f", chain: ["ark-v4-flash", "ark-doubao-mini", "ark-lite-260428", "glm-4.7", "qf-ernie-32k", "gm-flash-lite", "or-auto"] },
    balanced: { label: "\u2696\u5747\u8861\u6a21\u5f0f", chain: ["ark-v4-pro", "ark-turbo-260628", "glm-4.7", "qf-ernie-128k", "gm-flash", "or-nemotron-super"] },
    ultimate: { label: "\U0001F3C6\u6781\u81f4\u6a21\u5f0f", chain: ["ark-doubao-pro", "ark-evolving", "or-nemotron-ultra", "ark-v4-pro", "ark-glm-5.2", "gm-flash", "qf-ernie-128k"] }"""

IMAGEGEN_BLOCK = """    },
    imagegen: {
      desc: "\u56fe\u7247\u751f\u6210",
      // \u914d\u7f6e\u5c42\u767b\u8bb0\uff1aseedream \u8d70 images/generations \u63a5\u53e3\uff0c\u8c03\u7528\u94fe\u8def\u5f85\u8bc4\u4f30\uff08chat \u8c03\u7528\u4f1a\u5931\u8d25\u5e76\u6309 fallback \u964d\u7ea7\uff09
      primary: "ark-seedream-4-0828",
      fallback: ["ark-seedream-5-pro", "ark-seedream-4-0415"],
      temperature: 0.8,
      maxTokens: 1000
    }"""

L233_NEW = "  // \u81ea\u52a8\u6a21\u5f0f\u9009\u62e9\u5668\u91cc\u7684\u201c\u81ea\u52a8\uff08\u63a8\u8350\uff09\u201d\u5360\u4f4d\u9879\uff08\u4e0d\u8ba1\u5165\u5185\u7f6e\u6a21\u578b 28 \u4e2a\uff09"
L239_NEW = "  // \u5185\u7f6e\u514d\u8d39\u6a21\u578b\u5217\u8868\uff0828 \u4e2a\uff0c\u542b fallback \u94fe\uff1b\u987a\u5e8f\u5373\u6a21\u578b\u4e0b\u62c9\u5206\u7ec4\u987a\u5e8f\uff1a\u706b\u5c71\u65b9\u821f \u2192 \u667a\u8c31 \u2192 \u767e\u5ea6\u5343\u5e06 \u2192 OpenRouter \u2192 Gemini \u2192 \u56fe\u7247\u751f\u6210\uff09"
L240_NEW = "  // \u7845\u57fa\u6d41\u52a8\u5168\u90e8\u6a21\u578b 402 \u6b20\u8d39\u5df2\u6e05\u7a7a\uff0cprovider \u914d\u7f6e\u4fdd\u7559\uff0c\u5f85\u6362 key \u540e\u6062\u590d\uff1bseedream \u56fe\u7247\u6a21\u578b\u8d70 arkimage\uff08images/generations\uff09\uff0c\u8c03\u7528\u94fe\u8def\u5f85\u8bc4\u4f30\u3002"
L489_NEW = "  // 8 \u7c7b\u529f\u80fd\uff0c\u5404\u81ea\u58f0\u660e\u9996\u9009\u6a21\u578b\u3001\u964d\u7ea7\u94fe\u3001temperature\u3001maxTokens\u3001\u8bf4\u660e\u3002"
L502_NEW = '      fallback: ["ark-doubao-pro", "ark-evolving", "or-nemotron-ultra"],'
L542_NEW = '      fallback: ["ark-doubao-pro", "ark-character-260628", "ark-glm-flash"],'
L95_NEW = '        { id: "ark-glm-flash", name: "GLM-5.3-Flash", types: ["general"] },'

# ---- bottom-up surgery (1-indexed ranges) ----
# 8) FUNC_TYPES: comment + reasoning + creative fallback + imagegen block (replace L545 '    }' with block)
lines[544:545] = IMAGEGEN_BLOCK.split("\n")
lines[541:542] = [L542_NEW]
lines[501:502] = [L502_NEW]
lines[488:489] = [L489_NEW]
# 7) modelModes chains L463-465
lines[462:465] = MODES_BLOCK.split("\n")
# 6) modelDetails entries L442-457
lines[441:457] = DETAILS_BLOCK.split("\n")
# 5) builtinModels entries L242-435
lines[241:435] = BUILTIN_BLOCK.split("\n")
# 4) comments L239-240
lines[238:240] = [L239_NEW, L240_NEW]
# 3) L233
lines[232:233] = [L233_NEW]
# 2) providerGroups ark: L95 + 9 new lines
lines[94:95] = (L95_NEW + "\n" + PG_NEW).split("\n")
# 1) providers: insert arkimage after L32
lines[32:32] = PROVIDER_BLOCK.split("\n")

new_text = "\r\n".join(lines)
open(CFG, "wb").write(new_text.encode("utf-8"))
print("ai-config.js written")

# ================= ai-page.js (LF) =================
pdata = open(PAGE, "rb").read()
assert pdata.count(b"\r") == 0
ptext = pdata.decode("utf-8")
plines = ptext.split("\n")
def pchk(idx0, expect):
    assert expect in plines[idx0], "page L%d mismatch: %r" % (idx0 + 1, plines[idx0][:100])
pchk(42, "var RATE_FALLBACK")
pchk(60, "};")
pchk(63, "var MODEL_DETAILS")
pchk(80, "};")
pchk(83, "var FALLBACK_MODELS")
pchk(101, "];")
pchk(1190, "combined.forEach")

STAR = {2: "\u2605\u2605", 3: "\u2605\u2605\u2605", 4: "\u2605\u2605\u2605\u2605", 5: "\u2605\u2605\u2605\u2605\u2605"}
def pdet_line(mid, d):
    # d is the ai-config detail string; convert stars int to star string for local style
    m = re.search(r'stars: (\d)', d)
    s = STAR[int(m.group(1))]
    return "    '" + mid + "': " + d.split(': { ', 1)[1].replace('stars: %s' % m.group(1), "stars: '%s'" % s).rstrip(' }') + " }"

# build ai-page tables from the ai-config content just written (normalize CRLF for regex parsing)
cfg_text = new_text.replace("\r\n", "\n")
def cfg_detail(key):
    m = re.search(r'^    "%s": \{ (.*) \},?$' % re.escape(key), cfg_text, re.M)
    assert m, "detail missing for " + key
    return m.group(1)

rate_map = {}
for m in re.finditer(r'id: "([\w.\-]+)",\n      name: "[^"]*",\n      provider: "[^"]*",\n      model: "[^"]*",\n      types: \[[^\]]*\],\n      tag: "[^"]*",\n      rate: "([^"]+)"', cfg_text):
    rate_map[m.group(1)] = m.group(2)

order_ids = [m.group(1) for m in re.finditer(r'^      id: "([\w.\-]+)",$', cfg_text, re.M)]

RATE_BLOCK = "    'auto': '\u81ea\u9002\u5e94',\n" + ",\n".join("    '%s': '%s'" % (i, rate_map[i]) for i in order_ids)
DETAIL_BLOCK = ",\n".join("    '%s': { %s }" % (i, cfg_detail(i).replace('stars: %d' % int(re.search(r'stars: (\d)', cfg_detail(i)).group(1)), "stars: '%s'" % STAR[int(re.search(r'stars: (\d)', cfg_detail(i)).group(1))])) for i in order_ids)
BM_SLICE = cfg_text[cfg_text.index("  builtinModels: ["):]
BM_SLICE = BM_SLICE[:BM_SLICE.index("\n  ],")]
def fb_line(mid):
    m = re.search(r'id: "%s",([\s\S]*?)\n    \}' % re.escape(mid), BM_SLICE)
    seg = m.group(1)
    name = re.search(r'name: "([^"]+)"', seg).group(1)
    prov = re.search(r'provider: "([^"]+)"', seg).group(1)
    model = re.search(r'model: "([^"]+)"', seg).group(1)
    types = re.search(r'types: \[([^\]]*)\]', seg).group(1).replace('"', "'")
    fb = re.search(r'fallback: ([^,\n]+)', seg).group(1)
    if fb == "null":
        fb = "null"
    else:
        fb = "'%s'" % fb.strip('"')
    return "    { id: '%s', name: '%s', provider: '%s', model: '%s', types: [%s], tag: null, fallback: %s }" % (mid, name, prov, model, types, fb)
FB_BLOCK = "    { id: 'auto', name: '\u81ea\u52a8\uff08\u63a8\u8350\uff09', provider: null, model: null, types: ['general', 'math', 'image', 'translate'], tag: null, fallback: null },\n" + ",\n".join(fb_line(i) for i in order_ids)

RENDER_NEW = """    var combined = applyListSettings(getBuiltinModels().filter(function (m) { return m.id !== 'auto'; }).concat(getCustomModels()));
    /* \u56fe\u7247\u751f\u6210\u6a21\u578b\uff08types \u542b imagegen\uff09\u6392\u5230\u5206\u9694\u7ebf\u4e0b\u65b9\uff0c\u4e0e\u6587\u672c\u6a21\u578b\u5206\u5f00 */
    var textRows = [];
    var imageGenRows = [];
    combined.forEach(function (m) {
      var ts = (m && m.types) ? m.types : [];
      if (ts.indexOf('imagegen') >= 0) imageGenRows.push(m); else textRows.push(m);
    });
    textRows.forEach(function (m) { list.appendChild(modelRow(m, manual && sel === m.id)); });
    if (imageGenRows.length) {
      var imgSep = doc.createElement('div');
      imgSep.style.cssText = 'height:1px;background:rgba(128,128,128,.28);margin:6px 4px;flex:none;';
      list.appendChild(imgSep);
      imageGenRows.forEach(function (m) { list.appendChild(modelRow(m, manual && sel === m.id)); });
    }"""

# bottom-up (page): render L1190-1191, FB entries L85-101, DETAIL entries L65-80, RATE entries L44-60
plines[1189:1191] = RENDER_NEW.split("\n")
plines[84:101] = FB_BLOCK.split("\n")
plines[64:80] = DETAIL_BLOCK.split("\n")
plines[43:60] = RATE_BLOCK.split("\n")

new_ptext = "\n".join(plines)
assert "\r" not in new_ptext
open(PAGE, "wb").write(new_ptext.encode("utf-8"))
print("ai-page.js written")

# ================= post-checks =================
errs = []
c = open(CFG, "rb").read().decode("utf-8")
p = open(PAGE, "rb").read().decode("utf-8")
new_ids = ["ark-v4-pro-260425", "ark-code-preview", "ark-lite-260215", "ark-character-251128",
           "ark-character-260628", "ark-lite-260428", "ark-turbo-260628", "ark-evolving",
           "ark-glm-5.2", "ark-seedream-4-0415", "ark-seedream-4-0828", "ark-seedream-5-pro"]
bm_start = c.index("  builtinModels: [")
bm_end = c.index("\r\n  ],", bm_start)
bm = c[bm_start:bm_end]
if bm.count('id: "') != 28:
    errs.append("builtinModels count = %d" % bm.count('id: "'))
for i in new_ids:
    if bm.count('id: "%s"' % i) != 1:
        errs.append("new model %s entries != 1" % i)
all_ids = set(order_ids)
# chain/func refs resolve
refs = set()
for m in re.finditer(r'chain: \[([^\]]*)\]', c):
    refs.update(re.findall(r'"([^"]+)"', m.group(1)))
ft = c[c.index("  FUNC_TYPES: {"):]
ft = ft[:ft.index("\r\n};")]
refs.update(re.findall(r'primary: "([^"]+)"', ft))
for fbk in re.findall(r'fallback: \[([^\]]*)\]', ft):
    refs.update(re.findall(r'"([^"]+)"', fbk))
ar = c[c.index("  autoRoute: {"):]
ar = ar[:ar.index("}")]
refs.update(re.findall(r': "([^"]+)"', ar))
refs.update(re.findall(r'fallback: "([^"]+)"', bm))
dang = sorted(refs - all_ids)
if dang:
    errs.append("dangling refs: %r" % dang)
# seedream specifics
if c.count('types: ["imagegen"]') != 3:
    errs.append("imagegen types != 3")
if 'arkimage: {' not in c or "images/generations" not in c:
    errs.append("arkimage provider missing")
if c.count(ARK_KEY) != 2:
    errs.append("ark key count != 2 (ark + arkimage)")
# EOL
cd = open(CFG, "rb").read()
if not (cd.count(b"\n") == cd.count(b"\r") == cd.count(b"\r\n")):
    errs.append("ai-config EOL broken")
if open(PAGE, "rb").read().count(b"\r") != 0:
    errs.append("ai-page has CR")
# ai-page tables synced
if p.count("'ark-seedream-5-pro'") < 3:
    errs.append("ai-page tables not synced with seedream")
# ES2017 guard on new code
for bad in ["?.", "...", "replaceAll(", "fromEntries", ".at("]:
    if bad in RENDER_NEW:
        errs.append("forbidden %r in render block" % bad)

if errs:
    print("POST-CHECK FAIL:")
    for e in errs:
        print("  -", e)
    sys.exit(1)
print("post-checks OK: 28 models, 12 new ids x1, no dangling refs, imagegen x3, arkimage provider OK, EOL intact")
