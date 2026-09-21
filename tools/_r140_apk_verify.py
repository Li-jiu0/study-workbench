# -*- coding: utf-8 -*-
"""R140 APK 包内硬断言（对齐 R7c/R10 的验收口径）。

校验项：
  A 版本：aapt2 dump badging → versionCode=41 / versionName=1.40
  B 白名单：build_apk.REQUIRED_ASSETS 全部在包内
  C 页面：包内 HTML 数量、关键新页（日志.html/更新.html/关于.html）
  D 内容：xt-update.js CURRENT_VERSION='1.40'
  E 安全：包内所有 .js 零明文 Gemini key（AQ. / AIza）
  F 新模型：ai-config.js 含 ark-seedream-5-0 / ark-hyper3d-gen2 / ark-seedance-1-0-pro
  G 戳：面测.html=20260925b、日志.html=20260925d、关于.html 的 xt-update.js=20260925a
  H resources.arsc 必须 STORED 且 4 字节对齐
"""
import io, os, re, sys, zipfile, subprocess

ROOT = r'D:\下载的文件\学习工作台'
APK = os.path.join(ROOT, '星途-安卓App.apk')
BT = r'C:\Users\ATM\android-build\sdk\build-tools\34.0.0'
AAPT2 = os.path.join(BT, 'aapt2.exe')

PASS = []
FAIL = []


def ck(name, ok, extra=''):
    (PASS if ok else FAIL).append(name)
    print('%s %s %s' % ('PASS' if ok else 'FAIL', name, extra))


# ---------- A 版本 ----------
badging = subprocess.run([AAPT2, 'dump', 'badging', APK],
                         capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
m = re.search(r"versionCode='(\d+)'", badging)
ck('A1 versionCode=41', bool(m) and m.group(1) == '41', '(got %s)' % (m.group(1) if m else '?'))
m = re.search(r"versionName='([^']+)'", badging)
ck('A2 versionName=1.40', bool(m) and m.group(1) == '1.40', '(got %s)' % (m.group(1) if m else '?'))
m = re.search(r"package: name='([^']+)'", badging)
ck('A3 package=com.study.workbench', bool(m) and m.group(1) == 'com.study.workbench')

zf = zipfile.ZipFile(APK)
names = zf.namelist()
nameset = set(names)

# ---------- B 白名单 ----------
sys.path.insert(0, os.path.join(ROOT, 'android'))
_src = io.open(os.path.join(ROOT, 'android', 'build_apk.py'), encoding='utf-8').read()
block = _src.split('REQUIRED_ASSETS = [', 1)[1].split(']', 1)[0]
req = re.findall(r'"([^"]+)"', block)
missing = [a for a in req if ('assets/assets/' + a) not in nameset]
ck('B1 REQUIRED_ASSETS 全在包内(%d项)' % len(req), not missing, ('缺: %s' % missing) if missing else '')
ck('B2 data/mock-papers.js 在包内', 'assets/data/mock-papers.js' in nameset)

# ---------- C 页面 ----------
htmls = [n for n in names if re.match(r'^assets/[^/]+\.html$', n)]
print('   包内 HTML 数 = %d' % len(htmls))
ck('C1 HTML 数量 >= 44', len(htmls) >= 44, '(%d)' % len(htmls))
for pg in ['日志.html', '更新.html', '关于.html', '数据管理.html', '面测.html', '表达.html', '私聊.html']:
    ck('C2 含页面 %s' % pg, ('assets/' + pg) in nameset)

# ---------- D xt-update ----------
xu = zf.read('assets/assets/xt-update.js').decode('utf-8', 'replace')
m = re.search(r"CURRENT_VERSION\s*=\s*'([^']*)'", xu)
ck('D1 CURRENT_VERSION=1.40', bool(m) and m.group(1) == '1.40', '(got %s)' % (m.group(1) if m else '?'))

# ---------- E 密钥 ----------
leak = []
for n in names:
    if n.endswith('.js'):
        b = zf.read(n)
        if b'AQ.' in b or b'AIza' in b:
            leak.append(n)
ck('E1 包内 .js 零明文 Gemini key', not leak, ('泄露: %s' % leak) if leak else '')

# ---------- F 新模型 ----------
ac = zf.read('assets/assets/ai-config.js').decode('utf-8', 'replace')
for mid in ['ark-seedream-5-0', 'ark-seedream-5-0-pro', 'ark-hyper3d-gen2',
            'ark-seedance-1-0-pro', 'ark-seed-2-1-pro-260628', 'ark-smart-router']:
    ck('F 模型 %s' % mid, ('"%s"' % mid) in ac)
# 注：ai-config.js 的注释里正当地提到 apiKey（说明历史），必须剥注释后按 CODE 判
_nc = re.sub(r'/\*[\s\S]*?\*/', '', ac)
_nc = re.sub(r'^\s*//.*$', '', _nc, flags=re.M)
ck('F2 剥注释后无 apiKey 赋值', 'apiKey' not in _nc)

# ---------- G 戳 ----------
def stamp_of(page, asset):
    t = zf.read('assets/' + page).decode('utf-8', 'replace')
    mm = re.search(re.escape(asset) + r'\?v=([0-9A-Za-z]+)', t)
    return mm.group(1) if mm else None

ck('G1 面测.html group-discussion.js=20260925b', stamp_of('面测.html', 'assets/group-discussion.js') == '20260925b',
   str(stamp_of('面测.html', 'assets/group-discussion.js')))
ck('G2 日志.html xt-log.js=20260925d', stamp_of('日志.html', 'assets/xt-log.js') == '20260925d',
   str(stamp_of('日志.html', 'assets/xt-log.js')))
ck('G3 关于.html xt-update.js=20260925a', stamp_of('关于.html', 'assets/xt-update.js') == '20260925a',
   str(stamp_of('关于.html', 'assets/xt-update.js')))
ck('G4 协议.html 含 V1.40', 'V1.40' in zf.read('assets/协议.html').decode('utf-8', 'replace'))

# ---------- H resources.arsc ----------
# 注意：zipalign 对齐的是「文件数据起点」= local header offset + 30 + name + extra，
# 不是 Python zipfile 的 header_offset（那是 local header 起点）——写错会假 FAIL。
import struct
info = zf.getinfo('resources.arsc')
with open(APK, 'rb') as _f:
    _f.seek(info.header_offset)
    _h = _f.read(30)
    _nl, _el = struct.unpack('<HH', _h[26:30])
data_off = info.header_offset + 30 + _nl + _el
ck('H1 resources.arsc STORED', info.compress_type == zipfile.ZIP_STORED, '(ctype=%d)' % info.compress_type)
ck('H2 resources.arsc 数据起点4字节对齐', data_off % 4 == 0, 'data_off=%d (%%4=%d)' % (data_off, data_off % 4))

print('')
print('TOTAL PASS=%d  FAIL=%d' % (len(PASS), len(FAIL)))
if FAIL:
    print('FAILED: ' + ', '.join(FAIL))
sys.exit(1 if FAIL else 0)
