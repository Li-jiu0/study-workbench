# -*- coding: utf-8 -*-
"""补充提交：本批新增的部署/同步/推送/清理工具脚本。"""
import os
import subprocess

ROOT = r"D:\下载的文件\学习工作台"
PROXY = "http://127.0.0.1:7897"
LOG = os.path.join(ROOT, "tools", "_push_tools_out.txt")

FILES = [
    "tools/sync_bump_20260915c.py",
    "tools/deploy_update_20260915c.py",
    "tools/push_github_20260915c.py",
    "tools/cleanup_temp_20260915c.py",
]
MSG = """chore: 补充批次八使用的部署/同步/推送/清理工具脚本

- sync_bump_20260915c.py    工作树 -> 部署源同步 + 版本戳 bump
- deploy_update_20260915c.py 打包上传并远端备份解压
- push_github_20260915c.py  提交并推送 GitHub（走 7897 代理）
- cleanup_temp_20260915c.py 清理临时产物（只删 git 未跟踪文件）
"""


def git(args, env=None):
    p = subprocess.run(["git"] + args, cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def main():
    L = []
    msgfile = os.path.join(ROOT, "tools", "_commit_msg2.txt")
    with open(msgfile, "w", encoding="utf-8") as fh:
        fh.write(MSG)

    added = []
    for f in FILES:
        if os.path.exists(os.path.join(ROOT, f)):
            rc, out = git(["add", "--", f])
            added.append("%s rc=%d" % (f, rc))
        else:
            added.append("%s (不存在)" % f)
    L.append("=== add ===")
    L.extend(added)

    rc, out = git(["diff", "--cached", "--name-only"])
    staged = [l for l in out.splitlines() if l.strip()]
    L.append("staged: %d" % len(staged))
    L.extend("  " + s for s in staged)

    if not staged:
        L.append("无内容可提交，跳过")
    else:
        rc, out = git(["commit", "-F", msgfile])
        L.append("=== commit rc=%d ===" % rc)
        L.append(out.strip()[:600])
        env = dict(os.environ)
        env["http_proxy"] = PROXY
        env["https_proxy"] = PROXY
        p = subprocess.run(
            ["git", "-c", "http.proxy=" + PROXY, "-c", "https.proxy=" + PROXY,
             "-c", "http.version=HTTP/1.1", "push", "origin", "main"],
            cwd=ROOT, capture_output=True, text=True,
            encoding="utf-8", errors="replace", env=env)
        L.append("=== push rc=%d ===" % p.returncode)
        L.append(((p.stdout or "") + (p.stderr or "")).strip()[:800])
        rc, out = git(["rev-parse", "--short", "HEAD"])
        L.append("local HEAD: " + out.strip())

    with open(LOG, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))


try:
    main()
except Exception as e:
    import traceback
    with open(LOG, "w", encoding="utf-8") as fh:
        fh.write("EXCEPTION %r\n%s" % (e, traceback.format_exc()))
