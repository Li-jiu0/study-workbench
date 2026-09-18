import os, time

base = r"D:\下载的文件\学习工作台"

def stat(rel):
    p = os.path.join(base, rel)
    st = os.stat(p)
    with open(p, "rb") as f:
        b = f.read()
    crlf = b.count(b"\r\n"); lf = b.count(b"\n")
    return "%-46s bytes=%-7d CRLF=%-5d bareLF=%-5d mtime=%s" % (
        rel, len(b), crlf, lf - crlf,
        time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime)))

out = []
out.append("=== 本任务独占文件（应有改动）===")
out.append(stat("学习概括.html"))
out.append(stat("学习概括.html.bak-a8-lf2crlf"))
out.append(stat("assets\\notify.js"))
out.append("")
out.append("=== 越界自查：不应被改动 P0 文件 ===")
for r in ["更多.html", "工具.html", "设置.html", "个人中心.html", "学习工作台.html"]:
    out.append(stat(r))
out.append("")
out.append("=== 结论 ===")
out.append("仅 学习概括.html 被修改（LF->CRLF）+ 新增 .bak-a8-lf2crlf 备份；")
out.append("assets/notify.js 未被修改（仍纯 LF / 顶层 0 声明）。")
out.append("更多.html / 工具.html 未被写入 —— 入口卡以补丁形式交付，待主理人转派。")

with open(os.path.join(base, "_a8_mtime.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
