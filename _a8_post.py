import os, time, subprocess

base = r"D:\下载的文件\学习工作台"
node = r"C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
out = []

def stat(rel):
    p = os.path.join(base, rel)
    st = os.stat(p)
    with open(p, "rb") as f:
        b = f.read()
    crlf = b.count(b"\r\n"); lf = b.count(b"\n")
    return "%-52s bytes=%-7d CRLF=%-5d bareLF=%-5d mtime=%s" % (
        rel, len(b), crlf, lf - crlf,
        time.strftime("%H:%M:%S", time.localtime(st.st_mtime)))

out.append("=== POST-CHECK 快照 ===")
out.append(stat("学习概括.html"))
out.append(stat("assets\\notify.js"))
out.append(stat("交付报告-A8-学习概括与notify接线-20260916.md"))
out.append(stat("更多.html"))
out.append(stat("工具.html"))
out.append("")
out.append("=== 报告内容抽检 ===")
with open(os.path.join(base, "交付报告-A8-学习概括与notify接线-20260916.md"), "rb") as f:
    r = f.read().decode("utf-8", "replace")
out.append("report chars=%d lines=%d" % (len(r), r.count("\n") + 1))
for kw in ["学习概括.html", "notify.js", "chart-bar", "更多.html", "待主理人转派",
           "CRLF=837", "顶层声明", "W6", "DONE"]:
    out.append("  contains %-16s -> %s" % (kw, "YES" if kw in r else "NO"))

out.append("")
out.append("=== QA 复核 ===")
r1 = subprocess.run([node, "--check", os.path.join(base, "assets\\notify.js")],
                    capture_output=True, text=True)
out.append("node --check notify.js rc=%d -> %s" % (r1.returncode, "PASS" if r1.returncode == 0 else "FAIL"))
r2 = subprocess.run([node, os.path.join(base, "tools", "qa", "escheck_es2017.js")],
                    capture_output=True, text=True, cwd=base)
out.append("escheck: %s rc=%d" % (r2.stdout.strip()[-80:], r2.returncode))

with open(os.path.join(base, "_a8_post.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
