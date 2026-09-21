# -*- coding: utf-8 -*-
"""阶段A 追加：difflib opcode 分类，区分「服务器独有(删除)」vs「改动(replace)」vs「本地新增(insert)」。
只要 delete 集合为空 → 说明服务器内容在本地全部有对应（仅被改写），无丢失功能。"""
import os, re, difflib

ROOT = r'D:\下载的文件\学习工作台'
TMP = r'C:\Users\ATM\AppData\Local\Temp\r72_precheck'
OUT = os.path.join(ROOT, 'tools', 'r72_engineer', 'stage_a_opcode.txt')

PAIRS = [('database.py','srv_database.py'),('schemas.py','srv_schemas.py'),
         ('routers/chat.py','srv_chat.py'),('routers/friends.py','srv_friends.py'),
         ('routers/groups.py','srv_groups.py')]

L = []
def w(s=''):
    L.append(str(s))

def lines(p, code_only):
    t = open(p, 'rb').read().decode('utf-8', 'ignore')
    out = []
    for ln in t.splitlines():
        s = ln.strip()
        if not s:
            continue
        if code_only and s.startswith('#'):
            continue
        out.append(s)
    return out

for rel, srv in PAIRS:
    lp = os.path.join(ROOT, 'server', rel.replace('/', os.sep))
    sp = os.path.join(TMP, srv)
    w('==================================================')
    w('FILE %s' % rel)
    for mode, code_only in [('ALL(含注释)', False), ('CODE(去整行注释)', True)]:
        sl, ll = lines(sp, code_only), lines(lp, code_only)
        sm = difflib.SequenceMatcher(a=sl, b=ll, autojunk=False)
        deletes, replaces, inserts = [], 0, 0
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == 'delete':
                deletes += sl[i1:i2]
            elif tag == 'replace':
                replaces += 1
            elif tag == 'insert':
                inserts += 1
        w('  [%s] server行=%d local行=%d | opcode: replace段=%d insert段=%d delete段=%d' %
          (mode, len(sl), len(ll), replaces, inserts, len(deletes)))
        if deletes:
            w('    ⚠️ DELETED(服务器独有，本地缺失) 行：')
            for d in deletes:
                w('      - ' + d)
        else:
            w('    ✓ delete 集合为空（无服务器独有内容）')
    w('')

open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('WROTE', OUT)
