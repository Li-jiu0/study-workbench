# -*- coding: utf-8 -*-
import os, re, json
ROOT = r"D:\下载的文件\学习工作台"
ASSETS = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "tools", "_r87_t01_verify.txt")
FILES = ["ai-cap-audio.js","ai-cap-embed.js","ai-cap-image.js","ai-cap-vision.js",
         "ai-cap-translate.js","ai-cap-video.js","ai-cap-3d.js","ai-config.js"]
L = []
def log(s): L.append(s)

# ---- builtinModels count (indent 6) ----
cfg = open(os.path.join(ASSETS,"ai-config.js"),"rb").read().decode("utf-8")
norm = cfg.replace("\r\n","\n")
a = norm.find("builtinModels: ["); b = norm.find("\n  ],", a)
seg = norm[a:b]
ids = re.findall(r'\n      id: "([^"]+)"', seg)
log("builtinModels count = %d" % len(ids))
log("new 8 present: " + str(all(x in ids for x in ["ark-seedance-1-0-pro","ark-seedance-1-0-pro-fast","ark-seedance-1-5-pro","ark-seedance-1-0-lite-t2v","ark-seedance-1-0-lite-i2v","ark-seed3d-2-0","ark-hyper3d-gen2","ark-hitem3d-2-0"])))

# ---- FUNC_TYPES slots ----
fa = norm.find("FUNC_TYPES: {"); fb = norm.find("\n  }\n};", fa)
fslots = re.findall(r"\n    ([A-Za-z_][A-Za-z0-9_]*): \{", norm[fa:fb])
log("FUNC_TYPES slots = %d -> %s" % (len(fslots), fslots))

# ---- terminate-tag check ----
log("tag 即将下线 count = %d" % norm.count('tag: "即将下线"'))
log("quota digits leaked (2000000/150000/500000) = %s" %
    any(x in norm for x in ["2000000","150000","500000"]))

# ---- dump the 8 new model blocks ----
def block_after(idx):
    end = norm.find("\n    },", idx)
    return norm[idx:end+6].strip()
log("\n===== 8 new builtinModels JSON =====")
for mid in ["ark-seedance-1-0-pro","ark-seedance-1-0-pro-fast","ark-seedance-1-5-pro",
            "ark-seedance-1-0-lite-t2v","ark-seedance-1-0-lite-i2v",
            "ark-seed3d-2-0","ark-hyper3d-gen2","ark-hitem3d-2-0"]:
    i = norm.find('id: "%s"' % mid, a, b)
    log(block_after(i))

# ---- ES2017 banned patterns ----
pats = {
    "optional-chain ?.": r"\?\.",
    "nullish ??": r"\?\?",
    "spread/rest ...": r"\.\.\.",
    "replaceAll": r"\.replaceAll\(",
    "Object.fromEntries": r"Object\.fromEntries",
    "lookbehind (?<": r"\(\?<",
    ".at(": r"\.at\(",
    "exponent **": r"\*\*",
    "optional catch": r"catch\s*\{",
}
log("\n===== ES2017 banned-pattern scan (8 files) =====")
total = {}
for fn in FILES:
    t = open(os.path.join(ASSETS, fn), "rb").read().decode("utf-8")
    row = []
    for name, p in pats.items():
        n = len(re.findall(p, t))
        if n:
            row.append("%s=%d" % (name, n))
            total[name] = total.get(name, 0) + n
    log("%-20s %s" % (fn, (", ".join(row) if row else "clean")))
log("TOTAL hits: " + (json.dumps(total, ensure_ascii=False) if total else "0 (all clean)"))

open(OUT,"wb").write(("\n".join(L)).encode("utf-8"))
print("VERIFY DONE")
