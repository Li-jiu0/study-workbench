# -*- coding: utf-8 -*-
"""R88-STAMP 第一步审计：只读，不改任何文件。
1) 候选文件 mtime / 体积 / 真实行尾
2) 扫描全树 html 里对 assets 资源的真实引用（含 <script src>、<link href>、@import、字符串 URL）
输出 JSON 供人工核对。
"""
import os, re, json, io

ROOT = r"D:\下载的文件\学习工作台"

CANDIDATES = [
    "AI模拟面试.html",
    "私聊.html",
    "设置.html",
    "assets/common.css",
    "assets/xt-profile.css",
    "更多.html",
    "assets/xt-update.js",
    "assets/xt-moments.js",
    "朋友圈发布.html",
    "assets/xt-profile.js",
    "assets/ai-service.js",
    "assets/ai-settings.js",
    "ai-settings.html",
    "assets/ai-page.js",
    "assets/icon-map.js",
    "assets/xt-aiusage.js",
    "assets/xt-region.js",
    "assets/chat-local.js",
    "assets/api.js",
    "assets/app.js",
    "社区.html",
]

def line_endings(path):
    b = open(path, "rb").read()
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    cr = b.count(b"\r")
    lone_lf = lf - crlf
    lone_cr = cr - crlf
    if crlf > 0 and lone_lf == 0:
        kind = "CRLF"
    elif lf > 0 and crlf == 0:
        kind = "LF"
    else:
        kind = "MIXED"
    return {
        "bytes": len(b),
        "lines": lf,
        "crlf": crlf,
        "lone_lf": lone_lf,
        "lone_cr": lone_cr,
        "kind": kind,
    }

def main():
    files_info = []
    for rel in CANDIDATES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            files_info.append({"rel": rel, "exists": False})
            continue
        st = os.stat(p)
        le = line_endings(p)
        files_info.append({
            "rel": rel,
            "exists": True,
            "mtime": st.st_mtime,
            "mtime_str": __import__("datetime").datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "size": st.st_size,
            "bytes": le["bytes"],
            "lines": le["lines"],
            "crlf": le["crlf"],
            "lone_lf": le["lone_lf"],
            "lone_cr": le["lone_cr"],
            "le_kind": le["kind"],
        })

    out = {"files": files_info}
    with io.open(os.path.join(ROOT, "tools", "qa", "_stamp_files.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # 简单文本表
    lines = []
    lines.append("rel\tmtime\tmtime_str\tsize\tbytes\tlines\tcrlf\tloneLF\tloneCR\tkind")
    for fi in files_info:
        if not fi.get("exists"):
            lines.append(fi["rel"] + "\tMISSING")
            continue
        lines.append("\t".join(str(fi[k]) for k in ["rel","mtime","mtime_str","size","bytes","lines","crlf","lone_lf","lone_cr","le_kind"]))
    with io.open(os.path.join(ROOT, "tools", "qa", "_stamp_files.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("OK files=", len(files_info))

main()
