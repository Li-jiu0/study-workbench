# -*- coding: utf-8 -*-
"""批次九 · Wave2 四线交付 + 热修3/4：白名单提交（绝不 git add -A）"""
import subprocess, io, os

ROOT = r'D:\下载的文件\学习工作台'
OUT = r'D:\下载的文件\学习工作台\tools\qa\_commit_g_out.txt'

MSG = """feat: 批次九 Wave2 四线交付 + 更多页收放撤除（20260915g）

- N9-19 AI模拟面试页重构（题目卡/展开块/报告区）
- N9-17 私聊消息撤回改微信式长按菜单
- N9-18 听力精听 P0（两级场景分类/大卡/开关/进度条）
- N9-14 PPT训练双线（四原则增强 + 技巧提升案例集）+ 顶栏去橙
- blog_wechat 版本戳修正 9 处（畸形戳清零）
- 热修3：更多页分组收放按用户反馈撤除，恢复直接平铺
- 热修4：更多页「内容直达」仅保留学习动态，删时政热点/企业定向库/PPT素材库/PPT案例拆解 4 张入口卡（页面文件保留）
- 波末统一 bump：6 个改动资产 ?v=20260915g（7 处引用）"""

# 白名单：14 个前端改动文件 + 1 份文档（api.js/AI.html/ai-*.js 等 AI 线在途文件一律不进）
FRONT = [
 'AI模拟面试.html','PPT训练.html','私聊.html','工具.html','blog_wechat.html',
 '四级备考.html','学途.html','更多.html',
 'assets/chat-local.js','assets/voiceplayer.js',
 'assets/data-ppt-class.js','assets/design-class.js',
 'assets/data-ppt-tips.js','assets/ppt-tips.js',
]
DOCS = [
 '任务执行文档-20260915-全线自主执行.md',
]

def git(args):
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
