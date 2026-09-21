# -*- coding: utf-8 -*-
"""R73n QA：node --check + 行尾 + 密钥误入检查 + 符号检查，结果落盘"""
import subprocess, io

ROOT = r'D:\下载的文件\学习工作台'
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
FILES = [ROOT + r'\assets\ai-service.js', ROOT + r'\assets\ai-settings.js']
out = []
ok = True

for f in FILES:
    r = subprocess.run([NODE, '--check', f], capture_output=True)
    name = f.split('\\')[-1]
    out.append('%s node --check rc=%d %s' % (name, r.returncode, r.stderr.decode('utf-8', 'ignore').strip()[:200]))
    if r.returncode != 0: ok = False
    raw = open(f, 'rb').read()
    crlf = raw.count(b'\r\n'); lone = raw.count(b'\n') - crlf
    out.append('%s 行尾: CRLF=%d loneLF=%d %s' % (name, crlf, lone, 'OK(LF)' if crlf == 0 else '!!! 应为 LF'))
    if crlf != 0: ok = False
    for pat in [b'<REDACTED-GEMINI-旧KEY前缀>', b'<REDACTED-OPENROUTER-旧KEY前缀>']:
        n = raw.count(pat)
        out.append('%s 密钥误入 %s: %d %s' % (name, pat.decode(), n, 'OK' if n == 0 else '!!!'))
        if n: ok = False

svc = open(FILES[0], 'rb').read().decode('utf-8')
for sym in ['HEALTH_TIMEOUT_PROXY', 'hTimeout', 'providerNeedProxy(mc.provider)']:
    n = svc.count(sym)
    out.append('ai-service.js 符号 %s: %d %s' % (sym, n, 'OK' if n else '!!! 缺失'))
    if not n: ok = False
st = open(FILES[1], 'rb').read().decode('utf-8')
for sym in ['平台可达但响应慢，检测超时', 'R73n']:
    n = st.count(sym)
    out.append('ai-settings.js 符号 %s: %d %s' % (sym, n, 'OK' if n else '!!! 缺失'))
    if not n: ok = False

out.append('RESULT: ' + ('PASS' if ok else 'FAIL'))
io.open(r'C:\Users\ATM\_r73n_qa.txt', 'w', encoding='utf-8').write('\n'.join(out))
print(out[-1])
