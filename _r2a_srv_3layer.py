# -*- coding: utf-8 -*-
"""R2A 后端三层差异预检：把生产上待覆盖的 server 文件下载到本地临时目录，
做 ① 类/函数/路由清单 ② 忽略空白后的实质代码行集合 ③ Pydantic 字段/模型列 三层比对。
判据：本地必须是「生产版 + 本次改动」的超集；若生产有本地缺的符号 → 停下，以生产为基线。
"""
import os, re, io, subprocess, json, sys

ROOT = r'D:\下载的文件\学习工作台'
WT = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3'
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
TMP = os.path.join(WT, '_r2a_prod_srv')
OUT = os.path.join(WT, '_r2a_srv_3layer.txt')

src = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
pwd, host = m.group(1), m.group(2)

FILES = ['routers/ai.py', 'routers/geo.py', 'routers/liveloc.py',
         'data/model_registry.json', 'data/model_quota.json']
os.makedirs(TMP, exist_ok=True)
for rel in FILES:
    local = os.path.join(TMP, rel.replace('/', '__'))
    r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                        'root@%s:/opt/study-workbench/server/%s' % (host, rel), local],
                       capture_output=True, text=True, timeout=300, errors='replace')
    print('down %-26s exit=%d %s' % (rel, r.returncode, (r.stderr or '')[-120:].strip()))


def syms(t, ext):
    out = set()
    if ext == '.py':
        out |= set(re.findall(r'^\s*class\s+(\w+)', t, re.M))
        out |= set(re.findall(r'^\s*(?:async\s+)?def\s+(\w+)', t, re.M))
        out |= set(re.findall(r'@router\.\w+\("([^"]+)"', t))
        out |= set(re.findall(r'^\s*(\w+)\s*:\s*(?:str|int|bool|float|list|dict|None)', t, re.M))
    else:
        try:
            j = json.loads(t)
            if isinstance(j, dict):
                out |= set(j.keys())
        except Exception:
            pass
    return out


def normlines(t):
    out = set()
    for l in t.split('\n'):
        s = re.sub(r'\s+', '', l).strip()
        if s and not s.startswith('#'):
            out.add(s)
    return out


rep = []
for rel in FILES:
    lp = os.path.join(ROOT, 'server', rel)
    pp = os.path.join(TMP, rel.replace('/', '__'))
    if not (os.path.isfile(lp) and os.path.isfile(pp)):
        rep.append('%-26s 缺文件 local=%s prod=%s' % (rel, os.path.isfile(lp), os.path.isfile(pp)))
        continue
    lt = io.open(lp, encoding='utf-8', errors='replace').read()
    pt = io.open(pp, encoding='utf-8', errors='replace').read()
    ext = os.path.splitext(rel)[1]
    ls, ps = syms(lt, ext), syms(pt, ext)
    missing = sorted(ps - ls)          # 生产有、本地缺 → 危险
    added = sorted(ls - ps)            # 本地新增 → 本次改动
    ln, pn = normlines(lt), normlines(pt)
    lost = sorted(pn - ln)             # 生产实质行、本地缺 → 危险
    rep.append('==== %s' % rel)
    rep.append('   符号: 生产 %d / 本地 %d' % (len(ps), len(ls)))
    rep.append('   本地新增符号(%d): %s' % (len(added), added[:14]))
    rep.append('   ★生产独有符号(%d): %s' % (len(missing), missing[:14]))
    rep.append('   实质行: 生产 %d / 本地 %d' % (len(pn), len(ln)))
    rep.append('   ★生产独有实质行(%d): %s' % (len(lost), [x[:70] for x in lost[:6]]))
    rep.append('   判定: %s' % ('危险·需以生产为基线' if (missing or lost) else '安全·本地=生产+改动'))
    rep.append('')

txt = '\n'.join(rep)
io.open(OUT, 'w', encoding='utf-8').write(txt + '\n')
print(txt)
