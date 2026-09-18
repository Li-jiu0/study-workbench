# -*- coding: utf-8 -*-
"""批次九 · Wave1收尾 + N9-25 补充包：白名单提交（绝不 git add -A）"""
import subprocess, io, os

ROOT = r'D:\下载的文件\学习工作台'
OUT = r'D:\下载的文件\学习工作台\tools\qa\_commit_out.txt'

MSG = """feat: 批次九 Wave1 收尾 + N9-25 截图反馈修复（20260915f）

- N9-23 每日一题卡改造：今日一题 + 答题框 + 已答进度 + 本地存档
- N9-11 四级阅读理解右栏空卡片修复（选词/匹配/浏览三题型同步）
- N9-16 联系管理员入口收窄到「好友」tab，未读角标镜像到 tab 标签
- N9-5 工具页内容填充；N9-6 更多页内容填充 + 三分组折叠 + 工具箱入口
- N9-25 首页各模块进度卡改列表显示；选修统计橙色空白修复；缺返回按钮补齐
- assets: app.js / api.js / cet-read.js 版本戳统一 bump 至 20260915f"""

# 白名单：37 个前端改动文件 + 4 份文档
FRONT = [
 'AI模拟面试.html','PPT案例拆解.html','PPT版式库.html','PPT素材库.html','PPT训练.html',
 'mock_exam.html','mock_exam_result.html','mock_exam_run.html','万能金句库.html','个人中心.html',
 '企业定向库.html','动态.html','商务礼仪.html','商务礼仪面试.html','四级备考.html',
 '四级经验分享.html','四级词汇.html','场景话术库.html','央国企笔试.html','好友申请.html',
 '学习博客.html','学习工作台.html','学途.html','工具.html','时政热点.html','更多.html',
 '申论刷题.html','私聊.html','管理员.html','行测刷题.html','设置.html','错题本.html',
 '面试题库.html','高情商表达.html',
 'assets/api.js','assets/app.js','assets/cet-read.js',
]
DOCS = [
 '任务执行文档-20260915-全线自主执行.md','交接文档-批次九-20260915.md',
 '架构-批次九-全线改造-波次计划-20260915.md',
 '需求文档-每日一题卡片改造-豆包-20260915.md',
 '需求文档-PPT案例拆解改进-豆包-20260915.md','需求文档-PPT版式库升级-豆包-20260915.md',
 '需求文档-PPT训练改进-综合-20260915.md','需求文档-万能金句库升级-豆包-20260915.md',
 '需求文档-写发帖页面改进-综合-20260915.md','需求文档-听力精听改进-综合-20260915.md',
 '需求文档-学习数据页面调整-20260915.md','需求文档-学习概括页面整合-20260915.md',
]

def git(args, check=True):
    p = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false'] + args, capture_output=True)
    b = p.stdout + p.stderr
    try: return p.returncode, b.decode('utf-8')
    except Exception: return p.returncode, b.decode('gbk', errors='replace')

L = []
missing = [f for f in FRONT + DOCS if not os.path.exists(os.path.join(ROOT, f))]
L.append('缺失文件: %s' % (missing if missing else '无'))

git(['reset'])  # 清空可能残留的暂存区（不碰工作区）
rc, out = git(['add', '--'] + FRONT + DOCS)
L.append('git add rc=%d' % rc)
rc, out = git(['diff', '--cached', '--stat'])
L.append('--- staged ---')
L.append(out)
rc, out = git(['commit', '-m', MSG])
L.append('git commit rc=%d' % rc)
L.append(out[-800:])
rc, out = git(['log', '--oneline', '-3'])
L.append('--- HEAD ---')
L.append(out)

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('COMMIT_DONE')
