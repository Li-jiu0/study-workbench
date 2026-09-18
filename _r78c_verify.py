# -*- coding: utf-8 -*-
"""R78 静态自测：HTML/JS 静态断言 + 备份/CRLF/ES2017/键名冲突检查。"""
import os
import re
import datetime

ROOT = r'D:\下载的文件\学习工作台'
BAK = '.bak-pre-r78-20260917'


def P(rel):
    return os.path.join(ROOT, rel)


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def crlf_ok(p):
    d = rb(p)
    return d.count(b'\r\n') == d.count(b'\n')


PASS = []
FAIL = []


def check(name, ok):
    (PASS if ok else FAIL).append(name)
    print(('PASS ' if ok else 'FAIL ') + name)


print('===== R78 静态自测 =====')

h = rb(P('动态空间.html')).decode('utf-8')
j = rb(P(r'assets\xt-moments.js')).decode('utf-8')

# 1. HTML 结构断言
check('A1 mo-entry / mo-entry-card 0 处', 'mo-entry' not in h)
check('A2 新列表按钮 1 处 (class="xtm-listrow" + 我的动态)', h.count('class="xtm-listrow"') == 1 and h.count('<div class="xtm-listrow-t">我的动态</div>') == 1)
check('A3 列表按钮 href=我的动态.html', 'href="我的动态.html"' in h)
check('A4 换背景入口 1 处 (id=xtmBgBtn)', h.count('id="xtmBgBtn"') == 1)
check('A5 恢复默认 1 处 (id=xtmBgReset, title/aria 含 恢复默认)', h.count('id="xtmBgReset"') == 1 and h.count('恢复默认') == 1)
check('A6 键名一致 (HTML 注释 1 处 + JS 2 处)', h.count('study_workbench_moments_bg') == 1 and j.count('study_workbench_moments_bg') == 2)
check('A7 hero 结构完整 (xtmHero/xtmHeroMask/xtmBgFile/xtmMineRow)', all(k in h for k in ['id="xtmHero"', 'id="xtmHeroMask"', 'id="xtmBgFile"', 'id="xtmMineRow"']))
check('A8 无死链回归 (动态.html/朋友圈.html 0 命中，我的动态.html 存活除外)',
      h.count('动态.html') == h.count('我的动态.html') and h.count('朋友圈.html') == 0)
check('A9 data-xtm=feed 结构未动', 'data-xtm="feed"' in h)

# 2. JS 断言
check('B1 heroInit 接线 initFeedPage', "heroInit(); /* R78" in j)
check('B2 heroApply 定义 1 + 调用 4 = 5 处', j.count('heroApply') == 5)
print('    heroApply 出现次数: %d' % j.count('heroApply'))
print('    heroInit 出现次数: %d' % j.count('heroInit'))
check('B3 2MB 上限检查存在', 'BG_MAX_BYTES' in j and 'f.size > BG_MAX_BYTES' in j)
check('B4 FileReader dataURL 存在', 'readAsDataURL' in j)
check('B5 禁 alert/confirm/prompt 未新增', j.count('alert(') == 0 and 'prompt(' not in j)

# 3. ES2017 禁用语法扫描（活代码：本任务新增段）
seg = j[j.find('R78：页顶背景自定义（动态空间信息流页）') - 10:j.find('对外接口')]
es_bad = re.findall(r'\?\.|\?\?|\.\.\.|replaceAll\(|\.at\(|\*\*(?!=)|\bclamp\(', seg)
check('B6 新增 JS 段 ES2017 违规 0', not es_bad)

# 4. CSS 活代码 clamp/min/max（新 style 块）
m = re.search(r'<style>(.*?)</style>', h, re.S)
css = m.group(1) if m else ''
check('A10 CSS 无 clamp()/min()/max()', not re.search(r'clamp\(|\bmin\(|\bmax\(', css))

# 5. CRLF + 备份
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    check('C CRLF bareLF=0: ' + f, crlf_ok(P(f)))
    check('C 备份存在: ' + f + BAK, os.path.exists(P(f) + BAK))

# 6. 键名冲突全树扫描（活文件）
hits = []
for base, sub in [(ROOT, ''), (P('assets'), 'assets/')]:
    for fn in os.listdir(base):
        fp = os.path.join(base, fn)
        if not os.path.isfile(fp) or '.bak' in fn:
            continue
        if fn.endswith(('.html', '.js', '.css')):
            try:
                if 'study_workbench_moments_bg' in open(fp, 'rb').read().decode('utf-8', 'ignore'):
                    hits.append(sub + fn)
            except Exception:
                pass
print('    study_workbench_moments_bg 命中: %r' % hits)
check('D 键名全树只在 动态空间.html + assets/xt-moments.js 命中', set(hits) == {'动态空间.html', 'assets/xt-moments.js'})

print()
print('===== mtime =====')
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(P(f))).strftime('%Y-%m-%d %H:%M:%S')
    print('  %-24s %s' % (f, mt))

print()
print('RESULT: %d PASS / %d FAIL' % (len(PASS), len(FAIL)))
if FAIL:
    print('FAILED: %r' % FAIL)
