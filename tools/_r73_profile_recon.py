# -*- coding: utf-8 -*-
"""个人资料页重做前置侦察：真实页面清单 + 需求所列功能的真实落点"""
import os, re, json

ROOT = r'D:\下载的文件\学习工作台'
out = []
def log(s=''):
    out.append(str(s))

# ---------- 1) 根目录真实页面清单 ----------
pages = sorted([f for f in os.listdir(ROOT)
                if f.endswith('.html') and '.bak' not in f and not f.startswith('_')])
log('== 根目录真实 .html 页面（%d 个）==' % len(pages))
for i, p in enumerate(pages):
    sz = os.path.getsize(os.path.join(ROOT, p))
    log('  %2d. %-28s %8d B' % (i + 1, p, sz))
log('')

# ---------- 2) app.js 的页面路由表 / 导航注册 ----------
appjs = os.path.join(ROOT, 'assets', 'app.js')
t = open(appjs, 'rb').read().decode('utf-8', 'ignore')
log('== app.js 内 .html 引用（去重）==')
refs = sorted(set(re.findall(r"['\"]([^'\"]{1,30}\.html)['\"]", t)))
for r in refs:
    exists = os.path.exists(os.path.join(ROOT, r))
    log('  [%s] %s' % ('OK  ' if exists else 'NOPE', r))
log('')

# ---------- 3) 用户所列功能项 → 候选真实页面 ----------
log('== 用户所列功能项 → 候选真实页（在各页 grep 关键词）==')
WANT = ['学习记录', '错题本', '我的笔记', '我的收藏', '学习数据', '成就徽章',
        '作品集', '导入题库', 'AI对话记录', '模型设置', '设置', '关于']
files = [p for p in pages]
files.append(os.path.join('assets', 'app.js'))
files.append(os.path.join('assets', 'api.js'))
files.append(os.path.join('assets', 'xt-profile.js'))
files.append(os.path.join('assets', 'xt-settings.js'))
for w in WANT:
    hits = []
    for rel in files:
        fp = os.path.join(ROOT, rel)
        if not os.path.exists(fp):
            continue
        s = open(fp, 'rb').read().decode('utf-8', 'ignore')
        if w in s:
            n = s.count(w)
            # 顺便抓同行的 href / location
            hrefs = set()
            for m in re.finditer(re.escape(w) + r'.{0,200}', s):
                for h in re.findall(r"['\"]([^'\"]{1,28}\.html)", m.group(0)):
                    hrefs.add(h)
            hits.append('%s(x%d)%s' % (rel, n, ('→' + ','.join(sorted(hrefs))) if hrefs else ''))
    log('  %-12s %s' % (w, ' | '.join(hits[:5]) if hits else '**全站无命中**'))
log('')

# ---------- 4) 个人中心.html 现有入口（找可复用的真实跳转）----------
fp = os.path.join(ROOT, '个人中心.html')
s = open(fp, 'rb').read().decode('utf-8', 'ignore')
log('== 个人中心.html 内全部 .html 跳转 ==')
for h in sorted(set(re.findall(r"['\"]([^'\"]{1,30}\.html)", s))):
    log('  [%s] %s' % ('OK  ' if os.path.exists(os.path.join(ROOT, h)) else 'NOPE', h))
log('')

# ---------- 5) localStorage 键清单（供角标真实数据用）----------
log('== 现有 localStorage 键（xt-profile.js + app.js 内）==')
keys = set()
for rel in ['assets/xt-profile.js', 'assets/app.js', 'assets/api.js', 'assets/study-stats.js', 'assets/quest.js']:
    fp2 = os.path.join(ROOT, rel)
    if not os.path.exists(fp2):
        continue
    s2 = open(fp2, 'rb').read().decode('utf-8', 'ignore')
    for k in re.findall(r"localStorage\.(?:getItem|setItem)\(\s*['\"]([^'\"]{2,50})['\"]", s2):
        keys.add(k)
    for k in re.findall(r"LS_(?:KEY|K)\s*=\s*['\"]([^'\"]{2,50})['\"]", s2):
        keys.add(k)
for k in sorted(keys):
    log('  ' + k)

open(os.path.join(ROOT, 'tools', '_r73_profile_recon.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE tools/_r73_profile_recon.txt')
