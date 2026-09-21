# -*- coding: utf-8 -*-
# R73b git 步骤2：暂存 + 提交（排除临时文件/APK）
import subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"

def run(args):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True)
    return p.returncode, p.stdout.decode('utf-8','replace'), p.stderr.decode('utf-8','replace')

# 1) 所有已跟踪文件的修改与删除
rc, out, err = run(["add", "-u"])
print("add -u rc=%d %s" % (rc, err.strip()[:500]))

# 2) 新增生产文件（页面 / assets / server / android / 文档 / 收款码）
new_files = [
    "动态空间.html", "我的动态.html", "朋友圈发布.html", "个人资料.html", "赞助.html",
    "assets/ai-presets.js", "assets/net-compat.js", "assets/xt-android.js",
    "assets/xt-moments.css", "assets/xt-moments.js", "assets/xt-polyfill.js",
    "assets/xt-profile.css", "assets/xt-profile.js", "assets/xt-settings.js",
    "assets/赞助收款码.jpg",
    "android/java/com/study/workbench/MsgPollService.java",
    "server/mailer.py", "server/scripts/smoke_r72_chat.py",
    "赞助收款码.jpg",
    "AI模型测试报告与修复需求-20260916.md", "Gemini连接问题排查与处理方案.md",
    "海外免费模型接入文档-20260916.md", "交互文档-N9-19-模拟面试六阶段状态机-20260916.md",
    "问AI页面开发文档.md", "需求20-移动端适配规格与验收标准-20260917.md",
    "需求文档-AI模型与设置页面.txt", "需求文档-AI模型接入与模型设置页-豆包-20260916.md",
    "需求文档-全站AI功能升级-20260915.md", "需求文档-各平台模型状态更新.md",
    "需求文档-导入题库-豆包-20260916.md", "需求文档-火山方舟新增模型.md",
    "火山方舟新增模型核对清单.md", "火山方舟模型ID修复说明.md",
    "交接文档-20260916-全站修复收口与APK.md", "交接文档-20260916b-第二批需求执行手册.md",
    "交接文档-20260916c-第二批执行现状与对接.md", "交接文档-20260916d-第三批执行现状与对接.md",
    "交接文档-20260916e-第三批续作与对接.md", "交接文档-20260917g-第五批执行现状与对接.md",
    "交接文档-Wave2收口-20260915.md",
    "更新日志-20260916-第三批.md", "更新日志-20260916-第三批续作.md",
    "更新日志-20260916-第二批.md", "更新日志-20260917-第五批-R73.md",
    "给接手AI的开场指令-20260916.txt", "给接手AI的开场指令-20260916d.txt",
    "给接手AI的开场指令-20260916e.txt", "给接手AI的开场指令-20260917g.txt",
    "任务清单-待办总览-20260915.md", "作战图-20260916-第三批续作-任务分配.md",
    "计划书-20260916-第三批执行（分工与波次）.md", "计划书-20260916-第二批执行（已归档）.md",
    "波末收口报告-20260916-第三批续作.md",
    "交付报告-A1-ai-service-需求D复核-20260916.md", "交付报告-A3-cet-read布局验证-20260916.md",
    "交付报告-A5-ppt-tips完成度复核-20260916.md", "交付报告-A6-错题本AI验证-20260916.md",
    "交付报告-A7-个人中心作品集验证-20260916.md", "交付报告-A8-学习概括与notify接线-20260916.md",
    "交付报告-B1-听力精听改版-20260916.md", "交付报告-B2-PPT版式库升级-20260916.md",
    "交付报告-B3-申论批改AI接线-20260916.md", "交付报告-B4-我的文章布局-20260916.md",
    "交付报告-B5-PPT训练剩余部分-20260916.md",
]
rc, out, err = run(["add", "--"] + new_files)
print("add new rc=%d %s" % (rc, err.strip()[:800]))

# 3) 检查暂存区里是否混入 APK / 临时文件
rc, out, err = run(["diff", "--cached", "--name-only"])
staged = out.splitlines()
print("staged count:", len(staged))
bad = [f for f in staged if f.endswith('.apk') or f.startswith('_') or '/_' in f or '.tar.gz' in f or f.endswith('.db') or f.startswith('.tmp')]
print("suspicious staged:", bad if bad else "(none)")
apks = [f for f in staged if f.endswith('.apk')]
print("apk staged:", apks if apks else "(none) ✓")
