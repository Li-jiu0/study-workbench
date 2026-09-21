# -*- coding: utf-8 -*-
"""R73m 本地闸门：config.py 语法/行尾 + .env Key 值核对"""
import ast, io, sys

ROOT = r'D:\下载的文件\学习工作台\server'
out = []
ok = True

# 1) config.py 语法
p = ROOT + r'\config.py'
raw = open(p, 'rb').read()
try:
    ast.parse(raw.decode('utf-8'))
    out.append('config.py ast.parse OK, %d bytes' % len(raw))
except SyntaxError as e:
    out.append('!!! config.py 语法错误: %s' % e); ok = False
crlf = raw.count(b'\r\n'); lone = raw.count(b'\n') - crlf
out.append('config.py 行尾: CRLF=%d loneLF=%d %s' % (crlf, lone, 'OK' if lone == 0 else '!!! 非 CRLF'))
if lone != 0: ok = False

# 2) 关键符号存在
for sym in [b'"ark"', b'"qianfan"', b'ARK_API_KEY', b'QIANFAN_API_KEY',
            b'deepseek-v4-flash-ga-260731', b'ernie-4.5-turbo-32k']:
    if sym not in raw:
        out.append('!!! config.py 缺符号 %s' % sym.decode()); ok = False
out.append('config.py 关键符号: 全部存在' if ok else 'config.py 关键符号: 有缺失')

# 3) .env 核对
env = open(ROOT + r'\.env', 'rb').read().decode('utf-8')
checks = {
    'ARK_API_KEY': '<REDACTED-ARK-API-KEY>',
    'ZHIPU_API_KEY': '<REDACTED-ZHIPU-API-KEY>',
    'QIANFAN_API_KEY': '<REDACTED-QIANFAN-API-KEY>',
    'ARK_BASE_URL': 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    'QIANFAN_BASE_URL': 'https://qianfan.baidubce.com/v2/chat/completions',
}
for k, v in checks.items():
    line = [l for l in env.splitlines() if l.startswith(k + '=')]
    if not line:
        out.append('!!! .env 缺 %s' % k); ok = False
    elif line[0].split('=', 1)[1].strip() != v:
        out.append('!!! .env %s 值不符: %s' % (k, line[0][:60])); ok = False
    else:
        out.append('.env %s OK' % k)
sf = [l for l in env.splitlines() if l.startswith('SILICONFLOW_API_KEY=')]
if sf:
    out.append('!!! .env SILICONFLOW_API_KEY 仍为启用状态'); ok = False
else:
    out.append('.env 硅基流动未启用 OK')

out.append('RESULT: ' + ('PASS' if ok else 'FAIL'))
io.open(r'C:\Users\ATM\_r73m_local_check.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('RESULT: ' + ('PASS' if ok else 'FAIL'))
sys.exit(0 if ok else 1)
