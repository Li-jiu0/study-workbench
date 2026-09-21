# -*- coding: utf-8 -*-
"""工具页倒计时热修：线上直连复检 + 单文件白名单提交"""
import io, os, subprocess, urllib.request, urllib.parse

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_hotfix1_out.txt')
L = []

op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
op.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')]
try:
    b = op.open('http://110.42.134.62/' + urllib.parse.quote('工具.html'), timeout=25).read().decode('utf-8', 'replace')
    L.append('线上 HTTP 200, %d chars' % len(b))
    L.append('  「考试倒计时」可见区块 = %s' % ('nav-section">考试倒计时' in b))
    L.append('  countdown-row 宿主 = %s' % ('class="countdown-row"' in b))
    L.append('  renderToolsCountdowns 函数 = %s' % ('renderToolsCountdowns' in b))
    L.append('  #countdownModal 保留 = %s' % ('id="countdownModal"' in b))
    L.append('  app.js 引用仍在 = %s' % ("assets/app.js?v=20260915f" in b))
except Exception as e:
    L.append('线上拉取失败: %s' % e)

def git(a):
    p = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false'] + a, capture_output=True)
    try: return p.returncode, p.stdout.decode('utf-8')
    except Exception: return p.returncode, p.stdout.decode('gbk', errors='replace')

MSG = """fix: 工具页移除「考试倒计时」区块（用户截图反馈）

- 删除 nav-section 标题 + #countdownRow 宿主，及专属的 renderToolsCountdowns 渲染逻辑
- 保留 #countdownModal（app.js 顶层无守卫监听，删了会中断脚本）
- 首页「重要倒计时」不受影响；无任何版本戳变更（HTML 无缓存后缀）"""
git(['reset'])
rc, o = git(['add', '--', '工具.html'])
L.append('add rc=%d' % rc)
rc, o = git(['commit', '-m', MSG])
L.append('commit rc=%d' % rc)
L.append(o[-400:])
rc, o = git(['log', '--oneline', '-2'])
L.append(o)

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('VERIFY_COMMIT_DONE')
