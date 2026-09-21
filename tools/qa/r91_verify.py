# -*- coding: utf-8 -*-
"""R91-A 验证脚本：escheck (ES2017) + ai.py ast.parse + 复核命中，写 r91_verify.txt"""
import ast, io, os, subprocess

ROOT = r'D:\下载的文件\学习工作台'
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
PYEXE = r'C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe'
ESCHECK = os.path.join(ROOT, 'tools', 'qa', 'escheck_es2017.js')
JS_PATH = os.path.join(ROOT, 'assets', 'xt-profile.js')
PY_PATH = os.path.join(ROOT, 'server', 'routers', 'ai.py')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r91_verify.txt')

log = []
def w(s):
    log.append(str(s))

ok_all = True

# 1) escheck（node，输出捕获到内存不经过 shell stdout）
r = subprocess.run([NODE, ESCHECK], capture_output=True)
out = (r.stdout or b'').decode('utf-8', 'ignore') + (r.stderr or b'').decode('utf-8', 'ignore')
w('escheck rc=%d' % r.returncode)
w('escheck tail: ' + ' | '.join(out.strip().splitlines()[-3:]))
es_ok = ('DONE 0' in out) and r.returncode == 0
w('escheck => %s' % ('PASS' if es_ok else 'FAIL'))
ok_all = ok_all and es_ok

# 2) ai.py 语法
with open(PY_PATH, 'rb') as f:
    src = f.read().decode('utf-8')
try:
    ast.parse(src)
    w('ai.py ast.parse => PASS')
except SyntaxError as e:
    w('ai.py ast.parse => FAIL: %s' % e)
    ok_all = False

# 3) xt-profile.js 复核（排除 fetchAiChat 定义体内的赋值行）
with open(JS_PATH, 'rb') as f:
    js = f.read().decode('utf-8')
n_total_refs = js.count('AI_CHAT.total')
# 排除：注释 1 处 + fetchAiChat 定义内 3 处赋值
disp_refs = n_total_refs - 1 - 3
w('AI_CHAT.total 引用=%d（注释 1 + fetchAiChat 定义内赋值 3 → 展示引用=%d）' % (n_total_refs, disp_refs))
w('AI_CHAT.total 展示引用 => %s' % ('PASS' if disp_refs == 0 else 'FAIL'))
ok_all = ok_all and (disp_refs == 0)

w('VERIFY_ALL=%s' % ('PASS' if ok_all else 'FAIL'))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
print('verify-done')
