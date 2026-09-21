# -*- coding: utf-8 -*-
"""R92-A 收尾修正：routeCapabilityModel 复用既有 capRunner()；xtRunCapability 同时挂 AI_SERVICE。"""
import os

ROOT = r'D:\下载的文件\学习工作台'
JS_PAGE = os.path.join(ROOT, 'assets', 'ai-page.js')
JS_SVC = os.path.join(ROOT, 'assets', 'ai-service.js')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r92a_edit_result.txt')

log = []
def w(s):
    log.append(str(s))

def eol_stats(data):
    crlf = data.count(b'\r\n')
    lone_cr = 0
    idx = 0
    while True:
        i = data.find(b'\r', idx)
        if i < 0:
            break
        if data[i+1:i+2] != b'\n':
            lone_cr += 1
        idx = i + 1
    return crlf, lone_cr

def rep(data, old, new, name):
    cnt = data.count(old)
    if cnt != 1:
        raise SystemExit('ABORT: %s count=%d' % (name, cnt))
    nd = data.replace(old, new, 1)
    w('[OK] %s (old %d B -> new %d B)' % (name, len(old), len(new)))
    return nd

# F1 ai-page.js：用 capRunner() 替代直接摸 window
with open(JS_PAGE, 'rb') as f:
    a0 = f.read()
c0, r0 = eol_stats(a0)
w('ai-page.js BEFORE: size=%d crlf=%d loneCR=%d' % (len(a0), c0, r0))
if c0 or r0:
    raise SystemExit('ABORT: ai-page.js 行尾非纯 LF')
f1_old = b"    var run = (typeof window !== 'undefined') ? window.xtRunCapability : null;\n"
f1_new = ("    var run = capRunner();   /* R92-A：\u590d\u7528\u65e2\u6709\u89e3\u6790\u5668\uff08AI_SERVICE.xtRunCapability \u4f18\u5148\uff0cwindow \u517c\u5bb9\u515c\u5e95\uff09 */\n").encode('utf-8')
a = rep(a0, f1_old, f1_new, 'F1 routeCapabilityModel -> capRunner()')
with open(JS_PAGE, 'wb') as f:
    f.write(a)
with open(JS_PAGE, 'rb') as f:
    a1 = f.read()
c1, r1 = eol_stats(a1)
w('ai-page.js AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(a1), c1, r1, len(a1)-len(a0)))
if c1 or r1 or a1 != a:
    raise SystemExit('ABORT: ai-page.js 写后校验失败')
w('[OK] ai-page.js 回读一致，纯 LF')

# F2 ai-service.js：AI_SERVICE 对象挂 xtRunCapability（capRunner 首选来源）
with open(JS_SVC, 'rb') as f:
    s0 = f.read()
sc0, sr0 = eol_stats(s0)
w('ai-service.js BEFORE: size=%d crlf=%d loneCR=%d' % (len(s0), sc0, sr0))
if sc0 or sr0:
    raise SystemExit('ABORT: ai-service.js 行尾非纯 LF')
f2_old = b'    usage: XT_AI_USAGE\n  };'
f2_new = b'''    usage: XT_AI_USAGE,
    // R92-A\uff1a\u80fd\u529b\u76f4\u8fde\u5165\u53e3\uff08\u5f02\u6b65\u80fd\u529b cap.run \u5206\u53d1\u5728 xtRunCapability \u5185\u90e8\u5b8c\u6210\uff09
    xtRunCapability: xtRunCapability
  };'''
s = rep(s0, f2_old, f2_new, 'F2 AI_SERVICE.xtRunCapability export')
with open(JS_SVC, 'wb') as f:
    f.write(s)
with open(JS_SVC, 'rb') as f:
    s1 = f.read()
sc1, sr1 = eol_stats(s1)
w('ai-service.js AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(s1), sc1, sr1, len(s1)-len(s0)))
if sc1 or sr1 or s1 != s:
    raise SystemExit('ABORT: ai-service.js 写后校验失败')
w('[OK] ai-service.js 回读一致，纯 LF')

# 命中核验（谓词按实际语义）
checks = [
    ('ai-page: routeCapabilityModel def =1', a1.count(b'function routeCapabilityModel(') == 1),
    ('ai-page: routeCapabilityModel hook call =1', a1.count(b'if (routeCapabilityModel(aiB, text, image))') == 1),
    ('ai-page: var CAP_MODEL_TYPES def =1', a1.count(b'var CAP_MODEL_TYPES') == 1),
    ('ai-page: capRunner() 复用（route 内）', a1.count(b'var run = capRunner();') == 1),
    ('ai-page: isCapabilityModel def =1', a1.count(b'function isCapabilityModel(') == 1),
    ('ai-page: i2v / i23d 各=1', a1.count(b"'i2v'") == 1 and a1.count(b"'i23d'") == 1),
    ('ai-page: createElement(\'video\') =1', a1.count(b"createElement('video')") == 1),
    ('ai-page: 原链路 callAI 调用保留 =1', a1.count(b'callAI(funcType, apiMessages, opts)') == 1),
    ('ai-svc: cap.run dispatch =1', s1.count(b'typeof cap.run === "function"') == 1),
    ('ai-svc: cap.run await =1', s1.count(b'await cap.run(') == 1),
    ('ai-svc: window.xtRunCapability 守卫导出 =2', s1.count(b'window.xtRunCapability') == 2),
    ('ai-svc: AI_SERVICE.xtRunCapability =1', s1.count(b'xtRunCapability: xtRunCapability') == 1),
    ('ai-svc: xtCallCapability 原链路保留 =1', s1.count(b'await xtCallCapability(cap, mc, capInput, o, sink)') == 1),
]
allpass = True
for name, ok in checks:
    w('[%s] %s' % ('PASS' if ok else 'FAIL', name))
    if not ok:
        allpass = False
w('FIX_ALL=%s' % ('PASS' if allpass else 'FAIL'))

with open(OUT, 'a', encoding='utf-8') as f:
    f.write('\n---- fixround ----\n' + '\n'.join(log))
print('fix-done')
