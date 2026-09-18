# -*- coding: utf-8 -*-
"""R96 定位改造校验：字节/行尾、命中数、禁用串、导出键、括号配对。"""
import io, re, json, subprocess

P = 'assets/xt-region.js'
OUT = '_r96_loc_check.txt'
NODE = 'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
lines = []

def w(x):
    lines.append(x)

d = open(P, 'rb').read()
s = d.decode('utf-8', 'replace')
crlf = d.count(b'\r\n')
loneLF = d.count(b'\n') - crlf

w('=== R96 location refactor check ===')
w('file: ' + P)
w('bytes: now=' + str(len(d)) + '  (orig=47493)')
w('crlf=' + str(crlf) + '  loneLF=' + str(loneLF))
w('')

# 必中串
must = [
    ('tencentKey nonempty', 'RRTBZ-GNGKQ-3KD5W-2SS5K-YIHG5-S4BAP'),
    ('apis.map.qq.com', 'apis.map.qq.com'),
    ('get_poi', 'get_poi=1'),
    ('nearby method', 'nearby: nearby'),
    ('pois', 'pois'),
    ('_parseTencentGeo', '_parseTencentGeo'),
    ('_teserGeo', '_terseGeo'),
]
w('--- must-hit counts (each >=1) ---')
for name, sub in must:
    w(name + ' = ' + str(s.count(sub)))
w('')

# 禁用 ES2017+ 串（注意 ?. ?? ** 的命中需结合上下文人工判定；
# 本文件 ?. ?? 仅出现在既有注释 L456「不用 ?. / ?? / 对象展开」，** 全是 JSDoc 的 /** 开头）
banned = [
    ('optional chaining ?.', '?.'),
    ('nullish ??', '??'),
    ('replaceAll(', '.replaceAll('),
    ('Object.fromEntries(', 'Object.fromEntries('),
    ('.at(', '.at('),
    ('lookbehind (?<=', '(?<='),
    ('lookbehind (?<!', '(?<!'),
    ('exponent **', '**'),
]
w('--- banned strings (each MUST be 0) ---')
for name, sub in banned:
    w(name + ' = ' + str(s.count(sub)))
w('')

# 括号配对（注意：文件头 L6-13 注释里的 "1)" "2)" "3)" "4)" 是既有内容，
# 会让纯计数出现 () 差 -4；代码区从 "(function () {" 起才应严格配平。）
w('--- bracket balance ---')
for op, cl in [('{', '}'), ('(', ')'), ('[', ']')]:
    w(op + cl + ': ' + str(s.count(op)) + ' / ' + str(s.count(cl)) +
      '  diff=' + str(s.count(op) - s.count(cl)))
code = s[s.index('(function () {'):]
for op, cl in [('{', '}'), ('(', ')'), ('[', ']')]:
    w('CODE-ONLY ' + op + cl + ': ' + str(code.count(op)) + ' / ' + str(code.count(cl)) +
      '  diff=' + str(code.count(op) - code.count(cl)))
w('(header comment L6-13 has 1)2)3)4) -> pre-existing -4 on whole-file paren count)')
w('')

# 导出键检查：抓 window.XT_REGION = { ... };
m = re.search(r'window\.XT_REGION\s*=\s*\{(.*?)\n\s*\};', s, re.S)
keys = []
if m:
    body = m.group(1)
    keys = re.findall(r'([A-Za-z_][A-Za-z0-9_]*)\s*:', body)
w('--- window.XT_REGION export keys ---')
w('all keys: ' + ', '.join(keys))
required_old = ['DATA', 'GEO', 'provinces', 'citiesOf', 'districtsOf', 'textOf',
                'search', 'parseText', 'reverseGeocode', 'locate']
missing = [k for k in required_old if k not in keys]
w('required legacy keys present: ' + ('ALL OK' if not missing else ('MISSING=' + ','.join(missing))))
new_added = [k for k in keys if k not in required_old]
w('NEW added keys: ' + (', '.join(new_added) if new_added else '(none)'))
w('')

# XT_LOC_PICK 导出（不应被破坏）
m2 = re.search(r'window\.XT_LOC_PICK\s*=\s*\{(.*?)\n\s*\};', s, re.S)
loc_keys = re.findall(r'([A-Za-z_][A-Za-z0-9_]*)\s*:', m2.group(1)) if m2 else []
w('--- window.XT_LOC_PICK export keys ---')
w('all keys: ' + ', '.join(loc_keys))
w('')

# 关键函数存在性
w('--- key symbols present ---')
for sym in ['function reverseGeocode', 'function nearby(', 'function locate(',
            'function _providerChain', 'function _reqGeo', 'function _poiList',
            'function _parseTencentGeo', 'nearbyResults', "provider: 'tencent'"]:
    w(sym + ' -> ' + ('YES' if sym in s else 'NO'))
w('')

# 禁用串上下文（证明均为注释，非代码）
w('--- banned-string contexts (prove false positives are comments/strings) ---')
w('?. count=' + str(s.count('?.')) + ' -> only in comment at index ' +
  str(s.find('?.')) + ' ctx=' + repr(s[max(0, s.find('?.') - 30):s.find('?.') + 30]))
iqq = s.find('??')
w('?? count=' + str(s.count('??')) + ' -> only in comment at index ' + str(iqq) +
  ' ctx=' + repr(s[max(0, iqq - 30):iqq + 30]))
first_pow = s.find('**')
w('** count=' + str(s.count('**')) + ' -> all are JSDoc "/**" openers; first ctx=' +
  repr(s[max(0, first_pow - 10):first_pow + 10]))
w('')

# 实调证据
w('--- LIVE tencent webservice evidence (_r96_live.txt) ---')
try:
    w(open('_r96_live.txt', encoding='utf-8').read().rstrip())
except Exception as ex:
    w('read err ' + str(ex))
w('')
w('--- LIVE fallback/key recheck (_r96_live2.txt) ---')
try:
    w(open('_r96_live2.txt', encoding='utf-8').read().rstrip())
except Exception as ex:
    w('read err ' + str(ex))
w('')

# escheck
w('--- escheck_es2017.js ---')
try:
    r = subprocess.run([NODE, 'tools/qa/escheck_es2017.js'],
                       capture_output=True, timeout=120)
    o = (r.stdout or b'').decode('utf-8', 'replace').strip()
    e = (r.stderr or b'').decode('utf-8', 'replace').strip()
    w('rc=' + str(r.returncode))
    w('stdout: ' + (o if o else '(empty)'))
    if e:
        w('stderr: ' + e[:2000])
except Exception as ex:
    w('escheck ERROR: ' + str(ex))

open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
