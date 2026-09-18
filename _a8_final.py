import os, re, subprocess, sys

base = r"D:\下载的文件\学习工作台"
node = r"C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
out = []

with open(os.path.join(base, "学习概括.html"), "rb") as f:
    b = f.read()
h = b.decode("utf-8", "replace")

out.append("=== 最终断言：学习概括.html ===")
crlf = b.count(b"\r\n"); lf = b.count(b"\n")
out.append("bytes=%d CRLF=%d bareLF=%d -> %s" % (
    len(b), crlf, lf - crlf, "PASS" if (crlf > 0 and lf - crlf == 0) else "FAIL"))
out.append("comment <!-- -->  : %d / %d" % (h.count("<!--"), h.count("-->")))
out.append("div               : %d / %d" % (len(re.findall(r"<div[\s>]", h)), h.count("</div>")))
out.append("script            : %d / %d" % (len(re.findall(r"<script[\s>]", h)), h.count("</script>")))
out.append("head/body/html    : %d/%d %d/%d %d/%d" % (
    len(re.findall(r"<head[\s>]", h)), h.count("</head>"),
    len(re.findall(r"<body[\s>]", h)), h.count("</body>"),
    len(re.findall(r"<html[\s>]", h)), h.count("</html>")))

out.append("")
out.append("=== notify.js 断言 ===")
with open(os.path.join(base, "assets\\notify.js"), "rb") as f:
    nb = f.read()
ncrlf = nb.count(b"\r\n"); nlf = nb.count(b"\n")
out.append("bytes=%d CRLF=%d bareLF=%d -> %s" % (
    len(nb), ncrlf, nlf - ncrlf, "PASS(pure LF)" if (ncrlf == 0 and nlf > 0) else "FAIL"))

# node --check
r = subprocess.run([node, "--check", os.path.join(base, "assets\\notify.js")],
                   capture_output=True, text=True)
out.append("node --check rc=%d -> %s" % (r.returncode, "PASS" if r.returncode == 0 else "FAIL"))
if r.stderr.strip():
    out.append("  stderr: " + r.stderr.strip()[:400])

# escheck
r2 = subprocess.run([node, os.path.join(base, "tools", "qa", "escheck_es2017.js")],
                    capture_output=True, text=True, cwd=base)
out.append("escheck: %s (rc=%d)" % (r2.stdout.strip()[-200:], r2.returncode))
if r2.stderr.strip():
    out.append("  stderr: " + r2.stderr.strip()[:300])

with open(os.path.join(base, "_a8_final.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
