# -*- coding: utf-8 -*-
"""r89_qa_final.py —— 收尾静态核查（占位符 / 备份比对 / 未授权改动 / 版本号）"""
import os, re, glob

BASE = r'D:\下载的文件\学习工作台'
OUT = []
def P(*a):
    s = ' '.join(str(x) for x in a); OUT.append(s)

def raw(rel):
    p = os.path.join(BASE, rel.replace('/', os.sep))
    return open(p, 'rb').read() if os.path.exists(p) else None

def rd(rel):
    b = raw(rel)
    return b.decode('utf-8', errors='replace') if b else None

TARGETS = ['私聊.html', 'assets/xt-profile.js', 'assets/xt-profile.css', '地区选择.html',
           'assets/xt-region.js', 'assets/xt-moments.js', '更新.html', '更多.html',
           '朋友圈发布.html', 'assets/common.css']

P('=' * 70); P('R89 收尾静态核查'); P('=' * 70)

P('\n### 1. 占位符 / TODO / 未完成标记扫描')
PATS = [r'TODO', r'FIXME', r'XXX', r'待补', r'占位', r'PLACEHOLDER', r'__TBD__', r'未实现', r'此处省略']
for f in TARGETS:
    t = rd(f)
    if t is None:
        P('  %-26s MISSING' % f); continue
    hits = []
    for i, l in enumerate(t.split('\n'), 1):
        for p in PATS:
            if re.search(p, l):
                hits.append((i, p, l.strip()[:110])); break
    P('  %-26s 命中=%d' % (f, len(hits)))
    for h in hits[:8]:
        P('      L%-5d [%s] %s' % h)

P('\n### 2. 与最近备份比对（改动文件）')
for f in ['私聊.html', 'assets/xt-profile.js', 'assets/xt-profile.css', '地区选择.html',
          'assets/xt-region.js', 'assets/xt-moments.js', '更新.html']:
    pat = os.path.join(BASE, f.replace('/', os.sep) + '.bak*')
    baks = sorted(glob.glob(pat))
    cur = raw(f)
    P('  %-26s 当前=%-7d 备份=%s' % (f, len(cur) if cur else -1,
                                     [os.path.basename(b) + '(' + str(os.path.getsize(b)) + ')' for b in baks[-3:]] if baks else 'NONE'))
    for b in baks[-1:]:
        bb = open(b, 'rb').read()
        same = bb == cur
        P('      与 %s 逐字节相同: %s' % (os.path.basename(b), same))
        if not same and cur:
            # 用文本模式找差异行数
            a = bb.decode('utf-8', 'replace').split('\n')
            c = cur.decode('utf-8', 'replace').split('\n')
            diff = sum(1 for i in range(max(len(a), len(c))) if (a[i] if i < len(a) else None) != (c[i] if i < len(c) else None))
            P('      差异行数 = %d（期望 >0，证明确有改动）' % diff)

P('\n### 3. 未授权改动：全库近期（9/18 之后）被改的文件')
import time
CUT = time.mktime(time.strptime('2026-09-18', '%Y-%m-%d'))
recent = []
for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '__pycache__', 'tools')]
    for f in files:
        if f.endswith(('.bak', '.backup')) or '.bak-' in f or '.backup_' in f or '~' in f:
            continue
        fp = os.path.join(root, f)
        try:
            mt = os.path.getmtime(fp)
        except Exception:
            continue
        if mt >= CUT:
            recent.append((os.path.relpath(fp, BASE), time.strftime('%m-%d %H:%M', time.localtime(mt)), os.path.getsize(fp)))
recent.sort()
P('  近期改动文件数 =', len(recent))
for r in recent:
    P('      %-42s %s  %d' % r)

P('\n### 4. common.css 最终复核')
cc = raw('assets/common.css')
P('  字节 =', len(cc), '(期望 127605)', 'OK' if len(cc) == 127605 else '*** P0 ***')
ccl = cc.decode('utf-8', 'replace').split('\n')
P('  L68 =', repr(ccl[67].strip()))
P('  L68 与期望一致:', ccl[67].strip() == 'html, body { height: 100%; overflow: hidden; }')

P('\n### 5. 版本号一致性（query string）')
for f in ['私聊.html', '地区选择.html', '更新.html', '个人资料.html', '朋友圈发布.html']:
    t = rd(f)
    if t is None: continue
    vs = sorted(set(re.findall(r'\?v=([0-9A-Za-z]+)', t)))
    P('  %-20s v=%s' % (f, vs))

P('\n### 6. 改动文件是否仍引用 common.css（未被误删）')
for f in ['私聊.html', '地区选择.html', '更新.html']:
    t = rd(f)
    P('  %-20s common.css 引用=%d' % (f, t.count('common.css')))

P('\n### 7. 关键字残留：旧误导文案（全批）')
OLD = '暂无本机 AI 对话记录。在 AI 问答页对话后会自动出现在这里。'
for f in TARGETS + ['个人资料.html', 'AI.html']:
    t = rd(f)
    if t is None: continue
    n = t.count(OLD)
    if n:
        P('  %-26s 旧原文命中=%d  *** 需关注 ***' % (f, n))
P('  （无输出 = 全批已无旧误导原文）')

open(os.path.join(BASE, 'tools', 'qa', 'r89_qa_final_out.txt'), 'w', encoding='utf-8').write('\n'.join(OUT))
print('\n'.join(OUT))
