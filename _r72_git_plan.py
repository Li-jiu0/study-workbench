# -*- coding: utf-8 -*-
# 只读：查看 git 状态与 HEAD，为 R72 提交做规划（不执行任何写操作）
import subprocess, os

T = r'D:\下载的文件\学习工作台'
out = []

def git(*args):
    r = subprocess.run(['git', '-c', 'core.quotepath=false'] + list(args),
                       cwd=T, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
    return r.returncode, (r.stdout or ''), (r.stderr or '')

rc, so, se = git('rev-parse', '--abbrev-ref', 'HEAD')
out.append('branch: %s (rc=%d) %s' % (so.strip(), rc, se.strip()[:200]))
rc, so, se = git('log', '--oneline', '-3')
out.append('HEAD log:\n%s' % so.strip())
rc, so, se = git('status', '--short')
lines = [l for l in so.splitlines() if l.strip()]
out.append('status lines: %d' % len(lines))
# 分类统计
import collections
c = collections.Counter(l[:2].strip() or '??' for l in lines)
out.append('status kinds: %s' % dict(c))
# 只看本批关心的路径
interest = ['我的文件.html', '导入题库.html', '演示.html', '个人中心.html', '更多.html', '关于.html', '学习工作台.html', '登录.html',
            'assets/app.js', 'assets/api.js', 'assets/chat-local.js', 'assets/importer.js', 'assets/notify.js',
            'assets/ai-service.js', 'assets/ai-settings.js', 'ai-settings.html',
            'server/database.py', 'server/schemas.py', 'server/routers/chat.py', 'server/routers/friends.py',
            'server/routers/groups.py', 'server/建表SQL.sql',
            'android/AndroidManifest.xml', 'android/java/com/study/workbench/MainActivity.java', 'android/make_icon.py',
            'android/res/drawable/ic_launcher.png', '学习工作台-安卓App.apk', '用户需求与决策总账.md']
out.append('--- 本批关心路径的状态 ---')
sl = {}
for l in lines:
    sl[l[3:].strip()] = l[:2].strip()
for p in interest:
    out.append('  %-52s %s' % (p, sl.get(p, 'CLEAN/未列出')))
# APK 是否被跟踪
rc, so, se = git('ls-files', '--error-unmatch', '学习工作台-安卓App.apk')
out.append('APK tracked: %s (rc=%d)' % ('YES' if rc == 0 else 'NO', rc))
# 凭据自查
rc, so, se = git('ls-files')
bad = [x for x in so.splitlines() if ('data.db' in x or x.endswith('.env') or 'node_modules/' in x or x.endswith('.tar.gz'))]
out.append('凭据/垃圾自查命中: %s' % (bad[:10] if bad else 'NONE'))

open(os.path.join(T, '_r72_git_plan.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
