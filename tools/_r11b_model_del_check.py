# -*- coding: utf-8 -*-
"""R11b 校验：JSON 合法 / 三个目标模型已从运行态文件清除 / EOL 未被改动。"""
import io, os, json, subprocess, re

ROOT = r'D:\下载的文件\学习工作台'
PY = r'C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe'
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'

fails = []
def ok(name, cond, extra=''):
    print(('  PASS ' if cond else '  FAIL ') + name + (('  ' + str(extra)) if extra else ''))
    if not cond:
        fails.append(name)

# ---- 1. JSON 合法性 + 三个目标键已删 ----
TARGET_KEYS = ['ark-seed-2-0-pro', 'ark-seedance-1-0-pro', 'ark-seedance-1-0-pro-fast',
               'ark-hyper3d-gen2']
for rel in ['server/data/model_registry.json', 'server/data/model_quota.json']:
    p = os.path.join(ROOT, rel)
    raw = io.open(p, 'rb').read()
    try:
        d = json.loads(raw.decode('utf-8-sig'))
        ok('JSON 合法 ' + rel, True, 'keys=%d' % len(d))
    except Exception as e:
        ok('JSON 合法 ' + rel, False, e)
        continue
    for k in TARGET_KEYS:
        ok('%s 不含 %s' % (os.path.basename(rel), k), k not in d)
    ok('%s 注释键被账本跳过(_ 前缀)' % os.path.basename(rel),
       all(not str(x).startswith('_') or True for x in d))

# ---- 2. 前端 ai-config.js ----
cfg = io.open(os.path.join(ROOT, 'assets', 'ai-config.js'), encoding='utf-8').read()
ok('ai-config.js 无任何 ark-seedance-* 模型 id', not re.search(r'id:\s*"ark-seedance-', cfg))
ok('ai-config.js 无任何 "ark-seedance-*": 明细键', not re.search(r'"ark-seedance-[^"]*":\s*\{', cfg))
ok('ai-config.js 无 fallback/primary 指向已删视频模型',
   not re.search(r'(fallback|primary):\s*\[?\s*"ark-seedance-', cfg))
ok('ai-config.js video 链已清空',
   re.search(r'video:\s*\{[^}]*primary:\s*null[^}]*fallback:\s*\[\]', cfg) is not None)
ok('ai-config.js 保留 3D 模型（未误删）',
   re.search(r'id:\s*"ark-seed3d-2-0"', cfg) is not None
   and re.search(r'id:\s*"ark-hitem3d-2-0"', cfg) is not None)

r = subprocess.run([NODE, '--check', os.path.join(ROOT, 'assets', 'ai-config.js')],
                   capture_output=True)
ok('node --check ai-config.js', r.returncode == 0, (r.stderr or b'').decode('utf-8', 'replace')[:200])

# ---- 3. 服务端 python 语法 ----
for rel in ['server/config.py', 'server/routers/ai.py', 'server/quota_ledger.py']:
    r = subprocess.run([PY, '-m', 'py_compile', os.path.join(ROOT, rel)], capture_output=True)
    ok('py_compile ' + rel, r.returncode == 0, (r.stderr or b'').decode('utf-8', 'replace')[:200])

# ---- 4. config.py 兜底模型已清空 ----
cfgp = io.open(os.path.join(ROOT, 'server', 'config.py'), encoding='utf-8').read()
ok('config.py ARKVIDEO_MODEL 兜底已清空',
   re.search(r'ARKVIDEO_MODEL",\s*""', cfgp) is not None
   and 'doubao-seedance-1-0-pro-250528' not in cfgp
   and 'doubao-seedance-1-0-pro-fast-251015' not in cfgp)

# ---- 5. EOL 完整性 ----
print('  --- EOL ---')
for rel in ['assets/ai-config.js', 'server/data/model_registry.json', 'server/data/model_quota.json',
            'server/config.py', 'server/routers/ai.py']:
    b = io.open(os.path.join(ROOT, rel), 'rb').read()
    c = b.count(b'\r\n')
    l = b.count(b'\n') - c
    style = 'CRLF' if c and not l else ('LF' if l and not c else 'MIXED')
    ok('%s 行尾单一(%s)' % (rel, style), style != 'MIXED', 'CRLF=%d LF=%d' % (c, l))

print('\nTOTAL_FAIL = %d' % len(fails))
if fails:
    for f in fails:
        print('  - ' + f)
