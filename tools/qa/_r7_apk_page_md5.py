# md5 compare: APK 1.36 entries vs local files (page-level, settle "old package" question)
import zipfile, hashlib, os

ROOT = r"D:\下载的文件\学习工作台"
APK = os.path.join(ROOT, "星途-安卓App.apk")
OUT = os.path.join(ROOT, "_r7_apk_page_md5.txt")
EXPECT_MD5 = "9ffc9cb644fbc2948d7894e0639d6d10"

FILES = [
    "个人中心.html", "设置.html", "AI.html", "ai-settings.html", "更多.html",
    "assets/subpage-router.js", "assets/xt-settings.js", "assets/layer-stack.js",
    "assets/app.js", "assets/api.js", "assets/ai-page.js", "assets/ai-settings.js",
    "assets/error-boundary.js", "assets/icon-map.js", "assets/xt-polyfill.js",
    "assets/ai-service.js", "assets/ai-cap-3d.js",
]

def md5(b): return hashlib.md5(b).hexdigest()

lines = []
with open(APK, "rb") as f:
    apk_md5 = md5(f.read())
lines.append("APK md5=%s expect=%s match=%s" % (apk_md5, EXPECT_MD5, apk_md5 == EXPECT_MD5))
lines.append("")
same = miss = diff = 0
with zipfile.ZipFile(APK) as z:
    names = set(z.namelist())
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        entry = rel if rel in names else ("assets/" + rel)
        if entry not in names and "/" not in rel:
            entry = rel
        in_apk = entry in names
        if not os.path.exists(local):
            lines.append("%-40s LOCAL-MISSING" % rel); diff += 1; continue
        lb = open(local, "rb").read()
        if not in_apk:
            lines.append("%-40s APK-MISSING  (local %d B)" % (rel, len(lb))); miss += 1; continue
        ab = z.read(entry)
        if hashlib.md5(ab).hexdigest() == hashlib.md5(lb).hexdigest():
            lines.append("%-40s SAME  (%d B)" % (rel, len(lb))); same += 1
        else:
            lines.append("%-40s DIFF  apk=%d B local=%d B" % (rel, len(ab), len(lb))); diff += 1

lines.append("")
lines.append("SAME=%d APK-MISSING=%d DIFF/LOCAL-MISSING=%d" % (same, miss, diff))
open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print("DONE")
