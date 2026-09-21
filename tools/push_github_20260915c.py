# -*- coding: utf-8 -*-
"""批次八收尾：把前端改动提交并推送到 GitHub（main 分支）。

只推「部署源根目录」这个 main 分支工作树。
排除：所有 _ 开头的临时文件、tools/_* 调试产物、tools/*.tar.gz（84MB 部署包）。
包含：所有被修改的已跟踪文件 + 本批新增的正式文件（时政热点.html / 申论刷题.html /
      assets/roleplay.js / assets/data/shenlun-* / assets/images 题库切图 / 交接与执行文档）。
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROXY = "http://127.0.0.1:7897"
LOG = os.path.join(ROOT, "tools", "_push_out.txt")

NEW_FILES = [
    "时政热点.html",
    "申论刷题.html",
    "assets/roleplay.js",
    "assets/data/shenlun-inline.js",
    "assets/data/shenlun-questions.json",
    "assets/images",
    "交接文档-批次八-20260914-行测导入.md",
    "任务执行文档-20260915-全线自主执行.md",
    "tools/inject_book.py",
    "tools/inject_judge_20260915.py",
    "tools/inject_shenlun_20260915.py",
    "tools/sync_bump_20260915a.py",
    "tools/sync_bump_20260915b.py",
    "tools/deploy_update_20260915a.py",
    "tools/deploy_update_20260915b.py",
]

MSG = """批次八收尾：12 项需求交付 + 全项目 bug 排查修复

需求交付
- 时政热点：弹窗改为独立页面（ADR-3），新增 时政热点.html
- 图形推理：修复题目图片不显示（[IMG:] 未渲染），新增 xtRenderQText
- 真题模拟：修复页面无法滑动（common.css 全局滚动锁），波及 7 个独立页
- 个人资料：新增「查看 TA 的动态」按钮，动态页支持按用户过滤
- 消息撤回：2 分钟内可撤回，轻量确认气泡，占位系统提示
- 导入题库：修复 __qbImportRaw 未定义导致导入无反应，支持按文件自动建自定义题库
- 朗读服务：修复 Web Speech voices/resume/onerror 三坑，新增安全播放层
- 阅读理解/翻译专项：布局升级，修复宽屏文章栏被工具条遮挡
- i人团伙：显示优化 + 回复库 30 → 845 条；角色扮演已并入
- 角色扮演：抽离为 assets/roleplay.js，删除高情商表达页旧菜单
- 内置 AI：本地知识库 7 条规则 → 37 意图 / 101 条回复，支持同义归一与上下文追问
- 穿越英语：内容 36 → 272 条，16 关，补高频表达/易错点/文化提示/通关小测

全项目排查（N7）
- 原生 alert/confirm/prompt：53 处 → 0 处，统一改用 uiConfirm/uiAlert/uiPrompt
- 页面滑不动：新增修复 AI模拟面试、学途、好友申请、登录 4 页
- 正则 lookbehind：app.js 2 处清零（旧版 Android WebView 会整文件抛 SyntaxError）
- 悬空引用 0、图片 404 真实缺失 0、死链 0
- 修复 editorAiAssist 重复定义（api.js 覆盖 app.js 导致丢失本地兜底）
- 修复 quest.js 入口长期失效（4 页未引入，穿越英语按钮永远走降级跳转）
"""


def run(args, env=None):
    p = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def main():
    lines = []
    lines.append("=== 1. 分支与远端 ===")
    rc, out = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    lines.append("branch: " + out.strip())
    rc, out = run(["git", "remote", "get-url", "origin"])
    lines.append("origin: " + out.strip())
    rc, out = run(["git", "rev-parse", "--short", "HEAD"])
    lines.append("HEAD: " + out.strip())

    lines.append("\n=== 2. git add -u（已跟踪文件的改动） ===")
    rc, out = run(["git", "add", "-u"])
    lines.append("rc=%d %s" % (rc, out.strip()[:300]))

    lines.append("\n=== 3. 新增正式文件 ===")
    for f in NEW_FILES:
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            rc, out = run(["git", "add", "--", f])
            lines.append("  + %-52s rc=%d" % (f, rc))
        else:
            lines.append("  - %-52s (不存在，跳过)" % f)

    lines.append("\n=== 4. 暂存区统计 ===")
    rc, out = run(["git", "diff", "--cached", "--shortstat"])
    lines.append(out.strip())
    rc, out = run(["git", "diff", "--cached", "--name-status"])
    staged = [l for l in out.splitlines() if l.strip()]
    lines.append("staged files: %d" % len(staged))
    for l in staged[:60]:
        lines.append("   " + l)
    if len(staged) > 60:
        lines.append("   ... 其余 %d 个" % (len(staged) - 60))

    lines.append("\n=== 5. 安全校验：不应出现的临时产物 ===")
    bad = [l for l in staged if "_gq_orig" in l or "_rp_corrupt" in l
           or "/tools/_" in l or l.endswith(".tar.gz")]
    if bad:
        lines.append("!! 发现垃圾文件，已取消暂存：")
        for b in bad:
            lines.append("   " + b)
            run(["git", "reset", "-q", "HEAD", "--", b.split("\t")[-1]])
    else:
        lines.append("OK：无 _ 开头临时文件、无 tar.gz 部署包")

    lines.append("\n=== 6. commit ===")
    msgfile = os.path.join(ROOT, "tools", "_commit_msg.txt")
    with open(msgfile, "w", encoding="utf-8") as fh:
        fh.write(MSG)
    rc, out = run(["git", "commit", "-F", msgfile])
    lines.append("rc=%d" % rc)
    lines.append(out.strip()[:1500])

    lines.append("\n=== 7. push（走 127.0.0.1:7897 代理） ===")
    env = dict(os.environ)
    env["http_proxy"] = PROXY
    env["https_proxy"] = PROXY
    env["http_version"] = "HTTP/1.1"
    env["GIT_HTTP_VERSION"] = "HTTP/1.1"
    p = subprocess.run(
        ["git", "-c", "http.proxy=" + PROXY, "-c", "https.proxy=" + PROXY,
         "-c", "http.version=HTTP/1.1", "push", "origin", "main"],
        cwd=ROOT, capture_output=True, text=True,
        encoding="utf-8", errors="replace", env=env)
    lines.append("rc=%d" % p.returncode)
    lines.append(((p.stdout or "") + (p.stderr or "")).strip()[:2000])

    lines.append("\n=== 8. 推送后核对远端 ===")
    env2 = dict(os.environ)
    env2["http_proxy"] = PROXY
    env2["https_proxy"] = PROXY
    p2 = subprocess.run(
        ["git", "-c", "http.proxy=" + PROXY, "-c", "https.proxy=" + PROXY,
         "ls-remote", "origin", "refs/heads/main"],
        cwd=ROOT, capture_output=True, text=True,
        encoding="utf-8", errors="replace", env=env2)
    lines.append("remote main: " + ((p2.stdout or "") + (p2.stderr or "")).strip()[:300])
    rc, out = run(["git", "rev-parse", "--short", "HEAD"])
    lines.append("local  HEAD: " + out.strip())

    with open(LOG, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        with open(LOG, "w", encoding="utf-8") as fh:
            fh.write("EXCEPTION: %r\n\n%s" % (e, traceback.format_exc()))
