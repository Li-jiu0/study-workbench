# -*- coding: utf-8 -*-
import os, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
base = r'D:\下载的文件\学习工作台'
OUT = os.path.join(base, 'tools/qa', '_r92b_step_out.txt')
L = []
def w(s=''): L.append(str(s))
def read(rel): return open(os.path.join(base, rel), 'r', encoding='utf-8', errors='replace').read()

w('=== B线文件存在性/大小/行尾 ===')
for rel in ['assets/ai-config.js', 'AI模型对接文档.md']:
    fp = os.path.join(base, rel)
    ok = os.path.isfile(fp)
    data = open(fp, 'rb').read() if ok else b''
    crlf = data.count(b'\r\n')
    lone_lf = data.count(b'\n') - crlf
    w('%s exists=%s size=%d CRLF=%d loneLF=%d' % (rel, ok, len(data), crlf, lone_lf))

cfg = read('assets/ai-config.js')
w('')
w('=== B1 模型 id 命中核验 (ai-config.js) ===')
for mid in ['ark-seedance-1-5-pro', 'ark-seedance-1-0-lite-t2v', 'ark-seedance-1-0-lite-i2v']:
    w('  移除项 %s 命中=%d' % (mid, len(re.findall(re.escape(mid), cfg))))
w('')
w('  保留项 ark-seedance-1-0-pro 命中=%d' % len(re.findall(r'ark-seedance-1-0-pro', cfg)))
w('  保留项 ark-seedance-1-0-pro-fast 命中=%d' % len(re.findall(r'ark-seedance-1-0-pro-fast', cfg)))
w('  含 fallback 字段出现=%d' % len(re.findall(r'fallback', cfg)))

w('')
w('=== B1 保留条目上下文 ===')
for mid in ['ark-seedance-1-0-pro', 'ark-seedance-1-0-pro-fast']:
    for m in re.finditer(re.escape(mid), cfg):
        ln = cfg.count('\n', 0, m.start()) + 1
        w('  L%d: %s' % (ln, cfg[cfg.rfind('\n',0,m.start())+1:m.end()].split('\n')[0][:160]))

w('')
w('=== ai-config.js 结构探查 (导出/关键全局) ===')
for kw in ['builtinModels', 'BUILTIN_MODELS', 'AI_CONFIG', 'window.', 'var ', 'const ', 'module.exports']:
    w('  %s 命中=%d' % (kw, len(re.findall(re.escape(kw), cfg))))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(L))
print('WROTE', OUT)
