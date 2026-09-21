# -*- coding: utf-8 -*-
"""两处补充侦察：
① api.js 里 动态.html 的上下文（决定转派给谁）
② 「查看其他用户个人资料」的真实渲染面（?user= / imShowUserProfile / renderProfilePage）
③ 个人中心.html 「我的动态」入口卡的精确结构（供删改）
"""
import os, re

ROOT = r'D:\下载的文件\学习工作台'
out = []
def log(s=''):
    out.append(str(s))

def rd(rel):
    return open(os.path.join(ROOT, rel), 'rb').read().decode('utf-8', 'ignore')

# ---------- 1) api.js 内 动态.html ----------
t = rd('assets/api.js')
log('== 1) api.js 内「动态」上下文 ==')
for m in re.finditer(r'动态\.html', t):
    ln = t.count('\n', 0, m.start()) + 1
    seg = t[max(0, m.start() - 260): m.start() + 160].replace('\r', '')
    log('  :%d  %s' % (ln, seg.replace('\n', ' / ')[:400]))
log('')

# ---------- 2) 其他用户资料：?user= 消费点 ----------
log('== 2) 「?user=」参数消费点（他人视角资料）==')
for rel in ['assets/app.js', 'assets/api.js', '个人中心.html', '个人资料.html', 'assets/xt-profile.js']:
    fp = os.path.join(ROOT, rel)
    if not os.path.exists(fp):
        continue
    t2 = rd(rel)
    n = len(re.findall(r'[\?\&]user\s*=|searchParams\.get\([\'"]user|viewUid', t2))
    log('  %-22s 命中=%d' % (rel, n))
    for m in re.finditer(r'viewUid|getParameterByName\([\'"]user|searchParams\.get\([\'"]user[\'"]\)|location\.search', t2):
        ln = t2.count('\n', 0, m.start()) + 1
        seg = t2[max(0, m.start() - 120): m.start() + 200].replace('\r', '')
        log('     :%d %s' % (ln, seg.replace('\n', ' / ')[:280]))
log('')

# ---------- 3) chat-local.js 的 imShowUserProfile ----------
t = rd('assets/chat-local.js')
log('== 3) chat-local.js imShowUserProfile / UserProfile ==')
for pat in ['imShowUserProfile', 'UserProfile']:
    for m in list(re.finditer(pat, t))[:8]:
        ln = t.count('\n', 0, m.start()) + 1
        seg = t[max(0, m.start() - 90): m.start() + 130].replace('\r', '')
        log('  [%s] :%d %s' % (pat, ln, seg.replace('\n', ' / ')[:200]))
log('')

# ---------- 4) 个人中心.html「我的动态」入口卡（:159 附近结构）----------
t = rd('个人中心.html')
lines = t.split('\n')
log('== 4) 个人中心.html :150-170（我的动态入口卡）==')
for i in range(148, min(len(lines), 172)):
    log('  %d: %s' % (i + 1, lines[i][:220]))
log('')
log('== 5) 个人中心.html :315-330（moments 子页卡）==')
for i in range(314, min(len(lines), 332)):
    log('  %d: %s' % (i + 1, lines[i][:220]))
log('')
log('== 6) 个人中心.html 内 SubpageRouter.navigate 调用清单 ==')
for m in re.finditer(r"SubpageRouter\.navigate\(['\"]([^'\"]+)['\"]\)", t):
    ln = t.count('\n', 0, m.start()) + 1
    log('  :%d  navigate(%s)' % (ln, m.group(1)))

open(os.path.join(ROOT, 'tools', '_r73_recon3.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE tools/_r73_recon3.txt')
