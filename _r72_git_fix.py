# -*- coding: utf-8 -*-
# 补提交 assets/app.js + 核实 APK 索引状态
import subprocess, os

T = r'D:\下载的文件\学习工作台'

def git(*args):
    r = subprocess.run(['git', '-c', 'core.quotepath=false'] + list(args), cwd=T,
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    return r.returncode, (r.stdout or ''), (r.stderr or '')

out = []
rc, so, se = git('ls-files')
apk = [x for x in so.splitlines() if x.lower().endswith('.apk')]
out.append('ls-files 中 .apk 后缀文件: %s' % (apk if apk else 'NONE'))
apk2 = [x for x in so.splitlines() if 'apk' in x.lower()]
out.append('ls-files 中含 apk 字样的文件: %s' % (apk2 if apk2 else 'NONE'))

# 补 add app.js（大文件，单独 add 无阈值限制）
p = os.path.join(T, 'assets', 'app.js')
out.append('app.js size=%d' % os.path.getsize(p))
rc, so, se = git('add', '--', 'assets/app.js')
out.append('git add assets/app.js rc=%d %s' % (rc, (se or '').strip()[:200]))
rc, so, se = git('commit', '-m', 'feat(R72): 补入 assets/app.js（7.08MB，前次按体积阈值被跳过）')
out.append('commit rc=%d %s' % (rc, (so or se or '').strip()[:300]))
rc, so, se = git('log', '--oneline', '-3')
out.append('git log:\n%s' % so.strip())
rc, so, se = git('show', '--stat', '--oneline', 'HEAD')
out.append('HEAD stat:\n%s' % so.strip()[:600])
# 确认 app.js 已在版本库
rc, so, se = git('cat-file', '-s', 'HEAD:assets/app.js')
out.append('HEAD:assets/app.js size=%s (rc=%d)' % (so.strip(), rc))
# 工作区是否还有未提交的本批相关改动
rc, so, se = git('status', '--short', '--', 'assets', 'server', 'android')
interesting = [l for l in so.splitlines() if l.strip() and 'bak' not in l]
out.append('assets/server/android 剩余未提交: %s' % (interesting[:15] if interesting else 'NONE'))

open(os.path.join(T, '_r72_git_fix_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
