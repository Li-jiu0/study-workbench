# -*- coding: utf-8 -*-
"""R72 后端 · 阶段A 三层差异预检（本地 D: vs 服务器下载件）。结果写文件。"""
import os, re

ROOT = r'D:\下载的文件\学习工作台'
TMP = r'C:\Users\ATM\AppData\Local\Temp\r72_precheck'
OUT = os.path.join(ROOT, 'tools', 'r72_engineer', 'stage_a_diff.txt')

PAIRS = [
    ('database.py', 'srv_database.py', 'database.py'),
    ('schemas.py', 'srv_schemas.py', 'schemas.py'),
    ('routers/chat.py', 'srv_chat.py', 'routers/chat.py'),
    ('routers/friends.py', 'srv_friends.py', 'routers/friends.py'),
    ('routers/groups.py', 'srv_groups.py', 'routers/groups.py'),
]

LOCAL = os.path.join(ROOT, 'server')

L = []
def w(s=''):
    L.append(str(s))

def read(p):
    return open(p, 'rb').read().decode('utf-8', 'ignore')

def norm_lines(txt):
    out = set()
    for ln in txt.splitlines():
        s = ln.strip()
        if s:
            out.add(s)
    return out

def code_lines(txt):
    """去空白、去整行注释后的实质代码行集合。"""
    out = set()
    for ln in txt.splitlines():
        s = ln.strip()
        if not s or s.startswith('#'):
            continue
        out.add(s)
    return out

def syms(txt):
    classes = set(re.findall(r'^\s*class\s+(\w+)', txt, re.M))
    funcs = set(re.findall(r'^\s*(?:async\s+)?def\s+(\w+)', txt, re.M))
    routes = set('%s %s' % (m.group(1), m.group(2))
                 for m in re.finditer(r'@router\.(get|post|put|delete|patch)\(\s*["\']([^"\']+)["\']', txt))
    return classes, funcs, routes

def py_fields(txt):
    return set(re.findall(r'^\s{4}([A-Za-z_]\w*)\s*:\s*\S', txt, re.M))

def model_cols(txt):
    return set(re.findall(r'^\s{4}([A-Za-z_]\w*)\s*=\s*(?:Column|relationship)\s*\(', txt, re.M))

for relpath, srvname, label in PAIRS:
    lp = os.path.join(LOCAL, relpath.replace('/', os.sep))
    sp = os.path.join(TMP, srvname)
    lt, st = read(lp), read(sp)
    w('==================================================')
    w('FILE %s' % relpath)
    w('  local bytes=%d lines=%d | server bytes=%d lines=%d' %
      (os.path.getsize(lp), lt.count('\n'), os.path.getsize(sp), st.count('\n')))

    # ① 符号清单
    lc, lf, lr = syms(lt)
    sc, sf, sr = syms(st)
    w('  ① 符号清单')
    w('    class  server-local = %s' % sorted(sc - lc))
    w('    def    server-local = %s' % sorted(sf - lf))
    w('    route  server-local = %s' % sorted(sr - lr))
    w('    route  local-server = %s' % sorted(lr - sr))

    # ② 实质代码行集合
    lset, sset = code_lines(lt), code_lines(st)
    only_srv = sset - lset
    only_loc = lset - sset
    w('  ② 实质代码行（去空白/去整行注释）')
    w('    server-only 行数 = %d  （必须 0）' % len(only_srv))
    for x in sorted(only_srv)[:40]:
        w('      [S] ' + x)
    w('    local-only  行数 = %d  （应为本批 R72 补丁）' % len(only_loc))
    for x in sorted(only_loc)[:60]:
        w('      [L] ' + x)

    # ③ 字段级
    if 'schemas.py' in relpath:
        lpf, spf = py_fields(lt), py_fields(st)
        w('  ③ Pydantic 字段  server-local = %s' % sorted(spf - lpf))
        w('     Pydantic 字段  local-server = %s' % sorted(lpf - spf))
    if 'database.py' in relpath:
        lmc, smc = model_cols(lt), model_cols(st)
        w('  ③ 模型列/关系  server-local = %s' % sorted(smc - lmc))
        w('     模型列/关系  local-server = %s' % sorted(lmc - smc))
    w('')

open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('WROTE', OUT)
