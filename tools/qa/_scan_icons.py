# -*- coding: utf-8 -*-
# 扫描：页面上 data-icon="X" 用到的图标 vs icon-map.js 已注册 key，
# 输出「未注册」清单（这正是别的线做图标替换时缺的弹药）
import io, os, re

ROOT = r"D:\下载的文件\学习工作台"
ICM = os.path.join(ROOT, "assets", "icon-map.js")

src = io.open(ICM, encoding="utf-8", errors="replace").read()
registered = set(re.findall(r'"([A-Za-z0-9_\-]+)"\s*:\s*svg\(', src))
# 别名形式：部分写在字典外，如 window.LUCIDE_ICONS.xxx = ...，一并收集
registered |= set(re.findall(r'LUCIDE_ICONS\[?\.?\s*"([A-Za-z0-9_\-]+)"', src))

usage = {}
def scan_file(p):
    try:
        t = io.open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        return
    for m in re.finditer(r'data-icon="([^"]+)"', t):
        v = m.group(1)
        # 跳过模板占位（如 ${...}）
        if "${" in v:
            continue
        usage.setdefault(v, []).append(os.path.relpath(p, ROOT))
    # 代码里 data-icon="' + name + '" 这类动态拼接也扫一下
    for m in re.finditer(r'data-icon=[\'"][^\'"]*[\'"]\s*\+', t):
        pass

skip_dirs = {"备份", "node_modules", ".git", "tools"}
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs]
    for fn in filenames:
        if fn.endswith((".html", ".js")):
            scan_file(os.path.join(dirpath, fn))

out = []
out.append("registered keys: %d" % len(registered))
out.append("distinct data-icon values used: %d" % len(usage))
out.append("")
out.append("== MISSING (used but not registered) ==")
missing = sorted([v for v in usage if v not in registered])
for v in missing:
    files = sorted(set(usage[v]))
    out.append("  %-22s x%-3d  %s" % (v, len(usage[v]), ", ".join(files[:4])))
out.append("")
out.append("total missing: %d" % len(missing))
out.append("")
out.append("== REGISTERED (for reference, tail 40) ==")
for k in sorted(registered)[-40:]:
    out.append("  " + k)

io.open(os.path.join(ROOT, "tools", "qa", "_icons_missing.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("done")
