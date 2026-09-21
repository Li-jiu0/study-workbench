# -*- coding: utf-8 -*-
"""抽取 HTML 内联 <script> 块，逐个跑 node --check（语法门槛）。"""
import io, re, os, subprocess, sys

NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_r11_inline_tmp.js')

pat = re.compile(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', re.S | re.I)

def check(path):
    s = io.open(path, encoding='utf-8').read()
    blocks = pat.findall(s)
    bad = 0
    for i, b in enumerate(blocks):
        if not b.strip():
            continue
        io.open(TMP, 'w', encoding='utf-8').write(b)
        r = subprocess.run([NODE, '--check', TMP], capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        if r.returncode != 0:
            bad += 1
            print('  [FAIL] block#%d (%d chars)' % (i, len(b)))
            print('   ', (r.stderr or '').strip().splitlines()[:6])
    print('%-22s blocks=%d  fail=%d' % (os.path.basename(path), len(blocks), bad))
    return bad

total = 0
for p in sys.argv[1:]:
    total += check(p)
try:
    os.remove(TMP)
except OSError:
    pass
print('TOTAL_FAIL =', total)
sys.exit(1 if total else 0)
