# -*- coding: utf-8 -*-
"""调试：打印远程 env 中 ZHIPU/SILICONFLOW 行的原始字节"""
import io
raw = open(r'C:\Users\ATM\_r73m_remote_env.env', 'rb').read()
lines = raw.split(b'\n')
out = ['total %d bytes, %d lines' % (len(raw), len(lines))]
for i, ln in enumerate(lines):
    if b'ZHIPU' in ln or b'SILICONFLOW' in ln or b'ARK' in ln:
        out.append('line %d: %r' % (i, ln))
io.open(r'C:\Users\ATM\_r73m_dbg.txt', 'w', encoding='utf-8').write('\n'.join(out))
